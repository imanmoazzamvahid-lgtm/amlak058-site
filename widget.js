/* Emلاک ایمان - Embeddable real-estate assistant
   Install once:
   <script src="https://amlak058.ir/widget.js" defer></script>
*/
(function () {
  'use strict';

  var GLOBAL_KEY = '__IMAN_PROPERTY_WIDGET__';
  var ROOT_ID = 'iman-property-widget';
  var STYLE_ID = 'iman-property-widget-styles';

  /* A live instance (including one waiting for DOMContentLoaded) is a singleton. */
  var previous = window[GLOBAL_KEY];
  if (previous && (previous.pending || (previous.root && previous.root.isConnected))) {
    return;
  }
  if (previous && typeof previous.destroy === 'function') {
    previous.destroy();
  }

  var script = document.currentScript;
  var base = (script && script.getAttribute('data-base')) || 'https://amlak058.ir';
  base = base.replace(/\/+$/, '');
  var title = (script && script.getAttribute('data-title')) || 'مشاور آنلاین املاک ایمان';
  var logo = base + '/icon.svg';
  var frameUrl = base + '/liam.html?embed=1&source=' + encodeURIComponent(location.hostname);

  var controller = {
    pending: true,
    root: null,
    style: null,
    onKeyDown: null,
    destroy: function () {
      if (controller.onKeyDown) {
        document.removeEventListener('keydown', controller.onKeyDown);
      }
      if (controller.root && controller.root.parentNode) {
        controller.root.parentNode.removeChild(controller.root);
      }
      if (controller.style && controller.style.parentNode) {
        controller.style.parentNode.removeChild(controller.style);
      }
      if (window[GLOBAL_KEY] === controller) {
        try { delete window[GLOBAL_KEY]; } catch (_) { window[GLOBAL_KEY] = null; }
      }
    }
  };
  window[GLOBAL_KEY] = controller;

  function removeOldInstances() {
    /* Remove old and duplicate widget roots, including copies from earlier versions. */
    var roots = document.querySelectorAll(
      '#' + ROOT_ID + ', [data-iman-widget-root="1"]'
    );
    for (var i = 0; i < roots.length; i++) {
      if (roots[i] && roots[i].parentNode) {
        roots[i].parentNode.removeChild(roots[i]);
      }
    }

    var oldStyles = document.querySelectorAll(
      '#' + STYLE_ID + ', style[data-iman-widget-style="1"]'
    );
    for (var j = 0; j < oldStyles.length; j++) {
      if (oldStyles[j] && oldStyles[j].parentNode) {
        oldStyles[j].parentNode.removeChild(oldStyles[j]);
      }
    }

    /* The first release used an unlabelled style element. Remove only its own rules. */
    var styles = document.getElementsByTagName('style');
    for (var k = styles.length - 1; k >= 0; k--) {
      var css = styles[k].textContent || '';
      if (css.indexOf('#iman-property-widget{') !== -1 &&
          styles[k].id !== STYLE_ID &&
          styles[k].getAttribute('data-iman-widget-style') !== '1') {
        styles[k].parentNode.removeChild(styles[k]);
      }
    }
  }

  function makeElement(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function init() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    if (window[GLOBAL_KEY] !== controller || controller.root) return;

    removeOldInstances();

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute('data-iman-widget-style', '1');
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
    (document.head || document.documentElement).appendChild(style);
    controller.style = style;

    var root = makeElement('div');
    root.id = ROOT_ID;
    root.setAttribute('data-iman-widget-root', '1');

    var launch = makeElement('button', 'iman-launch');
    launch.type = 'button';
    launch.setAttribute('aria-expanded', 'false');
    var image = document.createElement('img');
    image.alt = '';
    image.src = logo;
    var label = makeElement('span', '', title);
    launch.appendChild(image);
    launch.appendChild(label);

    var win = makeElement('section', 'iman-window');
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', title);
    win.setAttribute('aria-modal', 'false');

    var close = makeElement('button', 'iman-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'بستن');

    var frame = makeElement('iframe', 'iman-frame');
    frame.title = title;
    frame.loading = 'lazy';
    frame.setAttribute('allow', 'clipboard-write');

    win.appendChild(close);
    win.appendChild(frame);
    root.appendChild(launch);
    root.appendChild(win);
    document.body.appendChild(root);
    controller.root = root;
    controller.pending = false;

    var loaded = false;
    function openWidget() {
      win.classList.add('is-open');
      launch.setAttribute('aria-expanded', 'true');
      if (!loaded) {
        frame.src = frameUrl;
        loaded = true;
      }
    }
    function closeWidget() {
      win.classList.remove('is-open');
      launch.setAttribute('aria-expanded', 'false');
    }

    launch.addEventListener('click', function () {
      if (win.classList.contains('is-open')) closeWidget();
      else openWidget();
    });
    close.addEventListener('click', closeWidget);

    controller.onKeyDown = function (event) {
      if (event.key === 'Escape') closeWidget();
    };
    document.addEventListener('keydown', controller.onKeyDown);
  }

  init();
})();