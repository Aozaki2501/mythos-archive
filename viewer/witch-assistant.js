/* 幻梦境档案馆 · 卡莉欧碧夜间馆员导览助手 */
(function (window, document) {
  "use strict";

  var LOCAL_KEY = "mythos.witch.v1";
  var SESSION_KEY = "mythos.witch.session.v1";
  var currentScript = document.currentScript;
  var scriptBase = currentScript && currentScript.src
    ? currentScript.src.slice(0, currentScript.src.lastIndexOf("/") + 1)
    : "";
  var DESKTOP_ASSET = (scriptBase || "./") + "assets/witch-desktop-v2.webp";
  var CUBE_ASSET = (scriptBase || "./") + "assets/witch-cube-v1.webp";
  var root = null;
  var refs = {};
  var mounted = false;
  var context = null;
  var contextKey = "";
  var introTimer = null;
  var eventTimer = null;
  var speechTimer = null;
  var rollTimer = null;
  var rollFinishTimer = null;
  var foreheadTimer = null;
  var foreheadAnimationTimer = null;
  var nightShiftTimer = null;
  var shallowSleepTimer = null;
  var proximityFrame = null;
  var proximityPoint = null;
  var imageTimer = null;
  var imageLoaded = false;
  var imageRequested = false;
  var modalHidden = false;
  var panelOpen = false;
  var speechOnly = false;
  var pendingSpeech = false;
  var pendingSpeechReason = "context";
  var MOBILE_ENABLED = false;
  var SHALLOW_SLEEP_DELAY = 150000;
  var observers = [];

  var localState = loadState(LOCAL_KEY, {
    introSeen: false,
    displayMode: "visible",
    autoSpeechPaused: false,
    recentDialogueIds: [],
    version: 1,
  });
  var sessionState = loadState(SESSION_KEY, {
    openedWorkIds: [],
    triggeredEvents: [],
    version: 1,
  });

  /* 台词集中在助手模块，避免把角色文案散落进主站路由。 */
  var DIALOGUE = {
    home: [
      ["home-1", "欢迎，旅者。别紧张，这里只比醒着的时候多几层楼梯。"],
      ["home-2", "已经走下浅眠的七十阶了。剩下的路，可以慢一点了。"],
      ["home-3", "白船今天还没有靠岸，所以我们先读点东西吧。"],
      ["home-4", "这卷故事正在等待库拉尼斯王审判。"],
      ["home-5", "欢迎来到幻梦境档案馆。请把现实暂存在门外，离开时记得取走。"],
      ["home-6", "先看一眼聚光灯吧？"],
      ["home-7", "梦门还没有锁，要先看看哪些档案还亮着吗？"],
    ],
    edition: [
      ["edition-1", "书架已经拉出来了。往下翻吧，说不定有乌撒的故事。"],
      ["edition-2", "可以从第一份开始，也可以随便挑。幻梦境对顺序一向没有意见。"],
      ["edition-3", "这是还没有被遗忘的记录。标题、编号、作者，都只是系在梦上的标签而已。"],
      ["edition-4", "那么多个入口……别担心，大部分都能回来。大概。"],
      ["edition-5", "档案都在这里。别被编号骗了，它们排得很整齐，梦从来没有这么听话。"],
    ],
    results: [
      ["results-1", "找到了。看来它还没有沉进太深的梦里。"],
      ["results-2", "检索成功。今天运气不错，白船没有开走。"],
      ["results-3", "在这里。你记得比自己以为的要清楚。"],
      ["results-4", "梦还没有忘记它。"],
    ],
    article: [
      ["article-1", "档案已经打开。往下走吧，我在这里等你。"],
      ["article-2", "梦门已经开了。进去以后看到什么，就不能怪馆员了。"],
      ["article-3", "这一份有人读过，也有人忘掉过。"],
      ["article-4", "好啦，封条拆掉了。至少目前没有东西从里面爬出来。"],
      ["article-5", "先读完，再决定要不要相信吧。"],
      ["article-6", "这里离清醒世界有一点远。你可以继续下潜了。"],
      ["article-7", "再往下一点，就是深眠的阶梯。"],
    ],
    night: [
      ["night-1", "灯终于关了。现在才比较像营业时间。"],
      ["night-2", "夜色很好。不用怀疑，你还在梦里。"],
      ["night-3", "这样舒服多了。幻梦境不太适合白得刺眼呢。"],
      ["night-4", "深眠模式……开玩笑的，只是黑夜模式。"],
    ],
    day: [
      ["day-1", "天亮了。遗憾的是，我们还没有醒。"],
      ["day-2", "曙光到了。把那些不该见光的档案先合起来。"],
      ["day-3", "好吧，白天。调查员总需要看清自己签了什么。"],
    ],
    readingFive: [
      ["reading-five", "你已经读得很深了。还记得自己是从哪一页进来的吗？"],
      ["reading-five-2", "还没睡着吗？奇怪，一般读到这里的人已经做梦了。"],
    ],
    searchEmpty: [
      ["search-empty-1", "没有呢。也许它还没有被梦见。"],
      ["search-empty-2", "真不巧，这一班白船已经开走了。换个词试试？"],
      ["search-empty-3", "档案馆里没有这份记录。至少醒着的时候没有。"],
      ["search-empty-4", "检索失败。嗯……别露出那个表情，梦本来就不讲道理。"],
    ],
    ratingSuccess: [
      ["rating-success-1", "做检定了吗？这次骰子交给你。"],
      ["rating-success-2", "骰子，别扔到桌子下面哦。"],
      ["rating-success-3", "评议成功。调查员会把它收进这一卷。"],
      ["rating-success-4", "慢一点。梦不会因为你先给了分就变得更好读。"],
    ],
    ratingFailure: [
      ["rating-failure-1", "没写进去。看来这次检定失败了，再投一次吧。"],
      ["rating-failure-2", "真不巧，墨水刚好在这一行断了。"],
      ["rating-failure-3", "档案拒绝了你的评议。不是针对你，大概。"],
    ],
    commentSuccess: [
      ["comment-success-1", "等下一位旅者经过，就会知道这里曾经有人停下。"],
      ["comment-success-2", "调查员会把它留在原位……除非祖各半夜又来啃书脊。"],
      ["comment-success-3", "等它哪天沉进深眠，或许食尸鬼还能顺着这句话找到它。"],
    ],
    commentFailure: [
      ["comment-failure-1", "失败了……幻梦境偶尔会把几秒钟偷偷拿走呢。"],
      ["comment-failure-2", "白船经过时带走了那一行字。重新写吧，这次抓紧一点。"],
    ],
  };

  var EVENT_CONFIG = {
    "search-empty": { pool: "searchEmpty", once: true },
    "rating-success": { pool: "ratingSuccess", once: false },
    "rating-failure": { pool: "ratingFailure", once: false },
    "comment-success": { pool: "commentSuccess", once: false },
    "comment-failure": { pool: "commentFailure", once: false },
  };

  function loadState(key, fallback) {
    var value = {};
    try {
      var storage = key === SESSION_KEY ? window.sessionStorage : window.localStorage;
      var raw = storage && storage.getItem(key);
      if (raw) value = JSON.parse(raw) || {};
    } catch (err) {
      value = {};
    }
    var result = Object.assign({}, fallback, value);
    if (result.displayMode !== "minimized") result.displayMode = "visible";
    result.autoSpeechPaused = result.autoSpeechPaused === true;
    if (!Array.isArray(result.recentDialogueIds)) result.recentDialogueIds = [];
    if (!Array.isArray(result.openedWorkIds)) result.openedWorkIds = [];
    if (!Array.isArray(result.triggeredEvents)) result.triggeredEvents = [];
    return result;
  }

  function saveState(key, value) {
    try {
      var storage = key === SESSION_KEY ? window.sessionStorage : window.localStorage;
      storage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* 隐私模式或配额错误时保持内存状态，不影响主站。 */
    }
  }

  function isMobile() {
    return !!(
      window.matchMedia && window.matchMedia("(max-width: 780px)").matches
    );
  }

  function prefersReducedMotion() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function isBlocked() {
    var auth = document.getElementById("auth-gate");
    var modal = document.getElementById("modal-root");
    return !!(
      modalHidden ||
      document.body.classList.contains("is-authing") ||
      (auth && !auth.hidden) ||
      (modal && !modal.hidden)
    );
  }

  function safeText(value) {
    return String(value == null ? "" : value);
  }

  function addRecentDialogue(id) {
    if (!id) return;
    localState.recentDialogueIds = localState.recentDialogueIds.filter(function (item) {
      return item !== id;
    });
    localState.recentDialogueIds.unshift(id);
    localState.recentDialogueIds = localState.recentDialogueIds.slice(0, 2);
    saveState(LOCAL_KEY, localState);
  }

  function chooseDialogue(pool) {
    var choices = pool || DIALOGUE.home;
    var recent = localState.recentDialogueIds || [];
    var available = choices.filter(function (item) {
      return recent.indexOf(item[0]) === -1;
    });
    if (!available.length) available = choices;
    var item = available[Math.floor(Math.random() * available.length)] || choices[0];
    if (!item) return { id: "empty", text: "档案馆暂时没有可用台词。" };
    addRecentDialogue(item[0]);
    return { id: item[0], text: item[1] };
  }

  function makeNode(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function requestWhiteShip() {
    window.dispatchEvent(new window.CustomEvent("mythos:white-ship"));
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function setHidden(node, hidden) {
    if (node) node.hidden = !!hidden;
  }

  function setWitchState(nextState) {
    if (!root) return;
    root.dataset.witchState = nextState || "idle";
  }

  function setRatingProgress(progress) {
    if (!refs.ratingProgress) return;
    if (!progress || progress.status !== "loaded") {
      setHidden(refs.ratingProgress, true);
      return;
    }
    var total = Math.max(0, Number(progress.eligibleWorkCount) || 0);
    if (!total) {
      setHidden(refs.ratingProgress, true);
      return;
    }
    var count = Math.max(0, Math.min(total, Number(progress.ratedCount) || 0));
    var percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
    var next = progress.nextAchievement || null;
    refs.ratingProgressCount.textContent = count + "/" + total;
    refs.ratingProgressTrack.setAttribute("aria-valuemax", String(total));
    refs.ratingProgressTrack.setAttribute("aria-valuenow", String(count));
    refs.ratingProgressTrack.setAttribute(
      "aria-valuetext",
      "已评 " + count + " / " + total + " 篇，" + percent.toFixed(1) + "%",
    );
    refs.ratingProgressFill.style.width = percent + "%";
    refs.ratingProgressNote.textContent = progress.complete
      ? "全卷评议完成 · 幻梦全录已解锁"
      : next
        ? "下一枚「" + next.title + "」· 还差 " + (next.threshold - count) + " 篇"
        : "继续探索未评档案";
    refs.ratingProgress.setAttribute(
      "aria-label",
      "沉入幻梦境进度 " + count + " / " + total + " 篇，" + percent.toFixed(1) + "%",
    );
    setHidden(refs.ratingProgress, false);
  }

  function setReadingPresence(dimmed) {
    if (!root) return;
    root.classList.toggle("is-reading-dim", !!dimmed && !isMobile());
  }

  function clearNightShift() {
    if (nightShiftTimer) window.clearTimeout(nightShiftTimer);
    nightShiftTimer = null;
    if (root) root.classList.remove("is-night-shifting");
  }

  function flashNightShift(nextNight) {
    clearNightShift();
    if (
      !nextNight ||
      !root ||
      isMobile() ||
      prefersReducedMotion() ||
      isBlocked() ||
      localState.displayMode === "minimized" ||
      localState.autoSpeechPaused ||
      document.visibilityState === "hidden"
    ) {
      return;
    }
    root.classList.add("is-night-shifting");
    nightShiftTimer = window.setTimeout(function () {
      nightShiftTimer = null;
      if (root) root.classList.remove("is-night-shifting");
    }, 760);
  }

  function canEnterShallowSleep() {
    return !!(
      root &&
      imageLoaded &&
      !root.hidden &&
      !isMobile() &&
      !prefersReducedMotion() &&
      !isBlocked() &&
      localState.displayMode !== "minimized" &&
      !localState.autoSpeechPaused &&
      document.visibilityState !== "hidden"
    );
  }

  function clearShallowSleep() {
    if (shallowSleepTimer) window.clearTimeout(shallowSleepTimer);
    shallowSleepTimer = null;
    if (root) root.classList.remove("is-drowsy");
  }

  function scheduleShallowSleep() {
    if (shallowSleepTimer || !canEnterShallowSleep()) return;
    shallowSleepTimer = window.setTimeout(function () {
      shallowSleepTimer = null;
      if (canEnterShallowSleep()) root.classList.add("is-drowsy");
    }, SHALLOW_SLEEP_DELAY);
  }

  function wakeFromShallowSleep() {
    if (!root) return;
    if (shallowSleepTimer) window.clearTimeout(shallowSleepTimer);
    shallowSleepTimer = null;
    root.classList.remove("is-drowsy");
    scheduleShallowSleep();
  }

  function clearRollTimers() {
    if (rollTimer) window.clearInterval(rollTimer);
    if (rollFinishTimer) window.clearTimeout(rollFinishTimer);
    rollTimer = null;
    rollFinishTimer = null;
  }

  function clearForeheadTwinkle() {
    if (foreheadTimer) window.clearTimeout(foreheadTimer);
    if (foreheadAnimationTimer) window.clearTimeout(foreheadAnimationTimer);
    foreheadTimer = null;
    foreheadAnimationTimer = null;
    if (refs.foreheadStars) {
      refs.foreheadStars.querySelectorAll(".is-twinkling").forEach(function (star) {
        star.classList.remove("is-twinkling");
      });
    }
  }

  function canTwinkleForehead() {
    return !!(
      refs.foreheadStars &&
      imageLoaded &&
      !isMobile() &&
      !prefersReducedMotion() &&
      !isBlocked() &&
      localState.displayMode !== "minimized" &&
      !localState.autoSpeechPaused &&
      document.visibilityState !== "hidden"
    );
  }

  function scheduleForeheadTwinkle() {
    if (foreheadTimer || !canTwinkleForehead()) return;
    var delay = 20000 + Math.floor(Math.random() * 20001);
    foreheadTimer = window.setTimeout(function () {
      foreheadTimer = null;
      if (!canTwinkleForehead()) return;
      var stars = Array.prototype.slice.call(
        refs.foreheadStars.querySelectorAll(".witch-forehead-star"),
      );
      if (!stars.length) return;
      var star = stars[Math.floor(Math.random() * stars.length)];
      star.classList.remove("is-twinkling");
      window.requestAnimationFrame(function () {
        if (!canTwinkleForehead()) return;
        star.classList.add("is-twinkling");
        foreheadAnimationTimer = window.setTimeout(function () {
          foreheadAnimationTimer = null;
          star.classList.remove("is-twinkling");
        }, 500);
      });
      scheduleForeheadTwinkle();
    }, delay);
  }

  function clearWitchProximity() {
    if (proximityFrame) window.cancelAnimationFrame(proximityFrame);
    proximityFrame = null;
    proximityPoint = null;
    if (!refs.character) return;
    refs.character.style.setProperty("--witch-proximity-x", "0px");
    refs.character.style.setProperty("--witch-proximity-y", "0px");
    refs.character.style.setProperty("--witch-proximity-rotate", "0deg");
  }

  function paintWitchProximity(point) {
    proximityFrame = null;
    if (
      !refs.character ||
      !root ||
      root.hidden ||
      modalHidden ||
      isMobile() ||
      prefersReducedMotion() ||
      localState.displayMode === "minimized"
    ) {
      clearWitchProximity();
      return;
    }
    var rect = refs.character.getBoundingClientRect();
    var padding = 56;
    if (
      point.x < rect.left - padding ||
      point.x > rect.right + padding ||
      point.y < rect.top - padding ||
      point.y > rect.bottom + padding
    ) {
      clearWitchProximity();
      return;
    }
    var centerX = rect.left + rect.width / 2;
    var centerY = rect.top + rect.height / 2;
    var x = (point.x - centerX) / (rect.width / 2 + padding);
    var y = (point.y - centerY) / (rect.height / 2 + padding);
    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    refs.character.style.setProperty("--witch-proximity-x", (x * 4).toFixed(2) + "px");
    refs.character.style.setProperty("--witch-proximity-y", (y * 3).toFixed(2) + "px");
    refs.character.style.setProperty("--witch-proximity-rotate", (x * 2.4).toFixed(2) + "deg");
  }

  function handleWitchProximity(event) {
    if (
      event.pointerType &&
      event.pointerType !== "mouse" &&
      event.pointerType !== "pen"
    ) {
      clearWitchProximity();
      return;
    }
    wakeFromShallowSleep();
    proximityPoint = { x: event.clientX, y: event.clientY };
    if (proximityFrame) return;
    proximityFrame = window.requestAnimationFrame(function () {
      if (proximityPoint) paintWitchProximity(proximityPoint);
    });
  }

  function formatRoll(value) {
    return String(value).padStart(2, "0");
  }

  function updateRollReadout(value) {
    if (refs.rollReadout) {
      refs.rollReadout.textContent = "1D100 = " + formatRoll(value);
    }
  }

  function startWhiteShipRoll(finalRoll, reduced) {
    if (!refs.rollReadout || reduced || isMobile()) return;
    clearRollTimers();
    setWitchState("rolling");
    refs.rollReadout.classList.remove("is-final");
    setHidden(refs.rollReadout, false);
    updateRollReadout(Math.floor(Math.random() * 100) + 1);
    rollTimer = window.setInterval(function () {
      updateRollReadout(Math.floor(Math.random() * 100) + 1);
    }, 68);
    rollFinishTimer = window.setTimeout(function () {
      if (rollTimer) window.clearInterval(rollTimer);
      rollTimer = null;
      updateRollReadout(finalRoll);
      refs.rollReadout.classList.add("is-final");
      rollFinishTimer = null;
    }, 500);
  }

  function showWhiteShipDeparture() {
    if (!refs.rollReadout || isMobile()) return;
    clearRollTimers();
    setWitchState("departing");
    // 离场只保留视觉状态，判定结果继续显示，不再额外弹出离场文案。
    setHidden(refs.rollReadout, false);
  }

  function finishWhiteShipRoll() {
    clearRollTimers();
    if (refs.rollReadout) {
      refs.rollReadout.classList.remove("is-final");
      setHidden(refs.rollReadout, true);
    }
    if (root && root.dataset.witchState === "rolling") setWitchState("idle");
  }

  function replayDialogueReveal() {
    [refs.dialogue, refs.mobileDialogue].forEach(function (dialogue) {
      if (!dialogue || prefersReducedMotion()) return;
      dialogue.classList.remove("is-revealing");
      window.requestAnimationFrame(function () {
        dialogue.classList.add("is-revealing");
      });
    });
  }

  function closeDesktopBubble(returnFocus) {
    if (speechTimer) window.clearTimeout(speechTimer);
    speechTimer = null;
    speechOnly = false;
    if (!refs.bubble) return;
    root.classList.remove("is-open");
    root.classList.remove("is-speaking");
    if (root.dataset.witchState === "speaking") setWitchState("idle");
    refs.bubble.setAttribute("aria-hidden", "true");
    if (returnFocus && refs.character) refs.character.focus();
  }

  function openDesktopBubble(auto) {
    if (!refs.bubble || isBlocked() || isMobile()) return;
    if (localState.displayMode === "minimized") return;
    if (speechTimer) window.clearTimeout(speechTimer);
    speechTimer = null;
    speechOnly = !!auto;
    if (!speechOnly) pendingSpeech = false;
    setWitchState(speechOnly ? "speaking" : "idle");
    root.classList.add("is-open");
    root.classList.toggle("is-speaking", speechOnly);
    refs.bubble.setAttribute("aria-hidden", "false");
    if (speechOnly) clear(refs.actions);
    else renderActions(refs.actions, false);
    setQuietToggleLabel();
    replayDialogueReveal();
    if (speechOnly) {
      speechTimer = window.setTimeout(function () {
        speechTimer = null;
        if (speechOnly) closeDesktopBubble(false);
      }, 5600);
    }
  }

  function scheduleSpeechBubble(reason) {
    reason = reason || "context";
    if (localState.autoSpeechPaused && reason !== "event") return;
    if (
      !refs.bubble ||
      isMobile() ||
      prefersReducedMotion() ||
      localState.displayMode === "minimized"
    ) {
      return;
    }
    if (isBlocked()) {
      pendingSpeech = true;
      pendingSpeechReason = reason;
      return;
    }
    if (root && root.classList.contains("is-open") && !speechOnly) {
      pendingSpeech = false;
      return;
    }
    if (speechTimer) window.clearTimeout(speechTimer);
    speechTimer = window.setTimeout(function () {
      speechTimer = null;
      if (root && root.classList.contains("is-open") && !speechOnly) return;
      pendingSpeech = false;
      pendingSpeechReason = "context";
      openDesktopBubble(true);
    }, 160);
  }

  function closeMobilePanel(returnFocus) {
    panelOpen = false;
    setHidden(refs.mobilePanel, true);
    if (refs.mobileEntry) refs.mobileEntry.setAttribute("aria-expanded", "false");
    if (returnFocus && refs.mobileEntry) refs.mobileEntry.focus();
  }

  function closeAll(returnFocus) {
    closeDesktopBubble(returnFocus && !isMobile());
    closeMobilePanel(returnFocus && isMobile());
  }

  function markIntroSeen() {
    if (localState.introSeen) return;
    localState.introSeen = true;
    saveState(LOCAL_KEY, localState);
    if (introTimer) window.clearTimeout(introTimer);
    introTimer = null;
    setHidden(refs.introTip, true);
  }

  function setDialogue(text) {
    if (refs.dialogue) refs.dialogue.textContent = safeText(text);
    if (refs.mobileDialogue) refs.mobileDialogue.textContent = safeText(text);
  }

  /* 指定台词池直接开口：事件和主题切换共用同一条通道。 */
  function speakDialogue(poolKey, reason) {
    var pool = DIALOGUE[poolKey];
    if (!pool || !pool.length) return false;
    var selected = chooseDialogue(pool);
    setDialogue(selected.text);
    pendingSpeech = true;
    scheduleSpeechBubble(reason || "event");
    return true;
  }

  function speakText(text) {
    if (!text) return false;
    setDialogue(text);
    pendingSpeech = true;
    scheduleSpeechBubble("event");
    return true;
  }

  function contextKeyFor(nextContext) {
    return [
      nextContext.pageType,
      nextContext.editionSlug,
      nextContext.workId,
    ].join("|");
  }

  function updateDialogue(nextContext) {
    var nextKey = contextKeyFor(nextContext);
    if (nextKey === contextKey && refs.dialogue && refs.dialogue.textContent) return;
    contextKey = nextKey;
    /* 页面切换只使用页面导览词。主题台词在主题真正切换时单独触发，
       否则黑夜模式下每次路由变化都会重复“黑夜模式”开场。 */
    var selected = chooseDialogue(DIALOGUE[nextContext.pageType] || DIALOGUE.home);
    setDialogue(selected.text);
    scheduleSpeechBubble("context");
  }

  function currentEditionLabel() {
    return "返回目录";
  }

  function scrollToId(id) {
    var target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    if (typeof target.focus === "function") {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
    return true;
  }

  function goHomeAndScroll(id) {
    window.location.hash = "#/";
    window.setTimeout(function () {
      scrollToId(id);
    }, 0);
  }

  function invokeSearch() {
    var input = document.getElementById("site-search-input");
    if (input) {
      input.focus();
      return;
    }
  }

  function toggleCharacter() {
    if (localState.displayMode === "minimized") {
      localState.displayMode = "visible";
      saveState(LOCAL_KEY, localState);
      syncVisibility();
    }
    markIntroSeen();
    var open = root.classList.contains("is-open");
    if (open && speechOnly) {
      if (speechTimer) window.clearTimeout(speechTimer);
      speechTimer = null;
      speechOnly = false;
      root.classList.remove("is-speaking");
      renderActions(refs.actions, false);
      setQuietToggleLabel();
    } else if (open) {
      closeDesktopBubble(true);
    } else {
      openDesktopBubble(false);
    }
  }

  function performAction(action) {
    if (!context) return;
    var edition = context.editionSlug ? encodeURIComponent(context.editionSlug) : "";
    closeAll(false);
    if (action === "spotlight") {
      goHomeAndScroll("home-spotlight");
    } else if (action === "catalogue") {
      window.location.hash = "#/" + edition;
    } else if (action === "archive") {
      goHomeAndScroll("home-archive");
    } else if (action === "search") {
      invokeSearch();
    } else if (action === "toc") {
      var nav = document.querySelector(".section-nav");
      if (nav) {
        nav.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
        if (typeof nav.focus === "function") {
          if (!nav.hasAttribute("tabindex")) nav.setAttribute("tabindex", "-1");
          nav.focus({ preventScroll: true });
        }
      }
    } else if (action === "review") {
      scrollToId("score-panel");
    }
  }

  function createAction(label, action, className) {
    var button = makeNode("button", className || "witch-action", label);
    button.type = "button";
    button.setAttribute("data-witch-action", action);
    button.addEventListener("click", function () {
      performAction(action);
    });
    return button;
  }

  function renderActions(container, mobile) {
    if (!container) return;
    clear(container);
    if (!context) return;
    var actions = [];
    if (context.pageType === "article") {
      if (document.querySelector(".section-nav")) actions.push(["本文目录", "toc"]);
      actions.push(["跳到评议", "review"]);
      actions.push(["全馆搜索", "search"]);
      actions.push([currentEditionLabel(), "catalogue"]);
    } else if (context.pageType === "edition") {
      actions.push(["今日聚光", "spotlight"]);
      actions.push(["全馆搜索", "search"]);
      actions.push(["历届档案", "archive"]);
    } else if (context.pageType === "results") {
      actions.push(["本届目录", "catalogue"]);
      actions.push(["今日聚光", "spotlight"]);
      actions.push(["历届档案", "archive"]);
    } else {
      actions.push(["今日聚光", "spotlight"]);
      actions.push(["本届目录", "catalogue"]);
      actions.push(["历届档案", "archive"]);
      actions.push(["全馆搜索", "search"]);
    }
    var limit = mobile ? 3 : 4;
    actions.slice(0, limit).forEach(function (item) {
      container.appendChild(createAction(item[0], item[1], mobile ? "witch-mobile-action" : "witch-action"));
    });
  }

  function setQuietToggleLabel() {
    if (!refs.quietToggle) return;
    var paused = localState.autoSpeechPaused === true;
    refs.quietToggle.textContent = paused ? "恢复自动说话" : "安静模式";
    refs.quietToggle.setAttribute("aria-pressed", paused ? "true" : "false");
    refs.quietToggle.setAttribute(
      "aria-label",
      paused ? "恢复自动说话" : "开启安静模式，只在操作完成后说话",
    );
  }

  function buildDesktop() {
    root = makeNode("div", "witch-assistant");
    root.setAttribute("data-witch", "desktop");
    root.dataset.witchState = "idle";
    root.setAttribute("aria-label", "卡莉欧碧档案馆管理");

    refs.bubble = makeNode("section", "witch-bubble");
    refs.bubble.id = "witch-bubble";
    refs.bubble.setAttribute("role", "region");
    refs.bubble.setAttribute("aria-label", "卡莉欧碧导览");
    refs.bubble.setAttribute("aria-hidden", "true");
    var bubbleHead = makeNode("div", "witch-bubble-head");
    bubbleHead.appendChild(makeNode("strong", "witch-name", "卡莉欧碧"));
    bubbleHead.appendChild(makeNode("span", "witch-role", "档案馆管理"));
    refs.bubble.appendChild(bubbleHead);
    refs.dialogue = makeNode("p", "witch-dialogue");
    refs.bubble.appendChild(refs.dialogue);
    refs.actions = makeNode("div", "witch-actions");
    refs.bubble.appendChild(refs.actions);
    var bubbleFoot = makeNode("div", "witch-bubble-foot");
    refs.quietToggle = makeNode("button", "witch-action witch-action-muted", "安静模式");
    refs.quietToggle.type = "button";
    refs.quietToggle.addEventListener("click", function () {
      localState.autoSpeechPaused = !localState.autoSpeechPaused;
      saveState(LOCAL_KEY, localState);
      setQuietToggleLabel();
      if (localState.autoSpeechPaused) {
        clearForeheadTwinkle();
        clearShallowSleep();
        clearNightShift();
      } else {
        scheduleForeheadTwinkle();
        scheduleShallowSleep();
      }
    });
    bubbleFoot.appendChild(refs.quietToggle);
    var collapse = createAction("收起", "close", "witch-action witch-action-muted");
    collapse.addEventListener("click", function () {
      closeDesktopBubble(false);
    });
    bubbleFoot.appendChild(collapse);
    var minimize = createAction("最小化", "minimize", "witch-action witch-action-muted");
    minimize.addEventListener("click", function () {
      localState.displayMode = "minimized";
      saveState(LOCAL_KEY, localState);
      closeDesktopBubble(false);
      syncVisibility();
    });
    bubbleFoot.appendChild(minimize);
    refs.bubble.appendChild(bubbleFoot);
    setQuietToggleLabel();

    refs.ratingProgress = makeNode("a", "witch-rating-progress");
    refs.ratingProgress.href = "#/2026";
    refs.ratingProgress.setAttribute("aria-label", "打开 2026 届评议进度");
    refs.ratingProgress.hidden = true;
    var progressHead = makeNode("span", "witch-rating-progress-head");
    progressHead.appendChild(makeNode("span", "witch-rating-progress-title", "沉入幻梦境"));
    refs.ratingProgressCount = makeNode("strong", "witch-rating-progress-count", "0 / 53");
    progressHead.appendChild(refs.ratingProgressCount);
    refs.ratingProgress.appendChild(progressHead);
    refs.ratingProgressTrack = makeNode("span", "witch-rating-progress-track");
    refs.ratingProgressTrack.setAttribute("role", "progressbar");
    refs.ratingProgressTrack.setAttribute("aria-label", "沉入幻梦境评议进度");
    refs.ratingProgressTrack.setAttribute("aria-valuemin", "0");
    refs.ratingProgressTrack.setAttribute("aria-valuemax", "53");
    refs.ratingProgressFill = makeNode("span", "witch-rating-progress-fill");
    refs.ratingProgressTrack.appendChild(refs.ratingProgressFill);
    refs.ratingProgress.appendChild(refs.ratingProgressTrack);
    refs.ratingProgressNote = makeNode("span", "witch-rating-progress-note", "再评 5 篇，解锁初次下潜");
    refs.ratingProgress.appendChild(refs.ratingProgressNote);

    var siteBar = document.getElementById("site-bar");
    var siteAccountLink = document.getElementById("site-account-link");
    if (siteBar) siteBar.insertBefore(refs.ratingProgress, siteAccountLink || null);
    else root.appendChild(refs.ratingProgress);

    refs.character = makeNode("div", "witch-character");
    refs.character.setAttribute("role", "button");
    refs.character.setAttribute("tabindex", "0");
    refs.character.setAttribute("aria-label", "打开卡莉欧碧导览");
    refs.character.setAttribute("aria-controls", "witch-bubble");
    refs.character.appendChild(makeNode("span", "witch-fallback", "✦"));
    refs.character.addEventListener("click", function () {
      toggleCharacter();
    });
    refs.character.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeDesktopBubble(true);
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleCharacter();
      }
    });

    refs.introTip = makeNode("span", "witch-intro-tip", "第一次来？");
    refs.introTip.setAttribute("role", "status");
    refs.introTip.setAttribute("aria-live", "polite");
    refs.introTip.hidden = true;
    refs.eventTip = makeNode("span", "witch-event-tip");
    refs.eventTip.setAttribute("role", "status");
    refs.eventTip.setAttribute("aria-live", "polite");
    refs.eventTip.hidden = true;
    refs.rollReadout = makeNode("span", "witch-roll-readout");
    refs.rollReadout.setAttribute("role", "status");
    refs.rollReadout.setAttribute("aria-live", "polite");
    refs.rollReadout.hidden = true;
    var figure = makeNode("div", "witch-figure");
    figure.appendChild(refs.character);
    figure.appendChild(refs.introTip);
    figure.appendChild(refs.eventTip);
    figure.appendChild(refs.rollReadout);

    refs.restore = makeNode("button", "witch-restore", "✦");
    refs.restore.type = "button";
    refs.restore.setAttribute("aria-label", "恢复卡莉欧碧导览");
    refs.restore.addEventListener("click", function () {
      localState.displayMode = "visible";
      saveState(LOCAL_KEY, localState);
      syncVisibility();
      markIntroSeen();
      refs.character.click();
    });
    root.appendChild(refs.bubble);
    root.appendChild(figure);
    root.appendChild(refs.restore);
    document.body.appendChild(root);
  }

  function buildMobile() {
    var topMenu = document.getElementById("top-menu");
    if (topMenu) {
      refs.mobileShipEntry = makeNode("button", "witch-menu-entry", "搭乘白船");
      refs.mobileShipEntry.type = "button";
      refs.mobileShipEntry.setAttribute("aria-label", "搭乘白船，随机打开一篇作品");
      refs.mobileShipEntry.addEventListener("click", function () {
        requestWhiteShip();
      });
      topMenu.appendChild(refs.mobileShipEntry);
    }
    if (!MOBILE_ENABLED) return;
    if (topMenu) {
      refs.mobileEntry = makeNode("button", "witch-menu-entry", "档案馆管理");
      refs.mobileEntry.type = "button";
      refs.mobileEntry.setAttribute("aria-controls", "witch-mobile-panel");
      refs.mobileEntry.setAttribute("aria-expanded", "false");
      topMenu.appendChild(refs.mobileEntry);
    }
    refs.mobilePanel = makeNode("section", "witch-mobile-panel");
    refs.mobilePanel.id = "witch-mobile-panel";
    refs.mobilePanel.setAttribute("role", "dialog");
    refs.mobilePanel.setAttribute("aria-modal", "true");
    refs.mobilePanel.setAttribute("aria-labelledby", "witch-mobile-title");
    var panelHead = makeNode("div", "witch-mobile-head");
    panelHead.appendChild(makeNode("span", "witch-mobile-avatar", "✦"));
    var titleWrap = makeNode("span", "witch-mobile-title-wrap");
    var title = makeNode("strong", "witch-mobile-title", "卡莉欧碧");
    title.id = "witch-mobile-title";
    titleWrap.appendChild(title);
    titleWrap.appendChild(makeNode("small", "witch-mobile-role", "夜间馆员"));
    panelHead.appendChild(titleWrap);
    var close = makeNode("button", "witch-mobile-close", "关闭");
    close.type = "button";
    close.addEventListener("click", function () {
      closeMobilePanel(true);
    });
    panelHead.appendChild(close);
    refs.mobilePanel.appendChild(panelHead);
    refs.mobileDialogue = makeNode("p", "witch-mobile-dialogue");
    refs.mobilePanel.appendChild(refs.mobileDialogue);
    refs.mobileActions = makeNode("div", "witch-mobile-actions");
    refs.mobilePanel.appendChild(refs.mobileActions);
    refs.mobilePanel.hidden = true;
    document.body.appendChild(refs.mobilePanel);
    if (refs.mobileEntry) {
      refs.mobileEntry.addEventListener("click", function () {
        markIntroSeen();
        panelOpen = true;
        setHidden(refs.mobilePanel, false);
        refs.mobileEntry.setAttribute("aria-expanded", "true");
        renderActions(refs.mobileActions, true);
        var first = refs.mobileActions.querySelector("button");
        if (first) first.focus();
      });
    }
  }

  function loadDesktopImage() {
    if (imageRequested || isMobile() || !refs.character) return;
    imageRequested = true;
    /* 立绘、轮廓光和蓝方块放在同一个浮动容器里，动画不会互相错位。 */
    var portrait = makeNode("span", "witch-portrait");
    var glow = document.createElement("img");
    glow.className = "witch-character-glow";
    glow.alt = "";
    glow.decoding = "async";
    glow.src = DESKTOP_ASSET;
    var image = document.createElement("img");
    image.className = "witch-character-image";
    image.alt = "";
    image.decoding = "async";
    image.onload = function () {
      imageLoaded = true;
      refs.character.classList.add("has-image");
      scheduleForeheadTwinkle();
      scheduleShallowSleep();
    };
    image.onerror = function () {
      refs.character.classList.add("image-failed");
    };
    image.src = DESKTOP_ASSET;
    var cube = document.createElement("img");
    cube.className = "witch-cube";
    cube.alt = "";
    cube.decoding = "async";
    cube.src = CUBE_ASSET;
    var cubeAction = makeNode("button", "witch-cube-action");
    cubeAction.type = "button";
    cubeAction.setAttribute("aria-label", "搭乘白船，随机打开一篇作品");
    cubeAction.title = "搭乘白船";
    cubeAction.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      requestWhiteShip();
    });
    cubeAction.appendChild(cube);
    var stars = makeNode("span", "witch-departure-stars");
    for (var i = 0; i < 4; i += 1) {
      stars.appendChild(makeNode("span", "witch-departure-star"));
    }
    var foreheadStars = makeNode("span", "witch-forehead-stars");
    for (var j = 0; j < 4; j += 1) {
      foreheadStars.appendChild(makeNode("span", "witch-forehead-star"));
    }
    portrait.appendChild(glow);
    portrait.appendChild(image);
    portrait.appendChild(foreheadStars);
    portrait.appendChild(cubeAction);
    portrait.appendChild(stars);
    refs.cubeAction = cubeAction;
    refs.foreheadStars = foreheadStars;
    refs.character.insertBefore(portrait, refs.character.firstChild);
  }

  function scheduleImage() {
    if (imageTimer || imageRequested || isMobile()) return;
    var load = function () {
      imageTimer = null;
      loadDesktopImage();
    };
    if (typeof window.requestIdleCallback === "function") {
      imageTimer = window.requestIdleCallback(load, { timeout: 1800 });
    } else {
      imageTimer = window.setTimeout(load, 800);
    }
  }

  function scheduleIntro() {
    if (localState.introSeen || !context || isMobile() || isBlocked() || prefersReducedMotion()) return;
    if (context.pageType !== "home" && context.pageType !== "edition") return;
    if (introTimer) return;
    introTimer = window.setTimeout(function () {
      introTimer = null;
      if (!localState.introSeen && context && !isBlocked() && localState.displayMode !== "minimized") {
        setHidden(refs.introTip, false);
      }
    }, 2000);
  }

  function showReadingEvent() {
    if (!refs.eventTip || !context || isMobile() || isBlocked() || prefersReducedMotion()) return;
    if (localState.displayMode === "minimized") return;
    var selected = chooseDialogue(DIALOGUE.readingFive);
    setDialogue(selected.text);
    pendingSpeech = true;
    setHidden(refs.eventTip, true);
    scheduleSpeechBubble("event");
    if (eventTimer) window.clearTimeout(eventTimer);
    eventTimer = window.setTimeout(function () {
      setHidden(refs.eventTip, true);
      eventTimer = null;
    }, 4000);
  }

  function notify(eventName) {
    var config = EVENT_CONFIG[eventName];
    if (!config || !DIALOGUE[config.pool]) return false;
    if (
      config.once &&
      sessionState.triggeredEvents.indexOf(eventName) !== -1
    ) {
      return false;
    }
    if (config.once) {
      sessionState.triggeredEvents.push(eventName);
      sessionState.triggeredEvents = sessionState.triggeredEvents.slice(-12);
      saveState(SESSION_KEY, sessionState);
    }
    return speakDialogue(config.pool, "event");
  }

  function syncVisibility() {
    if (!mounted) return;
    var blocked = isBlocked();
    var mobile = isMobile();
    var layout = document.getElementById("layout");
    var sidebarCollapsed = !!(
      layout && layout.classList.contains("sidebar-collapsed")
    );
    if (root) {
      root.classList.toggle("is-minimized", localState.displayMode === "minimized");
      root.classList.toggle("is-sidebar-collapsed", sidebarCollapsed);
      root.setAttribute("aria-hidden", blocked || mobile ? "true" : "false");
      setHidden(root, blocked || mobile);
      setHidden(refs.restore, localState.displayMode !== "minimized");
      if (blocked || mobile) closeDesktopBubble(false);
    }
    if (blocked || mobile || localState.displayMode === "minimized") {
      clearForeheadTwinkle();
      clearWitchProximity();
      clearShallowSleep();
      clearNightShift();
    } else {
      scheduleForeheadTwinkle();
      scheduleShallowSleep();
    }
    if (refs.mobileEntry) {
      refs.mobileEntry.hidden = !mobile || blocked;
    }
    if (refs.mobileShipEntry) {
      refs.mobileShipEntry.hidden = !mobile || blocked;
    }
    if (blocked || !mobile) closeMobilePanel(false);
    if (!mobile && !blocked) {
      scheduleImage();
      if (pendingSpeech) scheduleSpeechBubble(pendingSpeechReason);
    }
  }

  function observeBlockingNodes() {
    if (typeof window.MutationObserver !== "function") return;
    var watcher = new window.MutationObserver(function () {
      syncVisibility();
    });
    [document.body, document.getElementById("auth-gate"), document.getElementById("modal-root")].forEach(function (node) {
      if (node) watcher.observe(node, { attributes: true, attributeFilter: ["hidden", "class"] });
    });
    var layout = document.getElementById("layout");
    if (layout) watcher.observe(layout, { attributes: true, attributeFilter: ["class"] });
    var themeWatcher = new window.MutationObserver(function () {
      if (!context) return;
      var wasNight = !!context.isNightMode;
      var nextNight = document.documentElement.dataset.theme === "dark";
      if (wasNight === nextNight) return;
      context.isNightMode = nextNight;
      flashNightShift(nextNight);
      /* 主题切换本身只说一次；随后即使跳转页面，也应由页面导览词接管。 */
      contextKey = contextKeyFor(context);
      speakDialogue(nextNight ? "night" : "day", "context");
      syncVisibility();
    });
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    observers.push(watcher, themeWatcher);
  }

  function mount() {
    if (mounted || !document.body) return;
    mounted = true;
    buildDesktop();
    buildMobile();
    observeBlockingNodes();
    window.addEventListener("resize", function () {
      syncVisibility();
      if (!isMobile()) scheduleImage();
    });
    document.addEventListener("keydown", function (event) {
      wakeFromShallowSleep();
      if (event.key !== "Escape") return;
      if (panelOpen) closeMobilePanel(true);
      else if (root && root.classList.contains("is-open")) closeDesktopBubble(true);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        clearForeheadTwinkle();
        clearShallowSleep();
        clearNightShift();
      } else {
        syncVisibility();
      }
    });
    document.addEventListener("pointerdown", wakeFromShallowSleep, { passive: true });
    window.addEventListener("scroll", wakeFromShallowSleep, { passive: true });
    window.addEventListener("pointermove", handleWitchProximity, { passive: true });
    window.addEventListener("blur", clearWitchProximity);
    syncVisibility();
  }

  function update(nextContext) {
    if (!mounted) mount();
    if (!nextContext) return;
    wakeFromShallowSleep();
    context = Object.assign({}, nextContext);
    updateDialogue(context);
    renderActions(refs.actions, false);
    renderActions(refs.mobileActions, true);
    syncVisibility();
    scheduleIntro();
  }

  function recordArticleOpen(workId) {
    if (!workId) return;
    var id = safeText(workId);
    if (sessionState.openedWorkIds.indexOf(id) === -1) {
      sessionState.openedWorkIds.push(id);
      sessionState.openedWorkIds = sessionState.openedWorkIds.slice(-20);
      saveState(SESSION_KEY, sessionState);
    }
    if (
      sessionState.openedWorkIds.length >= 5 &&
      sessionState.triggeredEvents.indexOf("reading-five") === -1
    ) {
      sessionState.triggeredEvents.push("reading-five");
      saveState(SESSION_KEY, sessionState);
      showReadingEvent();
    }
  }

  function hideForModal() {
    modalHidden = true;
    closeAll(false);
    syncVisibility();
  }

  function restoreAfterModal() {
    modalHidden = false;
    syncVisibility();
  }

  window.MythosWitch = {
    mount: mount,
    update: update,
    recordArticleOpen: recordArticleOpen,
    notify: notify,
    speakText: speakText,
    setState: setWitchState,
    setReadingPresence: setReadingPresence,
    setRatingProgress: setRatingProgress,
    startWhiteShipRoll: startWhiteShipRoll,
    showWhiteShipDeparture: showWhiteShipDeparture,
    finishWhiteShipRoll: finishWhiteShipRoll,
    hideForModal: hideForModal,
    restoreAfterModal: restoreAfterModal,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(window, document);
