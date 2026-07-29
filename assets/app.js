/* Downforce — scroll behaviour.
   The page works without this file: it is a readable, ordered list of teams.
   This adds the descent — the accent colour bleeds from one team to the next
   across the gap corridors, whose height is already the points gap to scale. */

(function () {
  'use strict';

  var root = document.documentElement;
  var ticks = Array.prototype.slice.call(document.querySelectorAll('.rail-tick'));

  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- colour ------------------------------------------------------------- */

  function hexToRgb(hex) {
    var h = hex.trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgb(c) {
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }

  function mix(a, b, t) {
    return rgb([
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ]);
  }

  var currentAccent = '';
  function setAccent(color) {
    if (color === currentAccent) return;
    currentAccent = color;
    root.style.setProperty('--accent', color);
  }

  /* The altimeter reads the points you are standing on. Inside a team section
     that is simply their total; falling through a corridor it interpolates, so
     a 111-point gap is 111 units of readout ticking away under you.

     It steps on whole points and never tweens. Instruments snap — an odometer
     roll or an eased counter would read as a toy. */
  var altimeter = document.querySelector('[data-altimeter]');
  var currentPts = null;

  function setPoints(value) {
    if (!altimeter || value === currentPts) return;
    currentPts = value;
    altimeter.textContent = value;
  }

  var currentPos = '';
  function setLiveTick(pos) {
    if (pos === currentPos) return;
    currentPos = pos;
    for (var i = 0; i < ticks.length; i++) {
      ticks[i].classList.toggle('is-live', ticks[i].dataset.pos === pos);
    }
  }

  /* ---- the descent -------------------------------------------------------- */
  /* One list of contiguous bands down the document. A team band holds a single
     colour; a gap band bleeds from the team above to the team below. The accent
     is always derived from scroll position, never from trigger callbacks, so it
     is correct on load, after a resize, and on a restored scroll position. */

  var bands = [];

  function measure() {
    bands = [];
    var els = document.querySelectorAll('.team, .gap');
    var lastPos = '';

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var rect = el.getBoundingClientRect();
      var top = rect.top + window.scrollY;
      var isTeam = el.classList.contains('team');

      if (isTeam) lastPos = el.dataset.pos;

      bands.push({
        top: top,
        height: rect.height || 1,
        from: hexToRgb(isTeam ? el.dataset.color : el.dataset.from),
        to: hexToRgb(isTeam ? el.dataset.color : el.dataset.to),
        fromPts: Number(isTeam ? el.dataset.pts : el.dataset.fromPts),
        toPts: Number(isTeam ? el.dataset.pts : el.dataset.toPts),
        solid: isTeam,
        pos: lastPos,
      });
    }
  }

  function update() {
    if (!bands.length) return;

    // The viewport centre is what "you are here" means on this page.
    var ref = window.scrollY + window.innerHeight / 2;
    var first = bands[0];
    var last = bands[bands.length - 1];

    if (ref <= first.top) {
      setAccent(rgb(first.from));
      setPoints(first.fromPts);
      setLiveTick(first.pos);
      return;
    }
    if (ref >= last.top + last.height) {
      setAccent(rgb(last.to));
      setPoints(last.toPts);
      setLiveTick(last.pos);
      return;
    }

    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      if (ref >= b.top && ref < b.top + b.height) {
        if (b.solid) {
          setAccent(rgb(b.from));
          setPoints(b.fromPts);
        } else {
          var t = (ref - b.top) / b.height;
          // Scrubbing a colour frame-by-frame against the wheel is exactly the
          // motion a reduced-motion visitor asked not to have. They get one
          // switch at the midpoint instead, softened by the CSS transition.
          setAccent(reduced ? rgb(t < 0.5 ? b.from : b.to) : mix(b.from, b.to, t));
          setPoints(Math.round(b.fromPts + (b.toPts - b.fromPts) * t));
        }
        setLiveTick(b.pos);
        return;
      }
    }
  }

  var queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      update();
    });
  }

  function remeasure() {
    measure();
    update();
    if (window.ScrollTrigger) ScrollTrigger.refresh();
  }

  measure();
  update();

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', remeasure);
  window.addEventListener('load', remeasure);

  /* Race times arrive as UTC. Show them where the visitor actually is. */
  var dated = document.querySelectorAll('[data-iso]');
  for (var d = 0; d < dated.length; d++) {
    var when = new Date(dated[d].dataset.iso);
    if (isNaN(when)) continue;
    // Fixed to en-GB rather than the visitor's locale: the rest of the page is
    // English, and "So., 23. Aug." next to English copy reads as a fault.
    dated[d].textContent = when.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /* ---- entrance motion (optional layer) ----------------------------------- */
  /* Everything above works without GSAP. Only the reveals need it, so if the
     CDN is blocked or the visitor asked for less motion, we stop here with a
     fully readable page. */

  if (reduced || !window.gsap || !window.ScrollTrigger) {
    root.classList.add('rm');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  gsap.utils.toArray('.team').forEach(function (team) {
    gsap.from(team.querySelectorAll('.team-name, .team-meta, .team-points, .drivers li'), {
      opacity: 0,
      y: 26,
      duration: 0.6,
      stagger: 0.055,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: team,
        start: 'top 72%',
        toggleActions: 'play none none none',
      },
    });

    // Slight drift on the position numeral so the layers separate in depth.
    gsap.to(team.querySelector('.team-pos'), {
      yPercent: -9,
      ease: 'none',
      scrollTrigger: {
        trigger: team,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true,
      },
    });
  });

  // The hero's scroll cue retracts as you leave it.
  var cue = document.querySelector('.scroll-cue span');
  if (cue) {
    gsap.to(cue, {
      scaleY: 0,
      transformOrigin: 'top center',
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'bottom bottom',
        end: 'bottom 55%',
        scrub: true,
      },
    });
  }
})();
