/**
 * Dark/Light switch, come su tommanmaz.github.io: segue il sistema operativo
 * finché non si sceglie un tema; la scelta resta in localStorage.
 */
(function () {
  'use strict';
  var KEY = 'theme';
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  try {
    var t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  } catch (e) { /* private mode */ }

  function current() {
    var t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return media && media.matches ? 'dark' : 'light';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var header = document.querySelector('.header');
    if (!header) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    function label() { btn.textContent = current() === 'dark' ? 'Light' : 'Dark'; }
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
      label();
      window.dispatchEvent(new Event('themechange'));
    });
    if (media && media.addEventListener) media.addEventListener('change', label);
    label();
    header.appendChild(btn);
  });
})();
