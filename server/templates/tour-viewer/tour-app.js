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

  var PSV = window.PhotoSphereViewer;
  // Stereo (headset) mode is built on the gyroscope plugin in this viewer
  // version, so it's only offered when both really loaded.
  var stereoAvailable = !!(PSV && PSV.StereoPlugin && PSV.GyroscopePlugin);

  var psvInstance = null;
  var galleryIndex = 0;
  var currentRoom = null;

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
  }

  function renderGallery(room) {
    hideNotice();
    showOnly('gallery');
    galleryIndex = 0;
    function render() {
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

    try {
      if (psvInstance) {
        var pending = psvInstance.setPanorama(room.panoUrl);
        if (pending && pending.catch) pending.catch(fallBack);
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
        defaultZoomLvl: 0,
        plugins: stereoAvailable ? [PSV.GyroscopePlugin, PSV.StereoPlugin] : [],
      });
      psvInstance.addEventListener('panorama-error', function (e) { fallBack(e && e.error); });
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

  function selectRoom(room) {
    currentRoom = room;
    subtitleEl.textContent = room.mode === 'panorama' ? '360° panorama' : (room.photos.length + ' photos · basic tour');
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

  fetch('./tour.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      loadingEl.style.display = 'none';
      var rooms = data.rooms || [];
      if (rooms.length === 0) {
        emptyEl.style.display = 'flex';
        return;
      }
      document.getElementById('tour-title').textContent = data.title || document.title;
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
        chip.onclick = function () { selectRoom(room); };
        roomBar.appendChild(chip);
      });
      selectRoom(rooms[0]);
    })
    .catch(function (err) {
      console.error('[tour] could not load tour.json:', err);
      fail('Could not load this tour (' + (err && err.message ? err.message : 'unknown error') + ')');
    });
})();
