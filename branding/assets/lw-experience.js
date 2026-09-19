(function () {
  "use strict";
  // OSS 在 signature 节点上写了 display:!important 内联样式，CSS 盖不住，只能摘节点。
  function strip() {
    try {
      document
        .querySelectorAll("[data-logto-signature-container], [data-logto-signature], .logto_signature")
        .forEach(function (el) {
          el.remove();
        });
    } catch (_) {}
  }
  try {
    strip();
    if (document.documentElement) {
      new MutationObserver(strip).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  } catch (_) {}
})();
