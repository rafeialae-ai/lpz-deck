/* =========================================================================
   Les Perles de Zenata — moteur de présentation TV (vanilla, zéro dépendance)
   - met le deck 1280×720 à l'échelle du viewport (plein cadre télé)
   - boucle auto (vitrine) + pilotage clavier/télécommande/clic
   - rejoue les animations d'entrée à chaque slide, précharge la suivante
   ========================================================================= */
(function () {
  'use strict';

  var DEFAULT_DUR = 8500;   // durée d'une slide de contenu (ms)
  var COVER_DUR   = 7000;   // couverture un peu plus courte
  var IDLE_RESUME = 45000;  // reprise auto après inactivité (ms)
  var UI_HIDE     = 3500;   // masquage UI / curseur après immobilité (ms)
  var HINT_FADE   = 6500;   // disparition de l'aide-mémoire (ms)

  var deck   = document.querySelector('.deck');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.deck .slide'));
  var N = slides.length;
  if (!deck || !N) return;

  var idx = 0;
  var advTimer = null, idleTimer = null, uiTimer = null;
  var paused = false;       // pause auto temporaire (interaction)
  var manualPause = false;  // pause explicite (touche P)

  /* ---------- mise à l'échelle plein écran ---------- */
  function fit() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    deck.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  fit();

  /* ---------- UI (barre de progression + points + badges) ---------- */
  var ui = document.createElement('div'); ui.className = 'lpz-ui';
  var prog = document.createElement('div'); prog.className = 'lpz-progress';
  var bar = document.createElement('i'); prog.appendChild(bar);
  var dotsWrap = document.createElement('div'); dotsWrap.className = 'lpz-dots';
  var dots = [];
  for (var i = 0; i < N; i++) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Slide ' + (i + 1));
    (function (n) { b.addEventListener('click', function () { manualGo(n); }); })(i);
    dotsWrap.appendChild(b); dots.push(b);
  }
  ui.appendChild(prog); ui.appendChild(dotsWrap);
  document.body.appendChild(ui);

  var pauseBadge = document.createElement('div');
  pauseBadge.className = 'lpz-pause'; pauseBadge.textContent = '❚❚ Pause';
  document.body.appendChild(pauseBadge);

  var isRTL = document.documentElement.getAttribute('dir') === 'rtl';
  var hint = document.createElement('div');
  hint.className = 'lpz-hint';
  hint.innerHTML = isRTL
    ? '→ ← للتنقل · Espace التالي · P وقفة · F ملء الشاشة'
    : '→ ← naviguer · Espace suivant · P pause · F plein écran';
  document.body.appendChild(hint);
  setTimeout(function () { document.body.classList.add('hint-gone'); }, HINT_FADE);

  function updateDots() {
    for (var k = 0; k < N; k++) dots[k].className = (k === idx) ? 'on' : '';
  }

  /* ---------- barre de progression (suit la durée de la slide) ---------- */
  function restartProgress(dur) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;            // reflow
    bar.style.transition = 'width ' + dur + 'ms linear';
    bar.style.width = '100%';
  }
  function freezeProgress() {
    var w = getComputedStyle(bar).width;
    bar.style.transition = 'none';
    bar.style.width = w;
  }

  /* ---------- préchargement de la slide suivante ---------- */
  function preload(n) {
    n = (n + N) % N;
    var imgs = slides[n].querySelectorAll('img');
    for (var k = 0; k < imgs.length; k++) {
      var img = imgs[k];
      if (img.getAttribute('data-pre')) continue;
      var u = img.currentSrc || img.src;
      if (u) { var p = new Image(); p.src = u; img.setAttribute('data-pre', '1'); }
    }
  }

  function durFor(n) {
    var d = slides[n].getAttribute('data-duration');
    if (d) return parseInt(d, 10);
    return (n === 0) ? COVER_DUR : DEFAULT_DUR;
  }

  /* ---------- count-up des grands chiffres (32, 450 000…) ---------- */
  function groupThousands(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function animateCount(el, target) {
    var dur = 1200, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);           // easeOutCubic
      el.textContent = groupThousands(Math.round(e * target));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = groupThousands(target);
    }
    requestAnimationFrame(step);
  }
  function runCounters(slide) {
    var els = slide.querySelectorAll('.st-num, .fact-num');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], raw = el.getAttribute('data-num');
      if (raw === null) {                        // 1re rencontre : on mémorise la cible
        var clean = el.textContent.replace(/[\s ]/g, '');
        raw = /^\d{2,}$/.test(clean) ? clean : 'x';   // ≥2 chiffres → on défile (sinon pop seul)
        el.setAttribute('data-num', raw);
      }
      if (raw === 'x') continue;
      el.textContent = '0';
      (function (node, val) { setTimeout(function () { animateCount(node, val); }, 320); })(el, parseInt(raw, 10));
    }
  }

  /* ---------- changement de slide (rejoue les animations) ---------- */
  function show(n) {
    n = (n + N) % N;
    for (var k = 0; k < N; k++) if (k !== n) slides[k].classList.remove('is-active');
    idx = n;
    var next = slides[idx];
    void next.offsetWidth;           // reflow → keyframes repartent de 0
    next.classList.add('is-active');
    runCounters(next);
    updateDots();
    preload(idx + 1);
    schedule();
  }

  function schedule() {
    clearTimeout(advTimer);
    if (paused || manualPause) { freezeProgress(); return; }
    var dur = durFor(idx);
    restartProgress(dur);
    advTimer = setTimeout(function () {
      if (!paused && !manualPause) show(idx + 1);
    }, dur);
  }

  /* ---------- pause / reprise ---------- */
  function pauseAuto() {
    if (paused) return;
    paused = true; clearTimeout(advTimer); freezeProgress();
  }
  function resumeAuto() {
    if (manualPause) return;
    if (!paused) return;
    paused = false; schedule();
  }
  function toggleManualPause() {
    manualPause = !manualPause;
    document.body.classList.toggle('is-paused', manualPause);
    if (manualPause) { clearTimeout(advTimer); freezeProgress(); }
    else { paused = false; schedule(); }
  }

  /* ---------- interaction → pause + reprise différée ---------- */
  function userActed() {
    pauseAuto();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(resumeAuto, IDLE_RESUME);
  }
  function manualGo(n) { userActed(); show(n); }
  function next() { userActed(); show(idx + 1); }
  function prev() { userActed(); show(idx - 1); }

  /* ---------- plein écran ---------- */
  function toggleFullscreen() {
    var el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  }

  /* ---------- clavier / télécommande ---------- */
  document.addEventListener('keydown', function (e) {
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': case ' ': case 'Spacebar':
        e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'PageUp':
        e.preventDefault(); prev(); break;
      case 'Home': manualGo(0); break;
      case 'End': manualGo(N - 1); break;
      case 'p': case 'P': toggleManualPause(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'Escape': break;
      default: break;
    }
  });

  /* ---------- clic : moitié gauche = préc, reste = suiv ---------- */
  document.querySelector('.stage').addEventListener('click', function (e) {
    if (e.target.closest('.lpz-dots')) return;
    var leftZone = e.clientX < window.innerWidth * 0.25;
    if (isRTL) leftZone = !leftZone; // miroir en RTL
    if (leftZone) prev(); else next();
  });

  /* ---------- révéler l'UI au mouvement, masquer à l'immobilité ---------- */
  function wake() {
    document.body.classList.remove('ui-hide');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(function () { document.body.classList.add('ui-hide'); }, UI_HIDE);
  }
  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, wake, { passive: true });
  });

  /* ---------- deep-link : #3 ou ?slide=3 ouvre directement sur une slide ---------- */
  function startIndex() {
    var h = (location.hash || '').replace('#', '');
    var q = new URLSearchParams(location.search).get('slide');
    var v = parseInt(h || q, 10);
    if (!isNaN(v)) return Math.max(0, Math.min(N - 1, v - 1)); // 1-based pour l'humain
    return 0;
  }
  window.addEventListener('hashchange', function () { manualGo(startIndex()); });

  /* ---------- démarrage ---------- */
  idx = startIndex();
  preload(idx);
  slides[idx].classList.add('is-active');
  runCounters(slides[idx]);
  updateDots();
  preload(idx + 1);
  schedule();
  wake();
})();
