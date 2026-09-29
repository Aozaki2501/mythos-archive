/* 幻梦境 · 梦门开场 v2
 *
 * 只负责启动阶段的视觉遮罩，不读取也不修改登录状态、授权判断或接口结果。
 * 结构由 scripts/build-web.mjs 写入 index.html，样式在 viewer.css，
 * 页面就绪由 viewer.js 的 finishBoot() 调用 DreamGate.ready() 通知。
 * 对外接口（show / hide / ready / isOpen）与 v1 完全相同。
 *
 * 分镜：
 *   0.0s  夜空亮起，星星错开闪烁
 *   0.15s 拱门一笔画出，门扇上的月与海浮现
 *   0.45s 星环画出，0.55s 起小火车沿星环前半圈驶过、冒出蒸汽
 *   0.75s 标题逐字显影
 *   就绪  门扇向两侧打开 → 光漫出 → 镜头穿门放大 → 与页面同色后淡出
 * 点击 / Esc / 回车 / 空格：直接淡出，不再播开门。
 */
(function (global) {
  "use strict";

  var gate = document.getElementById("dream-gate");
  if (!gate) return;

  var SVG_NS = "http://www.w3.org/2000/svg";

  /* 入场动画走完需要约 2 秒；页面就绪得更早时，等入场走完再开门，
     避免门还没画完就被推开。减少动态效果时只保留很短的静态停留。 */
  var MIN_VISIBLE_MS = 2000;
  var MIN_VISIBLE_REDUCED_MS = 400;
  var OPEN_MS = 1370; // 开门 0.42s + 穿门 0.95s，与 viewer.css 对应
  var FADE_MS = 320;

  var shown = false;
  var closing = true;
  var shownAt = 0;
  var minTimer = null;
  var pendingReason = "";
  var maxWaitTimer = null;
  var exitTimer = null;
  var fadeTimer = null;
  var closeCallback = null;
  var previousFocus = null;
  var previousOverflow = "";
  var childObserver = null;
  var supportsInert = "inert" in HTMLElement.prototype;
  var sceneBuilt = false;

  function reducedMotion() {
    try {
      return global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (error) {
      return false;
    }
  }

  /* ---------------- 场景：星星、标题逐字、小火车 ---------------- */

  /* 固定种子的伪随机：每次打开星空位置一致，截图和回归比对稳定。 */
  function seeded(seed) {
    return function () {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  function svg(tag, attrs, parent) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) node.setAttribute(key, attrs[key]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function buildStars() {
    var field = gate.querySelector(".dream-gate__starfield");
    if (!field) return;
    var rand = seeded(20260929);
    for (var i = 0; i < 64; i += 1) {
      var x = -260 + rand() * 920;
      var y = -80 + rand() * 520;
      // 拱门正中留白，星星不压在门上
      if (x > 130 && x < 270 && y > 110 && y < 320) continue;
      var kind = rand();
      var star = svg("circle", {
        cx: x.toFixed(1),
        cy: y.toFixed(1),
        r: (0.5 + rand() * 1.1).toFixed(2),
        class:
          "dream-gate__star" +
          (kind > 0.9 ? " dream-gate__star--seal" : kind > 0.72 ? " dream-gate__star--blue" : ""),
      }, field);
      star.style.setProperty("--d", (rand() * 1.1).toFixed(2) + "s");
      star.style.setProperty("--o", (0.35 + rand() * 0.55).toFixed(2));
    }
    // 与站徽同款的四角星
    [
      [96, 118, 7, 0.5],
      [318, 96, 5, 0.75],
      [336, 300, 4, 0.95],
    ].forEach(function (s) {
      var x = s[0];
      var y = s[1];
      var r = s[2];
      var w = r * 0.22;
      var d =
        "M" + x + " " + (y - r) +
        "Q" + (x + w) + " " + (y - w) + " " + (x + r) + " " + y +
        "Q" + (x + w) + " " + (y + w) + " " + x + " " + (y + r) +
        "Q" + (x - w) + " " + (y + w) + " " + (x - r) + " " + y +
        "Q" + (x - w) + " " + (y - w) + " " + x + " " + (y - r) + "Z";
      var sparkle = svg("path", { d: d, class: "dream-gate__sparkle" }, field);
      sparkle.style.setProperty("--d", s[3] + "s");
    });
  }

  function splitTitle() {
    var title = gate.querySelector(".dream-gate__title");
    if (!title || title.querySelector(".dream-gate__char")) return;
    var text = title.textContent;
    title.setAttribute("aria-label", text);
    title.textContent = "";
    Array.prototype.forEach.call(text, function (ch, index) {
      var span = document.createElement("span");
      span.className = "dream-gate__char";
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--i", index);
      span.textContent = ch;
      title.appendChild(span);
    });
  }

  /* 小火车：沿星环前半圈匀速行驶，两端淡入淡出；等待接口时隔一小段再发车。 */
  var train = {
    frame: 0,
    path: null,
    group: null,
    cars: [],
    steam: null,
    length: 0,
    time: 0,
    last: 0,
    lastPuff: 0,
    START: 0.55,
    TRIP: 1.9,
    GAP: 0.7,
    SPACING: 19,
  };

  function setupTrain() {
    train.path = gate.querySelector(".dream-gate__ring--front");
    train.group = gate.querySelector(".dream-gate__train");
    train.steam = gate.querySelector(".dream-gate__steam");
    train.cars = Array.prototype.slice.call(gate.querySelectorAll(".dream-gate__car"));
    if (!train.path || !train.group || typeof train.path.getTotalLength !== "function") return false;
    train.length = train.path.getTotalLength();
    return train.length > 0;
  }

  function placeCar(car, s) {
    var clamped = Math.max(0, Math.min(train.length, s));
    var p = train.path.getPointAtLength(clamped);
    var q = train.path.getPointAtLength(Math.min(train.length, clamped + 1));
    var angle = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
    car.setAttribute(
      "transform",
      "translate(" + p.x.toFixed(2) + " " + p.y.toFixed(2) + ") rotate(" + angle.toFixed(2) + ") scale(1.15)",
    );
    return p;
  }

  function puff(x, y) {
    if (!train.steam) return;
    if (train.steam.childElementCount > 14) return;
    var node = svg("circle", {
      cx: x.toFixed(1),
      cy: y.toFixed(1),
      r: (2.2 + Math.random() * 1.6).toFixed(2),
      class: "dream-gate__puff",
    }, train.steam);
    node.addEventListener("animationend", function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function trainStep(now) {
    train.frame = 0;
    if (!shown) return;
    // 标签页切到后台时 rAF 停止；回来后限制单帧步长，火车不会瞬移。
    var dt = train.last ? Math.min(0.1, (now - train.last) / 1000) : 0;
    train.last = now;
    train.time += dt;

    var cycle = train.TRIP + train.GAP;
    var t = train.time - train.START;
    var progress = t < 0 ? -1 : (t % cycle) / train.TRIP;

    if (progress >= 0 && progress <= 1) {
      var tail = train.SPACING * (train.cars.length - 1);
      var head = -train.SPACING + progress * (train.length + tail + train.SPACING * 2);
      var locomotive = null;
      train.cars.forEach(function (car, index) {
        var p = placeCar(car, head - index * train.SPACING);
        if (index === 0) locomotive = p;
      });
      var fade = Math.min(1, progress / 0.08, (1 - progress) / 0.08);
      train.group.style.opacity = Math.max(0, fade).toFixed(3);
      if (locomotive && now - train.lastPuff > 85 && fade > 0.4) {
        train.lastPuff = now;
        puff(locomotive.x + 1, locomotive.y - 12);
      }
    } else {
      train.group.style.opacity = "0";
    }
    train.frame = global.requestAnimationFrame(trainStep);
  }

  function startTrain() {
    if (!setupTrain()) return;
    train.time = 0;
    train.last = 0;
    if (reducedMotion()) {
      // 静态构图：火车停在门前偏右
      train.cars.forEach(function (car, index) {
        placeCar(car, train.length * 0.62 - index * train.SPACING);
      });
      return;
    }
    train.frame = global.requestAnimationFrame(trainStep);
  }

  function stopTrain() {
    if (train.frame) global.cancelAnimationFrame(train.frame);
    train.frame = 0;
    if (train.steam) train.steam.textContent = "";
  }

  function buildScene() {
    if (sceneBuilt) return;
    sceneBuilt = true;
    buildStars();
    splitTitle();
  }

  /* ---------------- 遮罩与焦点（与 v1 相同） ---------------- */

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
      if (supportsInert) node.inert = node.__dreamGateInert;
      else if (node.__dreamGateAria === null) node.removeAttribute("aria-hidden");
      else node.setAttribute("aria-hidden", node.__dreamGateAria);
      delete node.__dreamGateInert;
      delete node.__dreamGateAria;
    }
  }

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

  function guardFocus(event) {
    if (closing) return;
    if (gate.contains(event.target)) return;
    focusGate();
  }

  function focusGate() {
    if (typeof gate.focus !== "function") return;
    try {
      gate.focus({ preventScroll: true });
    } catch (error) {
      gate.focus();
    }
  }

  /* ---------------- 开场 / 退场 ---------------- */

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
    buildScene();
    gate.hidden = false;
    setBackgroundInert(true);
    watchChildren();
    gate.classList.toggle("is-paused", document.hidden === true);
    if (!supportsInert) document.addEventListener("focusin", guardFocus, true);
    focusGate();
    startTrain();
    clearTimeout(maxWaitTimer);
    var maxWait = Number(options && options.maxWait);
    maxWaitTimer = setTimeout(function () {
      hide("timeout");
    }, maxWait > 0 ? maxWait : 12000);
  }

  function finish(reason) {
    stopTrain();
    gate.hidden = true;
    gate.classList.remove("is-opening", "is-leaving", "is-paused");
    document.documentElement.classList.remove("is-dream-gate");
    shown = false;
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
      try {
        previousFocus.focus({ preventScroll: true });
      } catch (error) {
        /* 焦点回落失败不影响开场结束 */
      }
    }
    if (closeCallback) closeCallback(reason);
  }

  function hide(reason) {
    if (closing) return;
    var skipping = reason === "skip" || reason === "error";
    var minVisible = reducedMotion() ? MIN_VISIBLE_REDUCED_MS : MIN_VISIBLE_MS;
    var remaining = minVisible - (Date.now() - shownAt);
    if (!skipping && remaining > 0) {
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
    gate.classList.remove("is-paused");

    var playOpening = !skipping && !reducedMotion();
    clearTimeout(exitTimer);
    clearTimeout(fadeTimer);
    if (playOpening) {
      gate.classList.add("is-opening");
      fadeTimer = setTimeout(function () {
        gate.classList.add("is-leaving");
      }, OPEN_MS - 120);
      exitTimer = setTimeout(function () {
        finish(reason);
      }, OPEN_MS - 120 + FADE_MS);
    } else {
      gate.classList.add("is-leaving");
      exitTimer = setTimeout(function () {
        finish(reason);
      }, reducedMotion() ? 200 : FADE_MS);
    }
  }

  function onSkip() {
    hide("skip");
  }

  function onKeydown(event) {
    if (closing) return;
    if (
      event.key === "Escape" ||
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "Spacebar"
    ) {
      event.preventDefault();
      hide("skip");
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    focusGate();
  }

  gate.addEventListener("click", onSkip);
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
