/* 幻梦境 · 梦门开场
 *
 * 只负责启动阶段的视觉遮罩，不读取也不修改登录状态、授权判断或接口结果。
 * 结构由 scripts/build-web.mjs 写入 index.html，样式在 viewer.css，
 * 页面就绪由 viewer.js 的 finishBoot() 调用 DreamGate.ready() 通知。
 */
(function (global) {
  "use strict";

  var gate = document.getElementById("dream-gate");
  if (!gate) return;

  var skipButton = gate.querySelector(".dream-gate__skip");
  /* 开门动作的最短可见时间。本站实测启动只需 0.3 秒左右，立刻退场只会看到
     半开的纸页一闪而过，比原来的转圈更突兀；这里只等开门动作走完，
     不等接口、不阻止页面就绪、也不改变任何登录或数据状态。 */
  var MIN_VISIBLE_MS = 620;
  var shown = false;
  var closing = true;
  var shownAt = 0;
  var minTimer = null;
  var pendingReason = "";
  var maxWaitTimer = null;
  var exitTimer = null;
  var closeCallback = null;
  var previousFocus = null;
  var previousOverflow = "";
  var childObserver = null;
  var supportsInert = "inert" in HTMLElement.prototype;

  function reducedMotion() {
    try {
      return global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (error) {
      return false;
    }
  }

  /* 背景遮罩：梦门以外的顶层节点在开场期间不可交互。 */
  function setBackgroundInert(active) {
    if (!document.body) return;
    var children = document.body.children;
    for (var i = 0; i < children.length; i += 1) {
      var node = children[i];
      if (node === gate || node.nodeName === "SCRIPT") continue;
      if (active) {
        if (node.__dreamGateInert === undefined) {
          node.__dreamGateInert = node.inert === true;
          node.__dreamGateAria = node.getAttribute("aria-hidden");
        }
        if (supportsInert) node.inert = true;
        else node.setAttribute("aria-hidden", "true");
        continue;
      }
      if (node.__dreamGateInert === undefined) continue;
      // 原样还原：页面自己设过的 aria-hidden 不能被我们顺手清掉。
      if (supportsInert) node.inert = node.__dreamGateInert;
      else if (node.__dreamGateAria === null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", node.__dreamGateAria);
      delete node.__dreamGateInert;
      delete node.__dreamGateAria;
    }
  }

  /* 开场期间解析继续，后到的节点也要一并遮住。 */
  function watchChildren() {
    if (childObserver || !document.body || typeof MutationObserver !== "function") return;
    childObserver = new MutationObserver(function () {
      if (!closing) setBackgroundInert(true);
    });
    childObserver.observe(document.body, { childList: true });
  }

  function stopWatching() {
    if (!childObserver) return;
    childObserver.disconnect();
    childObserver = null;
  }

  /* 不支持 inert 的浏览器用焦点守卫兜底，避免键盘走进被遮住的页面。 */
  function guardFocus(event) {
    if (closing) return;
    if (gate.contains(event.target)) return;
    var target = skipButton || gate;
    if (typeof target.focus === "function") target.focus({ preventScroll: true });
  }

  function show(options) {
    if (shown) return;
    shown = true;
    closing = false;
    shownAt = Date.now();
    closeCallback = options && typeof options.onClose === "function" ? options.onClose : null;
    previousFocus = document.activeElement;
    try {
      previousOverflow = document.body.style.overflow;
    } catch (error) {
      previousOverflow = "";
    }
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("is-dream-gate");
    gate.hidden = false;
    setBackgroundInert(true);
    watchChildren();
    gate.classList.toggle("is-paused", document.hidden === true);
    if (!supportsInert) document.addEventListener("focusin", guardFocus, true);
    if (skipButton && typeof skipButton.focus === "function") {
      try {
        skipButton.focus({ preventScroll: true });
      } catch (error) {
        skipButton.focus();
      }
    }
    clearTimeout(maxWaitTimer);
    var maxWait = Number(options && options.maxWait);
    maxWaitTimer = setTimeout(function () {
      hide("timeout");
    }, maxWait > 0 ? maxWait : 12000);
  }

  function hide(reason) {
    if (closing) return;
    var remaining = MIN_VISIBLE_MS - (Date.now() - shownAt);
    if (remaining > 0) {
      pendingReason = reason;
      clearTimeout(minTimer);
      minTimer = setTimeout(function () {
        hide(pendingReason);
      }, remaining);
      return;
    }
    closing = true;
    clearTimeout(maxWaitTimer);
    clearTimeout(minTimer);
    stopWatching();
    setBackgroundInert(false);
    document.removeEventListener("focusin", guardFocus, true);
    document.body.style.overflow = previousOverflow;
    gate.classList.add("is-leaving");
    clearTimeout(exitTimer);
    exitTimer = setTimeout(function () {
      gate.hidden = true;
      gate.classList.remove("is-leaving", "is-paused");
      document.documentElement.classList.remove("is-dream-gate");
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch (error) {
          /* 焦点回落失败不影响开场结束 */
        }
      }
      if (closeCallback) closeCallback(reason);
    }, reducedMotion() ? 0 : 420);
  }

  function onSkip() {
    hide("skip");
  }

  function onKeydown(event) {
    if (closing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      hide("skip");
      return;
    }
    if (event.key !== "Tab") return;
    /* 单按钮模态层：焦点留在跳过按钮上。 */
    event.preventDefault();
    var target = skipButton || gate;
    if (typeof target.focus === "function") target.focus({ preventScroll: true });
  }

  if (skipButton) skipButton.addEventListener("click", onSkip);
  gate.addEventListener("keydown", onKeydown);
  document.addEventListener("visibilitychange", function () {
    if (closing) return;
    gate.classList.toggle("is-paused", document.hidden === true);
  });

  global.DreamGate = {
    show: show,
    hide: hide,
    ready: function () {
      hide("ready");
    },
    isOpen: function () {
      return !closing;
    },
  };
})(window);

