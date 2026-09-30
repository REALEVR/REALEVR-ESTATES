/*
 * RealEVR phone-captured tour runtime. Loaded by every generated tour's
 * index.html from the bucket's tour-viewer/current/ folder, so fixing or
 * improving the viewer here reaches ALL such tours at once - no per-tour
 * re-publish needed. Depends on psv-viewer.js (Photo Sphere Viewer + its
 * three.js, bundled together, exposing window.PhotoSphereViewer).
 *
 * Design rule: this page must never fail silently. A previous version threw
 * while creating the viewer and wrote its error into an element it had
 * already hidden, so visitors just saw a black screen. Every failure path
 * below ends in something visible: the flat panorama photo, or a message.
 */
(function () {
  'use strict';
  window.__tourAppLoaded = true;

  var $ = function (id) { return document.getElementById(id); };
  var viewerEl = $('viewer');
  var galleryEl = $('gallery');
  var galleryImg = $('gallery-img');
  var galleryCounter = $('gallery-counter');
  var flatEl = $('flat');
  var flatImg = $('flat-img');
  var noticeEl = $('notice');
  var roomBar = $('room-bar');
  var loadingEl = $('loading');
  var emptyEl = $('empty');
  var subtitleEl = $('room-subtitle');
  var rootEl = $('tour-root');
  var titleBar = $('title-bar');

  var reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var PSV = window.PhotoSphereViewer;
  // Stereo (headset) mode is built on the gyroscope plugin in this viewer
  // version, so it's only offered when both really loaded.
  var stereoAvailable = !!(PSV && PSV.StereoPlugin && PSV.GyroscopePlugin);

  var psvInstance = null;
  var galleryIndex = 0;
  var currentRoom = null;
  var rooms = [];
  var firstReveal = true;
  var userTookControl = false;

  // ---- Presentation: the "private viewing" layer ------------------------
  // Purely cosmetic and added from here so the per-tour HTML shell stays
  // thin. Nothing below is allowed to keep the visitor from the tour: every
  // overlay has a timer that removes it no matter what else fails.
  var introEl = null;
  var introShownAt = 0;
  var curtainEl = null;
  var curtainTimer = null;
  var pagerCount = null;

  function buildIntro(title) {
    introEl = document.createElement('div');
    introEl.id = 'intro';
    introEl.setAttribute('role', 'presentation');
    var eyebrow = document.createElement('div'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'Private viewing';
    var rule = document.createElement('div'); rule.className = 'rule';
    var h = document.createElement('h2'); h.textContent = title;
    var by = document.createElement('div'); by.className = 'presented'; by.textContent = 'Presented by RealEVR Estates';
    var hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Tap to enter';
    introEl.appendChild(eyebrow); introEl.appendChild(rule); introEl.appendChild(h); introEl.appendChild(by); introEl.appendChild(hint);
    introEl.onclick = function () { removeIntro(); };
    rootEl.appendChild(introEl);
    introShownAt = Date.now();
    // Safety net: never trap the visitor behind the title card.
    setTimeout(removeIntro, 9000);
  }

  function removeIntro() {
    if (!introEl) return;
    var el = introEl;
    introEl = null;
    el.classList.add('out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1000);
  }

  // Called once a room is actually on screen. Holds the title card for a
  // beat (so it reads as intentional rather than a flash) and then lifts it.
  function roomIsVisible(onShown) {
    hideCurtain();
    if (!introEl) { if (onShown) onShown(); return; }
    var minimum = reducedMotion ? 300 : 2200;
    var wait = Math.max(0, minimum - (Date.now() - introShownAt));
    setTimeout(function () {
      removeIntro();
      if (onShown) onShown();
    }, wait);
  }

  function showCurtain(then) {
    if (!curtainEl) {
      curtainEl = document.createElement('div');
      curtainEl.id = 'curtain';
      rootEl.appendChild(curtainEl);
    }
    curtainEl.classList.add('on');
    clearTimeout(curtainTimer);
    // Safety net: a room that never finishes loading still gets un-blacked.
    curtainTimer = setTimeout(hideCurtain, 6000);
    setTimeout(then, reducedMotion ? 0 : 260);
  }
  function hideCurtain() {
    clearTimeout(curtainTimer);
    if (curtainEl) curtainEl.classList.remove('on');
  }

  // ---- Slow drift: the room turns by itself until the visitor takes over.
  var drifting = false;
  var lastFrame = 0;
  function stopDrift() { drifting = false; }
  function takeControl() { userTookControl = true; stopDrift(); }
  function startDrift() {
    if (reducedMotion || userTookControl || drifting || !psvInstance) return;
    drifting = true;
    lastFrame = performance.now();
    requestAnimationFrame(driftStep);
  }
  function driftStep(now) {
    if (!drifting || !psvInstance) { drifting = false; return; }
    var dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    try {
      var pos = psvInstance.getPosition();
      psvInstance.rotate({ yaw: pos.yaw + 0.055 * dt, pitch: pos.pitch });
    } catch (err) { drifting = false; return; }
    requestAnimationFrame(driftStep);
  }
  ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (name) {
    viewerEl.addEventListener(name, takeControl, { passive: true });
  });

  function fail(message) {
    loadingEl.style.display = 'none';
    emptyEl.textContent = message;
    emptyEl.style.display = 'flex';
  }

  function showNotice(message) {
    noticeEl.textContent = message;
    noticeEl.style.display = 'block';
  }
  function hideNotice() { noticeEl.style.display = 'none'; }

  function showOnly(which) {
    viewerEl.style.display = which === 'viewer' ? 'block' : 'none';
    galleryEl.style.display = which === 'gallery' ? 'flex' : 'none';
    flatEl.style.display = which === 'flat' ? 'block' : 'none';
  }

  // three.js needs WebGL2. Checked up front so a device without it gets the
  // flat fallback immediately instead of a viewer that can't draw.
  function webgl2Available() {
    try {
      var canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch (err) {
      return false;
    }
  }

  function destroyViewer() {
    if (!psvInstance) return;
    try { psvInstance.destroy(); } catch (err) { /* already gone */ }
    psvInstance = null;
  }

  // The panorama as a plain wide photo the visitor can scroll sideways.
  // Not 3D, but the room is still visible and the tour still usable.
  function renderFlatPanorama(room, reason) {
    destroyViewer();
    showOnly('flat');
    flatImg.src = room.panoUrl;
    flatEl.scrollLeft = 0;
    showNotice(reason);
    roomIsVisible();
  }

  function renderGallery(room) {
    hideNotice();
    showOnly('gallery');
    galleryIndex = 0;
    function render() {
      galleryImg.onload = function () { roomIsVisible(); };
      galleryImg.onerror = function () { roomIsVisible(); };
      galleryImg.src = room.photos[galleryIndex];
      galleryCounter.textContent = (galleryIndex + 1) + ' / ' + room.photos.length;
    }
    render();
    document.querySelector('.gallery-nav.prev').onclick = function () {
      galleryIndex = (galleryIndex - 1 + room.photos.length) % room.photos.length;
      render();
    };
    document.querySelector('.gallery-nav.next').onclick = function () {
      galleryIndex = (galleryIndex + 1) % room.photos.length;
      render();
    };
  }

  function renderPanorama(room) {
    hideNotice();

    if (!PSV || !PSV.Viewer || !webgl2Available()) {
      renderFlatPanorama(room, 'Interactive 360° isn’t available on this device, so you’re seeing the flat photo. Swipe sideways to look around.');
      return;
    }

    showOnly('viewer');

    function fallBack(err) {
      if (err) console.error('[tour] panorama failed:', err);
      // Only fall back if this room is still the one on screen.
      if (currentRoom === room) {
        renderFlatPanorama(room, 'The 360° view couldn’t start, so you’re seeing the flat photo. Swipe sideways to look around.');
      }
    }

    // The room has loaded: lift the curtain, and on the very first one
    // glide in from a slightly tight view before settling into a slow drift.
    function arrived() {
      if (currentRoom !== room) return;
      roomIsVisible(function () {
        if (currentRoom !== room || !psvInstance) return;
        if (firstReveal && !reducedMotion) {
          firstReveal = false;
          try {
            var glide = psvInstance.animate({ yaw: psvInstance.getPosition().yaw + 0.5, pitch: 0, zoom: 0, speed: 2600 });
            if (glide && glide.then) { glide.then(startDrift, startDrift); return; }
          } catch (err) { /* fall through to a plain drift */ }
        }
        firstReveal = false;
        startDrift();
      });
    }

    try {
      if (psvInstance) {
        stopDrift();
        var pending = psvInstance.setPanorama(room.panoUrl);
        if (pending && pending.then) pending.then(arrived, fallBack);
        return;
      }
      psvInstance = new PSV.Viewer({
        container: viewerEl,
        panorama: room.panoUrl,
        // 'gyroscope' lets a phone look around by moving it; 'stereo' adds
        // the headset button (split-screen VR, Cardboard style). Only
        // listed when the plugins really loaded, so the navbar never
        // advertises a button that can't work. Gyroscope must come first:
        // stereo depends on it.
        navbar: stereoAvailable ? ['zoom', 'gyroscope', 'stereo', 'fullscreen'] : ['zoom', 'fullscreen'],
        defaultZoomLvl: reducedMotion ? 0 : 55,
        plugins: stereoAvailable ? [PSV.GyroscopePlugin, PSV.StereoPlugin] : [],
      });
      psvInstance.addEventListener('panorama-error', function (e) { fallBack(e && e.error); });
      psvInstance.addEventListener('panorama-loaded', arrived);
    } catch (err) {
      fallBack(err);
    }
  }

  // Lets an "Enter VR" button in our own wrapping UI (VirtualTourModal.tsx/
  // VirtualTour.tsx, via client/src/lib/tourVr.ts) trigger the same stereo
  // mode as the plugin's own navbar icon. No-op unless a real 360 room with
  // the plugin loaded is on screen.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.source !== 'realevr-tour' || data.action !== 'enter-vr') return;
    if (!stereoAvailable || !psvInstance || !currentRoom || currentRoom.mode !== 'panorama') return;
    try {
      var stereoPlugin = psvInstance.getPlugin(PSV.StereoPlugin);
      if (stereoPlugin) stereoPlugin.toggle();
    } catch (err) {
      // Best-effort - the visible navbar button still works.
    }
  });

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // Go to a room, dipping through the curtain when one is already showing.
  function switchRoom(room) {
    if (room === currentRoom) return;
    if (firstReveal && introEl) { selectRoom(room); return; }
    showCurtain(function () { selectRoom(room); });
  }
  function stepRoom(delta) {
    if (rooms.length < 2) return;
    var index = rooms.indexOf(currentRoom);
    switchRoom(rooms[(index + delta + rooms.length) % rooms.length]);
  }

  function selectRoom(room) {
    currentRoom = room;
    var index = rooms.indexOf(room);
    subtitleEl.textContent = room.name + ' · ' + (room.mode === 'panorama' ? '360°' : (room.photos.length + ' photos'));
    if (pagerCount) pagerCount.innerHTML = '<b>' + pad(index + 1) + '</b> / ' + pad(rooms.length);
    Array.prototype.forEach.call(roomBar.children, function (chip) {
      var active = chip.dataset.slug === room.slug;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    if (room.mode === 'panorama') {
      renderPanorama(room);
    } else {
      renderGallery(room);
    }
  }

  // Title-bar polish, the room pager and the entrance card.
  function buildChrome(title) {
    var titleEl = $('tour-title');
    var wrap = document.createElement('div');
    wrap.className = 'title-text';
    var eyebrow = document.createElement('div');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Private viewing';
    titleBar.insertBefore(wrap, titleBar.firstChild);
    wrap.appendChild(eyebrow);
    wrap.appendChild(titleEl);
    wrap.appendChild(subtitleEl);

    if (rooms.length > 1) {
      var pager = document.createElement('div');
      pager.id = 'room-pager';
      pager.style.display = 'flex';
      var prev = document.createElement('button'); prev.type = 'button'; prev.setAttribute('aria-label', 'Previous room'); prev.innerHTML = '&#8249;';
      var next = document.createElement('button'); next.type = 'button'; next.setAttribute('aria-label', 'Next room'); next.innerHTML = '&#8250;';
      pagerCount = document.createElement('span'); pagerCount.className = 'count';
      prev.onclick = function () { stepRoom(-1); };
      next.onclick = function () { stepRoom(1); };
      pager.appendChild(prev); pager.appendChild(pagerCount); pager.appendChild(next);
      titleBar.appendChild(pager);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') stepRoom(-1);
        else if (e.key === 'ArrowRight') stepRoom(1);
      });
    }
    buildIntro(title);
  }

  fetch('./tour.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      loadingEl.style.display = 'none';
      rooms = data.rooms || [];
      if (rooms.length === 0) {
        emptyEl.style.display = 'flex';
        return;
      }
      var tourTitle = data.title || document.title;
      document.getElementById('tour-title').textContent = tourTitle;
      buildChrome(tourTitle);
      rooms.forEach(function (room) {
        var chip = document.createElement('button');
        chip.className = 'room-chip';
        chip.textContent = room.name;
        chip.dataset.slug = room.slug;
        if (room.qualityTier === 'photo_sweep_lite') {
          var badge = document.createElement('span');
          badge.className = 'badge';
          badge.textContent = 'basic';
          chip.appendChild(badge);
        } else if (room.qualityTier === 'equirect_360' && stereoAvailable) {
          // Honest labeling: only a real 360 room with the stereo plugin
          // actually loaded can be viewed in a headset.
          var vrBadge = document.createElement('span');
          vrBadge.className = 'badge';
          vrBadge.textContent = 'VR';
          chip.appendChild(vrBadge);
        }
        chip.onclick = function () { switchRoom(room); };
        roomBar.appendChild(chip);
      });
      selectRoom(rooms[0]);
    })
    .catch(function (err) {
      console.error('[tour] could not load tour.json:', err);
      fail('Could not load this tour (' + (err && err.message ? err.message : 'unknown error') + ')');
    });
})();
