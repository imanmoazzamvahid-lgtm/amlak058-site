/* Emلاک ایمان - Embeddable real-estate assistant
   Install: <script src="https://amlak058.ir/widget.js" defer></script>
*/
(function () {
  'use strict';
  if (window.__IMAN_PROPERTY_WIDGET__) return;
  window.__IMAN_PROPERTY_WIDGET__ = true;
  var script = document.currentScript;
  var base = (script && script.getAttribute('data-base')) || 'https://amlak058.ir';
  base = base.replace(/\/$/, '');
  var title = (script && script.getAttribute('data-title')) || 'مشاور آنلاین املاک ایمان';
  var logo = base + '/icon.svg';
  var frameUrl = base + '/liam.html?embed=1&source=' + encodeURIComponent(location.hostname);
  var style = document.createElement('style');
  style.textContent = [
    '#iman-property-widget{position:fixed;z-index:2147483000;right:20px;bottom:20px;font-family:Tahoma,Arial,sans-serif;direction:rtl}',
    '#iman-property-widget *{box-sizing:border-box}',
    '#iman-property-widget .iman-launch{display:flex;align-items:center;gap:10px;border:1px solid #d8c69b;background:#07392f;color:#fff;border-radius:999px;padding:10px 16px 10px 12px;box-shadow:0 8px 30px #0003;cursor:pointer;font:700 13px Tahoma,Arial,sans-serif}',
    '#iman-property-widget .iman-launch img{width:32px;height:32px;border-radius:50%;background:#fff;object-fit:contain}',
    '#iman-property-widget .iman-window{display:none;position:fixed;right:20px;bottom:82px;width:min(410px,calc(100vw - 28px));height:min(680px,calc(100dvh - 110px));background:#062f28;border:1px solid #bba775;border-radius:18px;overflow:hidden;box-shadow:0 18px 60px #0005}',
    '#iman-property-widget .iman-window.is-open{display:block}',
    '#iman-property-widget .iman-frame{width:100%;height:100%;border:0;display:block;background:#062f28}',
    '#iman-property-widget .iman-close{position:absolute;top:9px;left:9px;z-index:2;width:34px;height:34px;border:1px solid #ffffff44;border-radius:50%;background:#07392f;color:#fff;font-size:21px;cursor:pointer;line-height:1}',
    '@media(max-width:600px){#iman-property-widget{right:12px;bottom:12px}#iman-property-widget .iman-window{right:0;bottom:0;width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border:0}#iman-property-widget .iman-launch{padding:9px 14px}}'
  ].join('\n');
  document.head.appendChild(style);
  var root = document.createElement('div');
  root.id = 'iman-property-widget';
  root.innerHTML = '<button class="iman-launch" type="button" aria-expanded="false"><img alt="" src="' + logo + '"><span>' + title + '</span></button>' +
    '<section class="iman-window" role="dialog" aria-label="' + title + '" aria-modal="false">' +
    '<button class="iman-close" type="button" aria-label="بستن">×</button>' +
    '<iframe class="iman-frame" title="' + title + '" loading="lazy" allow="clipboard-write"></iframe></section>';
  document.body.appendChild(root);
  var launch = root.querySelector('.iman-launch');
  var win = root.querySelector('.iman-window');
  var close = root.querySelector('.iman-close');
  var frame = root.querySelector('.iman-frame');
  var loaded = false;
  function openWidget() {
    win.classList.add('is-open');
    launch.setAttribute('aria-expanded', 'true');
    if (!loaded) { frame.src = frameUrl; loaded = true; }
  }
  function closeWidget() {
    win.classList.remove('is-open');
    launch.setAttribute('aria-expanded', 'false');
  }
  launch.addEventListener('click', function () {
    if (win.classList.contains('is-open')) closeWidget(); else openWidget();
  });
  close.addEventListener('click', closeWidget);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeWidget();
  });
})();