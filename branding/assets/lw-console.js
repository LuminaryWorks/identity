(function () {
  "use strict";

  // Console 的 Helmet titleTemplate 是 `%s - ${mainTitle}`，mainTitle 来自
  // consts/tenants.ts 的 'Logto Console' / 'Logto Cloud'。这里只换品牌名，
  // 替换后串里不再含原名，天然幂等，不会和 MutationObserver 形成回环。
  var BRAND = "LuminaryWorks Identity";
  var LOGTO_TITLE = /Logto (?:Console|Cloud)/g;

  function syncPath() {
    try {
      document.documentElement.dataset.lwPath = location.pathname;
    } catch (_) {}
  }

  function wrapHistory(name) {
    var orig = history[name];
    if (typeof orig !== "function") return;
    history[name] = function () {
      var ret = orig.apply(this, arguments);
      syncPath();
      return ret;
    };
  }

  try {
    wrapHistory("pushState");
    wrapHistory("replaceState");
    addEventListener("popstate", syncPath);
    syncPath();
  } catch (_) {}

  function rebrandTitle() {
    try {
      var current = document.title || "";
      var next = current.replace(LOGTO_TITLE, BRAND);
      if (next !== current) document.title = next;
    } catch (_) {}
  }

  try {
    var head = document.head;
    if (head) {
      // Helmet 改标题时经常只动 title 的文本节点，characterData 不能省。
      new MutationObserver(rebrandTitle).observe(head, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    rebrandTitle();
  } catch (_) {}
})();
