(function () {
  const STORAGE_KEY = 'collabspace-theme';
  let cursorTrackerInitialized = false;

  function getPreferredTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);

    document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
      var isDark = theme === 'dark';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.innerHTML = isDark
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    });
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function initCursorTracker() {
    if (cursorTrackerInitialized) return;
    cursorTrackerInitialized = true;

    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var supportsFinePointer = window.matchMedia('(pointer: fine)').matches;
    if (prefersReducedMotion || !supportsFinePointer) return;

    var aura = document.createElement('div');
    aura.className = 'cursor-tracker-aura';
    var dot = document.createElement('div');
    dot.className = 'cursor-tracker-dot';
    document.body.appendChild(aura);
    document.body.appendChild(dot);
    document.body.classList.add('cursor-tracker-enabled');

    var targetX = window.innerWidth / 2;
    var targetY = window.innerHeight / 2;
    var currentX = targetX;
    var currentY = targetY;
    var dotX = targetX;
    var dotY = targetY;
    var rafId = null;

    function animate() {
      currentX += (targetX - currentX) * 0.16;
      currentY += (targetY - currentY) * 0.16;
      dotX += (targetX - dotX) * 0.34;
      dotY += (targetY - dotY) * 0.34;

      aura.style.transform = 'translate(' + currentX + 'px, ' + currentY + 'px) translate(-50%, -50%)';
      dot.style.transform = 'translate(' + dotX + 'px, ' + dotY + 'px) translate(-50%, -50%)';
      rafId = window.requestAnimationFrame(animate);
    }

    window.addEventListener('mousemove', function (event) {
      targetX = event.clientX;
      targetY = event.clientY;
    });

    window.addEventListener('resize', function () {
      targetX = window.innerWidth / 2;
      targetY = window.innerHeight / 2;
    });

    if (!rafId) {
      rafId = window.requestAnimationFrame(animate);
    }
  }

  // Apply immediately to prevent flash
  applyTheme(getPreferredTheme());

  // Once DOM is ready, update button icons and bind click handlers
  document.addEventListener('DOMContentLoaded', function () {
    applyTheme(getPreferredTheme());
    initCursorTracker();

    document.querySelectorAll('.theme-toggle-btn').forEach(function (btn) {
      btn.addEventListener('click', toggleTheme);
    });
  });

  // Listen for OS-level theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!localStorage.getItem(STORAGE_KEY)) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
})();
