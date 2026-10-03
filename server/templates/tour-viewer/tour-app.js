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
  var roomsBySlug = {};
  // ?edit=1 turns the tour into the door editor shown by the platform when an
  // agent connects the rooms (see client TourLinkEditor); nothing is saved from
  // here, the changes are posted to the page that embeds it.
  var editMode = /[?&]edit=1(&|$)/.test(window.location.search);
  var editLinks = {};
  var pendingArrival = null;
  // Milliseconds of dissolve for the next panorama switch (0 = hard cut). Set by switchRoom, consumed by renderPanorama.
  var pendingFade = 0;
  var preloaded = {};
  var firstReveal = true;
  var userTookControl = false;
  // Guided walk-through state (see the "Guided walk-through" section below).
  var autoWalk = { active: false, paused: false, started: false, run: 0, visited: {}, timers: [], bar: null, text: null, count: null, toggle: null, caption: null, captionTimer: 0 };

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
  function takeControl() { userTookControl = true; stopDrift(); if (autoWalk.active) stopWalk('user'); }
  function startDrift() {
    if (editMode || reducedMotion || userTookControl || drifting || !psvInstance || autoWalk.active) return;
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
    // Tell the page showing this tour, which lets the platform check it and alert the administrators.
    if (!editMode) {
      try { window.parent.postMessage({ type: 'realevr-tour-failed', message: String(message).slice(0, 200) }, '*'); } catch (err) { /* not in a frame */ }
    }
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


  // ---- Doors: blinking hotspots that lead to the next room ----------------
  // A link is { to, yaw, pitch, arrivalYaw, thumb } in degrees (see
  // server/tour-links.ts). Each one is drawn as an HTML button laid over the
  // panorama and re-positioned from the viewer's own projection whenever the
  // view moves, so it stays glued to its doorway. Tapping (or hovering, with a
  // mouse) opens a small preview of the room behind it; "Walk in" goes there.
  var hotspotLayer = null;
  var hotspots = [];
  var hotspotFrame = 0;
  var RAD = Math.PI / 180;

  function linksFor(room) {
    return editMode ? (editLinks[room.slug] || []) : (room.links || []);
  }
  function normYaw(deg) { return ((((deg + 180) % 360) + 360) % 360) - 180; }

  function svgIcon(kind) {
    return kind === 'arrow'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15l7-7 7 7"/><path d="M5 21l7-7 7 7" opacity=".55"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21"/><path d="M3 21h18"/><circle cx="14.5" cy="12.5" r=".9" fill="currentColor"/></svg>';
  }

  function clearHotspots() {
    hotspots = [];
    if (hotspotLayer) { hotspotLayer.innerHTML = ''; hotspotLayer.classList.remove('walking'); }
  }

  // Quietly fetch the rooms behind this room's doors, so walking through one is a dissolve
  // into an image that is already here rather than a wait. Skipped on data-saver connections.
  function preloadNeighbours(room) {
    if (editMode || !room) return;
    try { if (navigator.connection && navigator.connection.saveData) return; } catch (err) { /* fine */ }
    var run = function () {
      linksFor(room).forEach(function (l) {
        var t = roomsBySlug[l.to];
        if (!t || t.mode !== 'panorama' || !t.panoUrl || preloaded[t.panoUrl]) return;
        preloaded[t.panoUrl] = 1;
        // Prefer the viewer's own preload (it keeps the decoded image, which is what makes the
        // dissolve start at once); a plain fetch at least warms the browser cache.
        try {
          var loader = psvInstance && psvInstance.textureLoader;
          var pending = loader && loader.preloadPanorama ? loader.preloadPanorama(t.panoUrl) : fetch(t.panoUrl, { credentials: 'omit' });
          if (pending && pending.catch) pending.catch(function () { delete preloaded[t.panoUrl]; });
        } catch (err) { delete preloaded[t.panoUrl]; }
      });
    };
    (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(run);
  }

  function closeCards(except) {
    hotspots.forEach(function (h) { if (h.el !== except) h.el.classList.remove('open'); });
  }

  function renderHotspots(room) {
    clearHotspots();
    if (!psvInstance || !room || room.mode !== 'panorama') return;
    if (!hotspotLayer) {
      hotspotLayer = document.createElement('div');
      hotspotLayer.id = 'hotspots';
      rootEl.appendChild(hotspotLayer);
    }
    linksFor(room).forEach(function (link) {
      var target = roomsBySlug[link.to];
      if (!target) return;
      var el = document.createElement('div');
      el.className = 'hs';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hs-btn';
      btn.setAttribute('aria-label', (editMode ? 'Door to ' : 'Go to ') + target.name);
      btn.innerHTML = svgIcon(link.pitch < -25 ? 'arrow' : 'door');
      el.appendChild(btn);

      var label = document.createElement('span');
      label.className = 'hs-label';
      label.textContent = target.name;
      el.appendChild(label);

      if (!editMode) {
        var card = document.createElement('div');
        card.className = 'hs-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-label', 'Preview of ' + target.name);
        if (link.thumb) {
          var img = document.createElement('img');
          img.alt = '';
          img.loading = 'lazy';
          img.src = link.thumb;
          card.appendChild(img);
        }
        var meta = document.createElement('div');
        meta.className = 'hs-meta';
        var name = document.createElement('div');
        name.className = 'hs-name';
        name.textContent = target.name;
        var go = document.createElement('button');
        go.type = 'button';
        go.className = 'hs-go';
        go.textContent = 'Walk in →';
        go.onclick = function (e) { e.stopPropagation(); walkThrough(link); };
        meta.appendChild(name);
        meta.appendChild(go);
        card.appendChild(meta);
        el.appendChild(card);

        // A mouse previews the room on hover; any click or tap on the door walks straight in,
        // the way a professional tour does (no second tap to confirm).
        el.addEventListener('pointerenter', function (e) {
          if (e.pointerType === 'mouse') { closeCards(el); el.classList.add('open'); scheduleHotspots(); }
        });
        el.addEventListener('pointerleave', function (e) {
          if (e.pointerType === 'mouse') el.classList.remove('open');
        });
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          walkThrough(link, el);
        });
        btn.addEventListener('focus', function () {
          var keyboard = false;
          try { keyboard = btn.matches(':focus-visible'); } catch (err) { /* old browser: stay closed */ }
          if (keyboard) { closeCards(el); el.classList.add('open'); scheduleHotspots(); }
        });
      }

      hotspotLayer.appendChild(el);
      hotspots.push({ el: el, link: link });
    });
    updateHotspots();
  }

  function scheduleHotspots() {
    if (hotspotFrame) return;
    hotspotFrame = requestAnimationFrame(function () { hotspotFrame = 0; updateHotspots(); });
  }

  function updateHotspots() {
    if (!psvInstance || hotspots.length === 0) return;
    var pos, size;
    try { pos = psvInstance.getPosition(); size = psvInstance.getSize(); } catch (err) { return; }
    hotspots.forEach(function (h) {
      var yaw = h.link.yaw * RAD;
      var pitch = h.link.pitch * RAD;
      // Angle between where the viewer is looking and the door; past ~75° it is beside or behind us.
      var cos = Math.sin(pos.pitch) * Math.sin(pitch) + Math.cos(pos.pitch) * Math.cos(pitch) * Math.cos(pos.yaw - yaw);
      var at = null;
      if (cos > 0.25) {
        try { at = psvInstance.dataHelper.sphericalCoordsToViewerCoords({ yaw: yaw, pitch: pitch }); } catch (err) { at = null; }
      }
      var visible = !!at && at.x > -30 && at.y > -30 && at.x < size.width + 30 && at.y < size.height + 30;
      h.el.classList.toggle('off', !visible);
      if (!visible) return;
      h.el.style.transform = 'translate3d(' + at.x + 'px,' + at.y + 'px,0)';
      // Keep an open preview on screen: flip it below the door near the top, and nudge it sideways at the edges.
      h.el.classList.toggle('below', at.y < 270);
      var half = 118;
      var shift = at.x < half + 8 ? half + 8 - at.x : (at.x > size.width - half - 8 ? size.width - half - 8 - at.x : 0);
      h.el.style.setProperty('--hs-shift', shift + 'px');
    });
  }

  // Walk through a door, as one continuous move: the camera turns to the door and pushes toward
  // it while the other doors fade away; before that push ends the next room dissolves in from a
  // tight view and opens out, facing away from the door you came through. No black frame between.
  var walking = false;
  function walkThrough(link, doorEl, auto) {
    var target = roomsBySlug[link.to];
    if (!target || target === currentRoom || walking) return;
    if (!auto && autoWalk.active) stopWalk('user');
    closeCards();
    stopDrift();
    userTookControl = true;
    walking = true;
    if (hotspotLayer) hotspotLayer.classList.add('walking');
    if (doorEl) doorEl.classList.add('go');
    var gone = false;
    function go() {
      if (gone) return;
      gone = true;
      walking = false;
      switchRoom(target, { arrivalYaw: link.arrivalYaw || 0, fade: 900, auto: !!auto });
    }
    if (psvInstance && !reducedMotion && currentRoom && currentRoom.mode === 'panorama' && target.mode === 'panorama') {
      try {
        psvInstance.animate({ yaw: link.yaw * RAD, pitch: link.pitch * RAD, zoom: 78, speed: 1000 });
        setTimeout(go, 480);
        return;
      } catch (err) { /* just go */ }
    }
    go();
  }

  // ---- Guided walk-through ---------------------------------------------------
  // The tour plays itself like a cinematic walk-through: in each room the camera looks around, turns
  // to the next doorway, pushes through it, and the next room dissolves in facing away from the door
  // (the same walkThrough() a visitor triggers by hand). It follows the doors the agent connected,
  // and visits any room no door leads to by dissolving straight into it, so every 360 room is seen once.
  // It starts by itself on a visitor's first view and ends the moment they touch the tour
  // (drag, scroll, key, door, room chip). "Walk me through" plays it again. ?walk=0 turns the autostart off.
  function walkLater(ms, fn) {
    var run = autoWalk.run;
    var id = setTimeout(function () {
      if (!autoWalk.active || autoWalk.paused || run !== autoWalk.run) return;
      fn();
    }, ms);
    autoWalk.timers.push(id);
  }
  function walkClear() {
    autoWalk.timers.forEach(clearTimeout);
    autoWalk.timers = [];
    clearTimeout(autoWalk.captionTimer);
  }
  function walkRoutePanoramas() {
    return rooms.filter(function (r) { return r.mode === 'panorama' && r.panoUrl; });
  }
  function walkCanRun() {
    return !editMode && !!psvInstance && walkRoutePanoramas().length > 1;
  }
  // The next stop: an unvisited room through one of this room's doors, else the next unvisited room in tour order.
  function walkPlanNext(room) {
    var links = linksFor(room);
    for (var i = 0; i < links.length; i++) {
      var t = roomsBySlug[links[i].to];
      if (t && t.mode === 'panorama' && t.panoUrl && !autoWalk.visited[t.slug]) return { link: links[i], target: t };
    }
    var all = walkRoutePanoramas();
    for (var j = 0; j < all.length; j++) {
      if (!autoWalk.visited[all[j].slug]) return { target: all[j] };
    }
    return null;
  }
  function walkVisitedCount() { return Object.keys(autoWalk.visited).length; }

  function walkSetBar(state, room) {
    if (!autoWalk.bar) return;
    var total = walkRoutePanoramas().length;
    autoWalk.bar.setAttribute('data-state', state);
    if (state === 'playing' || state === 'paused') {
      autoWalk.text.innerHTML = '<span class="wb-pre">' + (state === 'paused' ? 'Paused · ' : 'Walking through · ') + '</span>';
      autoWalk.text.appendChild(document.createTextNode(room ? room.name : ''));
      autoWalk.count.textContent = Math.min(walkVisitedCount(), total) + ' / ' + total;
      autoWalk.toggle.textContent = state === 'paused' ? 'Resume' : 'Pause';
      autoWalk.toggle.setAttribute('aria-label', state === 'paused' ? 'Resume the walk-through' : 'Pause the walk-through');
    } else if (state === 'done') {
      autoWalk.text.textContent = 'That is the whole home';
      autoWalk.count.textContent = '';
    } else {
      autoWalk.text.textContent = 'Walk me through';
      autoWalk.count.textContent = '';
    }
  }
  // The room's name, large, for a moment as you arrive.
  function walkCaption(room) {
    if (!autoWalk.caption || !room) return;
    autoWalk.caption.textContent = room.name;
    autoWalk.caption.classList.add('on');
    clearTimeout(autoWalk.captionTimer);
    autoWalk.captionTimer = setTimeout(function () { autoWalk.caption.classList.remove('on'); }, 2600);
  }

  // The guided walk-through is switched off for now (no button, no autostart). Set this to true to bring it back.
  var WALK_ENABLED = false;

  // A room is on screen and settled: start the walk if it is due, or carry on with it.
  function walkRoomShown(room) {
    if (!WALK_ENABLED || editMode || !room || room.mode !== 'panorama') return;
    if (!autoWalk.started && !autoWalk.active) {
      autoWalk.started = true;
      var optedOut = /[?&]walk=0(&|$)/.test(window.location.search);
      if (!optedOut && !reducedMotion && !userTookControl && walkCanRun()) startWalk();
      return;
    }
    if (autoWalk.active && !autoWalk.paused) walkStep(room);
  }

  function walkStep(room) {
    if (!autoWalk.active || autoWalk.paused || !psvInstance || currentRoom !== room) return;
    var run = autoWalk.run;
    autoWalk.visited[room.slug] = true;
    walkSetBar('playing', room);
    walkCaption(room);
    var plan = walkPlanNext(room);
    if (!plan) { finishWalk(); return; }

    var pos;
    try { pos = psvInstance.getPosition(); } catch (err) { stopWalk('error'); return; }
    var doorYaw = plan.link ? plan.link.yaw * RAD : pos.yaw + 1.9;
    var doorPitch = plan.link ? plan.link.pitch * RAD : 0;
    // Look the other way round first, so the room is seen before we head for the door.
    var side = (room.slug.length + walkVisitedCount()) % 2 ? 1 : -1;
    var lead = doorYaw - side * 0.95;

    function advance() {
      if (run !== autoWalk.run || !autoWalk.active || autoWalk.paused) return;
      if (plan.link) walkThrough(plan.link, null, true);
      else switchRoom(plan.target, { fade: 1100, auto: true });
    }
    if (reducedMotion) { walkLater(3600, advance); return; }

    function toDoor() {
      if (run !== autoWalk.run || !autoWalk.active || autoWalk.paused) return;
      try {
        var turn = psvInstance.animate({ yaw: doorYaw, pitch: doorPitch * 0.5, zoom: 30, speed: 2300 });
        if (turn && turn.then) turn.then(function () { walkLater(350, advance); }, function () {});
        else walkLater(2700, advance);
      } catch (err) { walkLater(1200, advance); }
    }
    try {
      var sweep = psvInstance.animate({ yaw: lead, pitch: 0.03, zoom: 10, speed: 3300 });
      if (sweep && sweep.then) sweep.then(function () { walkLater(250, toDoor); }, function () {});
      else walkLater(3300, toDoor);
    } catch (err) { walkLater(800, toDoor); }
    // A safety net: whatever happens to the animations, the walk moves on.
    walkLater(11000, advance);
  }

  function startWalk() {
    if (!walkCanRun()) return;
    walkClear();
    autoWalk.run++;
    autoWalk.active = true;
    autoWalk.paused = false;
    autoWalk.started = true;
    autoWalk.visited = {};
    stopDrift();
    document.body.classList.add('walking-tour');
    var first = walkRoutePanoramas()[0];
    walkSetBar('playing', currentRoom);
    if (currentRoom === first && currentRoom.mode === 'panorama') {
      walkStep(currentRoom);
    } else {
      switchRoom(first, { fade: 1000, auto: true });
    }
  }
  function stopWalk(why) {
    if (!autoWalk.active && !autoWalk.paused) return;
    autoWalk.active = false;
    autoWalk.paused = false;
    autoWalk.run++;
    walkClear();
    document.body.classList.remove('walking-tour');
    try { if (psvInstance && psvInstance.stopAnimation) psvInstance.stopAnimation(); } catch (err) { /* nothing running */ }
    if (autoWalk.caption) autoWalk.caption.classList.remove('on');
    walkSetBar(why === 'done' ? 'done' : 'idle');
    // The visitor is in charge now: the room keeps drifting only if they have not taken over.
    if (why === 'done') startDrift();
  }
  function finishWalk() { stopWalk('done'); }
  function pauseWalk() {
    if (!autoWalk.active || autoWalk.paused) return;
    autoWalk.paused = true;
    autoWalk.run++;
    walkClear();
    try { if (psvInstance && psvInstance.stopAnimation) psvInstance.stopAnimation(); } catch (err) { /* nothing running */ }
    walkSetBar('paused', currentRoom);
  }
  function resumeWalk() {
    if (!autoWalk.active || !autoWalk.paused) return;
    autoWalk.paused = false;
    autoWalk.run++;
    walkSetBar('playing', currentRoom);
    walkStep(currentRoom);
  }
  function skipWalk() {
    if (!autoWalk.active || !currentRoom) return;
    autoWalk.paused = false;
    autoWalk.run++;
    walkClear();
    try { if (psvInstance && psvInstance.stopAnimation) psvInstance.stopAnimation(); } catch (err) { /* nothing running */ }
    var plan = walkPlanNext(currentRoom);
    if (!plan) { finishWalk(); return; }
    if (plan.link) walkThrough(plan.link, null, true);
    else switchRoom(plan.target, { fade: 900, auto: true });
  }

  function buildWalkBar() {
    if (!WALK_ENABLED || editMode || walkRoutePanoramas().length < 2) return;
    var bar = document.createElement('div');
    bar.id = 'walkbar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Guided walk-through');
    bar.setAttribute('data-state', 'idle');
    var dot = document.createElement('span'); dot.className = 'wb-dot'; dot.setAttribute('aria-hidden', 'true');
    var status = document.createElement('span'); status.className = 'wb-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var text = document.createElement('span'); text.className = 'wb-text';
    var count = document.createElement('span'); count.className = 'wb-count';
    status.appendChild(text); status.appendChild(count);
    var toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'wb-btn wb-toggle';
    toggle.onclick = function () { if (autoWalk.paused) resumeWalk(); else pauseWalk(); };
    var skip = document.createElement('button'); skip.type = 'button'; skip.className = 'wb-btn wb-skip'; skip.textContent = 'Next'; skip.setAttribute('aria-label', 'Skip to the next room');
    skip.onclick = skipWalk;
    var stop = document.createElement('button'); stop.type = 'button'; stop.className = 'wb-btn wb-stop'; stop.innerHTML = '&times;'; stop.setAttribute('aria-label', 'Stop the walk-through and look around yourself');
    stop.onclick = function () { stopWalk('user'); };
    var play = document.createElement('button'); play.type = 'button'; play.className = 'wb-btn wb-play'; play.textContent = 'Walk me through';
    play.onclick = function () { userTookControl = false; startWalk(); };
    bar.appendChild(dot); bar.appendChild(status); bar.appendChild(toggle); bar.appendChild(skip); bar.appendChild(stop); bar.appendChild(play);
    rootEl.appendChild(bar);
    var cap = document.createElement('div'); cap.id = 'walk-caption'; cap.setAttribute('aria-hidden', 'true');
    rootEl.appendChild(cap);
    autoWalk.bar = bar; autoWalk.text = text; autoWalk.count = count; autoWalk.toggle = toggle; autoWalk.caption = cap;
    walkSetBar('idle');
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCards(); });
  viewerEl.addEventListener('pointerdown', function () { closeCards(); }, { passive: true });

  function renderPanorama(room) {
    hideNotice();

    if (!PSV || !PSV.Viewer || !webgl2Available()) {
      renderFlatPanorama(room, 'Interactive 360° isn’t available on this device, so you’re seeing the flat photo. Swipe sideways to look around.');
      return;
    }

    showOnly('viewer');

    // Set when we got here through a door (see walkThrough); consumed now so a
    // later pick from the dock starts from the room's own default view instead.
    var arrival = pendingArrival;
    pendingArrival = null;
    var fadeMs = pendingFade;
    pendingFade = 0;
    var startYaw = arrival ? arrival.yaw * RAD : 0;

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
        renderHotspots(room);
        preloadNeighbours(room);
        var ready = function () { startDrift(); walkRoomShown(room); };
        if (arrival && !reducedMotion) {
          // Came through a door: settle from the tight view we arrived with.
          try {
            var settle = psvInstance.animate({ zoom: 0, speed: 900 });
            if (settle && settle.then) { settle.then(ready, ready); return; }
          } catch (err) { /* fall through */ }
        }
        if (firstReveal && !reducedMotion && !editMode) {
          firstReveal = false;
          try {
            var glide = psvInstance.animate({ yaw: psvInstance.getPosition().yaw + 0.5, pitch: 0, zoom: 0, speed: 2600 });
            if (glide && glide.then) { glide.then(ready, ready); return; }
          } catch (err) { /* fall through to a plain drift */ }
        }
        firstReveal = false;
        ready();
      });
    }

    try {
      if (psvInstance) {
        stopDrift();
        var pending = psvInstance.setPanorama(room.panoUrl, {
          position: { yaw: startYaw, pitch: 0 },
          zoom: arrival && !reducedMotion ? 40 : 0,
          // A dissolve straight from the old room into the new one: nothing goes black in between.
          transition: fadeMs && !reducedMotion ? { effect: 'fade', speed: fadeMs, rotation: false } : false,
          showLoader: false,
        });
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
        defaultYaw: startYaw,
        defaultZoomLvl: reducedMotion ? 0 : (arrival ? 40 : (editMode ? 0 : 55)),
        plugins: stereoAvailable ? [PSV.GyroscopePlugin, PSV.StereoPlugin] : [],
      });
      psvInstance.addEventListener('panorama-error', function (e) { fallBack(e && e.error); });
      psvInstance.addEventListener('panorama-loaded', arrived);
      // Keep the doors glued to their places as the view moves.
      psvInstance.addEventListener('position-updated', scheduleHotspots);
      psvInstance.addEventListener('zoom-updated', scheduleHotspots);
      psvInstance.addEventListener('size-updated', scheduleHotspots);
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

  // Go to a room. Between two 360 rooms the old view dissolves into the new one in place; the
  // dark curtain is only for the rarer jumps that involve a photo-set room (a different viewer).
  function switchRoom(room, opts) {
    if (room === currentRoom) return;
    if (!(opts && opts.auto) && autoWalk.active) stopWalk('user');
    pendingArrival = opts && typeof opts.arrivalYaw === 'number' ? { yaw: opts.arrivalYaw } : null;
    if (firstReveal && introEl) { selectRoom(room); return; }
    var seamless = psvInstance && currentRoom && currentRoom.mode === 'panorama' && room.mode === 'panorama' && !reducedMotion;
    if (seamless) {
      pendingFade = opts && opts.fade ? opts.fade : 800;
      selectRoom(room);
      return;
    }
    showCurtain(function () { selectRoom(room); });
  }
  function stepRoom(delta) {
    if (rooms.length < 2) return;
    var index = rooms.indexOf(currentRoom);
    switchRoom(rooms[(index + delta + rooms.length) % rooms.length]);
  }

  function selectRoom(room) {
    currentRoom = room;
    clearHotspots();
    closeCards();
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
    renderEditor();
  }


  // ---- Door editor (?edit=1) ---------------------------------------------
  var editorEl = null;
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function postToParent(message) {
    try {
      if (window.parent && window.parent !== window) {
        message.source = 'realevr-tour';
        window.parent.postMessage(message, '*');
      }
    } catch (err) { /* standalone */ }
  }
  function linksChanged() {
    renderHotspots(currentRoom);
    renderEditor();
    postToParent({ action: 'links-changed', links: editLinks });
  }
  function placeDoor(target) {
    if (!psvInstance || !currentRoom) return;
    var pos = psvInstance.getPosition();
    var mine = (editLinks[currentRoom.slug] || []).filter(function (l) { return l.to !== target.slug; });
    mine.push({
      to: target.slug,
      yaw: Math.round(normYaw(pos.yaw / RAD) * 10) / 10,
      pitch: Math.round((pos.pitch / RAD) * 10) / 10,
    });
    editLinks[currentRoom.slug] = mine;
    linksChanged();
  }
  function removeDoor(target) {
    editLinks[currentRoom.slug] = (editLinks[currentRoom.slug] || []).filter(function (l) { return l.to !== target.slug; });
    if (editLinks[currentRoom.slug].length === 0) delete editLinks[currentRoom.slug];
    linksChanged();
  }
  function buildEditor() {
    var cross = el('div', null);
    cross.id = 'crosshair';
    cross.setAttribute('aria-hidden', 'true');
    rootEl.appendChild(cross);
    editorEl = el('div', null);
    editorEl.id = 'editor';
    rootEl.appendChild(editorEl);
  }
  function renderEditor() {
    if (!editMode || !editorEl || !currentRoom) return;
    editorEl.innerHTML = '';
    editorEl.appendChild(el('div', 'ed-title', 'Doors in ' + currentRoom.name));
    if (currentRoom.mode !== 'panorama') {
      editorEl.appendChild(el('p', 'ed-help', 'This room is a photo set, not a 360 view, so it has no doors. Pick a 360 room below.'));
      return;
    }
    editorEl.appendChild(el('p', 'ed-help', 'Turn until the + sits on the doorway, then tap the room it leads to.'));
    var mine = editLinks[currentRoom.slug] || [];
    var others = rooms.filter(function (r) { return r !== currentRoom && r.mode === 'panorama'; });
    if (others.length === 0) editorEl.appendChild(el('p', 'ed-help', 'There are no other 360 rooms to connect to yet.'));
    others.forEach(function (target) {
      var placed = mine.some(function (l) { return l.to === target.slug; });
      var row = el('div', 'ed-row');
      row.appendChild(el('span', 'ed-name', target.name));
      var place = el('button', 'ed-place' + (placed ? ' is-placed' : ''), placed ? 'Move here' : 'Place here');
      place.type = 'button';
      place.onclick = function () { placeDoor(target); };
      row.appendChild(place);
      if (placed) {
        var remove = el('button', 'ed-remove', '✕');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove the door to ' + target.name);
        remove.onclick = function () { removeDoor(target); };
        row.appendChild(remove);
      }
      editorEl.appendChild(row);
      var hasBack = (editLinks[target.slug] || []).some(function (l) { return l.to === currentRoom.slug; });
      if (placed && !hasBack) editorEl.appendChild(el('p', 'ed-hint', 'Tip: open ' + target.name + ' and add the door back to ' + currentRoom.name + '.'));
    });
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
    if (editMode) buildEditor(); else buildIntro(title);
  }

  // ---- The way out of full screen ---------------------------------------
  // The viewer's own full-screen button shows only the 360 view; this puts a clear "Exit full screen"
  // pill on top of whatever element is full screen, so nobody has to know about Esc.
  var exitFsBtn = null;
  function leaveFullscreen() {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (err) { /* nothing to leave */ }
  }
  function syncExitButton() {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fs || editMode) {
      if (exitFsBtn && exitFsBtn.parentNode) exitFsBtn.parentNode.removeChild(exitFsBtn);
      return;
    }
    if (!exitFsBtn) {
      exitFsBtn = document.createElement('button');
      exitFsBtn.type = 'button';
      exitFsBtn.className = 'fs-exit';
      exitFsBtn.setAttribute('aria-label', 'Exit full screen');
      exitFsBtn.textContent = 'Exit full screen';
      exitFsBtn.addEventListener('click', function (e) { e.stopPropagation(); leaveFullscreen(); });
    }
    var host = fs === document.documentElement ? document.body : fs;
    if (exitFsBtn.parentNode !== host) host.appendChild(exitFsBtn);
  }
  document.addEventListener('fullscreenchange', syncExitButton);
  document.addEventListener('webkitfullscreenchange', syncExitButton);

  // The rooms in the order someone would walk the property: out front, in through the entrance, living areas, kitchen,
  // then the bedrooms (the master first, each followed by the bathrooms after them), utility, balcony, and the garden last.
  // Names the rules do not recognise keep their place among the bedrooms, and rooms of equal rank keep the order they were captured in.
  function walkRank(name) {
    var n = String(name || '').toLowerCase();
    var num = (n.match(/(\d+)/) || [])[1];
    var k = num ? Math.min(parseInt(num, 10), 9) / 10 : 0;
    if (/\b(gate|compound|exterior|outside|street|driveway|facade|front (view|yard|of)|outdoor entrance|house front)\b/.test(n)) return 0;
    if (/\b(entrance|entry|foyer|porch|lobby|hallway|corridor|passage|hall|stairs|staircase)\b/.test(n)) return 1 + k / 10;
    if (/\b(living|lounge|sitting|family|tv|reception|salon|parlou?r)\b/.test(n)) return 2 + k / 10;
    if (/\b(dining)\b/.test(n)) return 3;
    if (/\b(kitchen|pantry|scullery)\b/.test(n)) return 4;
    if (/\b(study|office|library|home office)\b/.test(n)) return 5;
    if (/\b(bath|bathroom|toilet|washroom|shower|restroom|wc|lavatory|powder|en-?suite)\b/.test(n)) return 7 + k;
    if (/\b(master|main bedroom|principal)\b/.test(n)) return 6;
    if (/\b(bedroom|bed room|guest room|kids?|children|nursery)\b/.test(n)) return 6 + (num ? k : 0.5);
    if (/\b(laundry|utility|store|storage|garage|wardrobe|closet)\b/.test(n)) return 8;
    if (/\b(balcony|terrace|patio|veranda|verandah|deck|sun ?room)\b/.test(n)) return 9;
    if (/\b(backyard|back yard|garden|yard|pool|rooftop|roof|parking|lawn|courtyard|play ?ground)\b/.test(n)) return 10;
    return 6.5;
  }
  function inWalkingOrder(list) {
    return list
      .map(function (room, i) { return { room: room, i: i, rank: walkRank(room.name) }; })
      .sort(function (a, b) { return a.rank - b.rank || a.i - b.i; })
      .map(function (x) { return x.room; });
  }

  fetch('./tour.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      loadingEl.style.display = 'none';
      rooms = inWalkingOrder(data.rooms || []);
      if (rooms.length === 0) {
        emptyEl.style.display = 'flex';
        return;
      }
      rooms.forEach(function (room) {
        roomsBySlug[room.slug] = room;
        if (room.links && room.links.length) editLinks[room.slug] = room.links.map(function (l) { return { to: l.to, yaw: l.yaw, pitch: l.pitch }; });
      });
      if (editMode) document.body.classList.add('edit');
      var tourTitle = data.title || document.title;
      document.getElementById('tour-title').textContent = tourTitle;
      buildChrome(tourTitle);
      buildWalkBar();
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
