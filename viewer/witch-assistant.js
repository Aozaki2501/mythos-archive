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
  var imageTimer = null;
  var imageLoaded = false;
  var imageRequested = false;
  var modalHidden = false;
  var panelOpen = false;
  var speechOnly = false;
  var pendingSpeech = false;
  var pendingSpeechReason = "context";
  var MOBILE_ENABLED = false;
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
    if (!item) return { id: "empty", text: "需要找什么？" };
    addRecentDialogue(item[0]);
    return { id: item[0], text: item[1] };
  }

  function makeNode(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function setHidden(node, hidden) {
    if (node) node.hidden = !!hidden;
  }

  function closeDesktopBubble(returnFocus) {
    if (speechTimer) window.clearTimeout(speechTimer);
    speechTimer = null;
    speechOnly = false;
    if (!refs.bubble) return;
    root.classList.remove("is-open");
    root.classList.remove("is-speaking");
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
    root.classList.add("is-open");
    root.classList.toggle("is-speaking", speechOnly);
    refs.bubble.setAttribute("aria-hidden", "false");
    if (speechOnly) clear(refs.actions);
    else renderActions(refs.actions, false);
    setQuietToggleLabel();
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
    if (!context) return "本届目录";
    return context.editionName ? "返回" + context.editionName : "本届目录";
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
    var button = document.getElementById("top-global-search");
    if (button) button.click();
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

    refs.character = makeNode("button", "witch-character");
    refs.character.type = "button";
    refs.character.setAttribute("aria-label", "打开卡莉欧碧导览");
    refs.character.setAttribute("aria-controls", "witch-bubble");
    refs.character.appendChild(makeNode("span", "witch-fallback", "✦"));
    refs.character.appendChild(makeNode("span", "witch-hover-tip", "需要找什么？"));
    refs.character.addEventListener("click", function () {
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
    });
    refs.character.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeDesktopBubble(true);
    });

    refs.introTip = makeNode("span", "witch-intro-tip", "第一次来？");
    refs.introTip.setAttribute("role", "status");
    refs.introTip.setAttribute("aria-live", "polite");
    refs.introTip.hidden = true;
    refs.eventTip = makeNode("span", "witch-event-tip");
    refs.eventTip.setAttribute("role", "status");
    refs.eventTip.setAttribute("aria-live", "polite");
    refs.eventTip.hidden = true;
    var figure = makeNode("div", "witch-figure");
    figure.appendChild(refs.character);
    figure.appendChild(refs.introTip);
    figure.appendChild(refs.eventTip);

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
    if (!MOBILE_ENABLED) return;
    var topMenu = document.getElementById("top-menu");
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
    portrait.appendChild(glow);
    portrait.appendChild(image);
    portrait.appendChild(cube);
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
    if (refs.mobileEntry) {
      refs.mobileEntry.hidden = !mobile || blocked;
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
      if (event.key !== "Escape") return;
      if (panelOpen) closeMobilePanel(true);
      else if (root && root.classList.contains("is-open")) closeDesktopBubble(true);
    });
    syncVisibility();
  }

  function update(nextContext) {
    if (!mounted) mount();
    if (!nextContext) return;
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
    hideForModal: hideForModal,
    restoreAfterModal: restoreAfterModal,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})(window, document);
