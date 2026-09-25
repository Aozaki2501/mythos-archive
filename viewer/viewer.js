/* 幻梦境档案馆 · 离线单文件版
   账号 / 评分 / 评论 / 标星存于本机 localStorage（演示用，非真正共享）。 */
(function () {
  "use strict";

  var DATA = window.ARCHIVE_DATA || { editions: [] };
  var STORE_KEY = "mythos.archive.v5";
  var USE_CLOUD =
    typeof window.MythosAPI !== "undefined" &&
    window.MythosAPI.enabled &&
    window.MythosAPI.enabled();
  var BODY_MAX = 2000;
  var AUTHOR_NOTE_MAX = 2000;
  var NAME_MAX = 20;
  var SIDEBAR_KEY = "mythos.sidebar.collapsed";
  var THEME_KEY = "mythos.theme";
  var READING_KEY = "mythos.reading.v1";
  var READING_SETTINGS_KEY = "mythos.reading.settings.v1";
  var READING_LIMIT = 12;
  var DEFAULT_ADMIN_QQ = "10001";
  var RATING_PROGRESS_EDITION = "2026";
  var RATING_PROGRESS_MILESTONE = 5;
  var RATING_ACHIEVEMENT_MILESTONES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 53];
  var RATING_ACHIEVEMENT_TITLES = {
    5: "初次下潜",
    10: "梦境回响",
    15: "迷雾渐深",
    20: "异梦拾遗",
    25: "夜航者",
    30: "深层勘探",
    35: "梦域行者",
    40: "长夜巡礼",
    45: "近梦尽头",
    50: "梦境守秘",
    53: "幻梦全录",
  };
  var BRAND_ASSET_URL = "./archive-brand.webp?v=20260921-brand";
  /* 启动阶段的只读请求上限。超时后由启动失败面板给出明确状态与重试入口，
     不让启动遮罩因为接口不返回而永久停留。 */
  var BOOT_TIMEOUT_MS = 6000;
  var WHITE_SHIP_EDITION_SLUG = "2026";
  var WHITE_SHIP_DEPARTURE_START_MS = 560;
  var WHITE_SHIP_ROUTE_DELAY_MS = 780;
  var WHITE_SHIP_MESSAGE_MS = 5600;
  var whiteShipBusy = false;

  var PHASES = [
    { key: "征文", label: "创作征文" },
    { key: "评分", label: "大众评分" },
    { key: "统计", label: "投票统计" },
    { key: "公示", label: "结果公示" },
  ];

  var DIMENSIONS = [
    { key: "chuanlu", label: "传录" },
    { key: "dangan", label: "档案" },
    { key: "overall", label: "综合" },
  ];

  var PIE_COLORS = ["#c9c3b8", "#a89878", "#6a5a44", "#4a4034", "#2a2825"];

  /* ---------- 工具 ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  var XLINK_NS = "http://www.w3.org/1999/xlink";

  /* 原型页的 SVG 资源直接复用：卷徽、通用图标和轻微墨迹滤镜。 */
  function ensureDesignSprite() {
    if (document.getElementById("mythos-design-sprite")) return;
    var sprite = document.createElementNS(SVG_NS, "svg");
    sprite.id = "mythos-design-sprite";
    sprite.setAttribute("width", "0");
    sprite.setAttribute("height", "0");
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.position = "absolute";
    sprite.style.overflow = "hidden";
    sprite.innerHTML = [
      "<defs>",
      '<filter id="ink" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">',
      '<feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="wobble"/>',
      '<feDisplacementMap in="SourceGraphic" in2="wobble" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="inked"/>',
      '<feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="11" result="grain"/>',
      '<feColorMatrix in="grain" type="matrix" result="wear" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 3.2"/>',
      '<feComposite in="inked" in2="wear" operator="out"/>',
      "</filter>",
      '<symbol id="star4" viewBox="0 0 24 24"><path d="M12 1.5l3.1 7.4 7.4 3.1-7.4 3.1-3.1 7.4-3.1-7.4L1.5 12l7.4-3.1z"/></symbol>',
      '<symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3.6l2.55 5.2 5.75.84-4.16 4.05.98 5.72L12 16.72l-5.12 2.69.98-5.72L3.7 9.64l5.75-.84z"/></symbol>',
      '<symbol id="i-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/></symbol>',
      '<symbol id="i-moon" viewBox="0 0 24 24"><path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/></symbol>',
      '<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></symbol>',
      '<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>',
      '<symbol id="i-toc" viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="5" cy="6.5" r=".6"/><circle cx="5" cy="12" r=".6"/><circle cx="5" cy="17.5" r=".6"/></symbol>',
      '<symbol id="i-more" viewBox="0 0 24 24"><circle cx="5.5" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18.5" cy="12" r=".9"/></symbol>',
      '<symbol id="i-prev" viewBox="0 0 24 24"><path d="M14.5 5.5L8 12l6.5 6.5"/></symbol>',
      '<symbol id="i-next" viewBox="0 0 24 24"><path d="M9.5 5.5L16 12l-6.5 6.5"/></symbol>',
      '<symbol id="i-share" viewBox="0 0 24 24"><path d="M12 3.5v11M7.5 8L12 3.5 16.5 8M5 12.5V20h14v-7.5"/></symbol>',
      '<symbol id="i-bookmark" viewBox="0 0 24 24"><path d="M7 3.5h10v17l-5-3.8-5 3.8z"/></symbol>',
      '<symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>',
      '<symbol id="i-arrow" viewBox="0 0 24 24"><path d="M4 12h15M14 7l5 5-5 5"/></symbol>',
      '<symbol id="i-aa" viewBox="0 0 24 24"><path d="M2.5 19L8 5l5.5 14M4.6 14h6.8M14.5 19l3.5-9 3.5 9M15.8 16h4.4"/></symbol>',
      '<symbol id="i-quote" viewBox="0 0 24 24"><path d="M9.5 7.5C6.8 8.4 5 10.6 5 13.5V17h4.5v-4.5H7M19 7.5c-2.7.9-4.5 3.1-4.5 6V17H19v-4.5h-2.5"/></symbol>',
      '<symbol id="i-down" viewBox="0 0 24 24"><path d="M12 4v15M7 14l5 5 5-5"/></symbol>',
      '<symbol id="i-train" viewBox="0 0 30 18"><path d="M2 13.5h19.5l2.5-3.2h4v3.2M5 13.5V7h9v6.5M7.5 7V3.8h3.2V7M15.5 10.5h5"/><circle cx="7.5" cy="15.2" r="1.6"/><circle cx="16.5" cy="15.2" r="1.6"/><circle cx="24" cy="15.2" r="1.3"/></symbol>',
      '<symbol id="em-2026" viewBox="0 0 24 24"><path d="M12 2.5l7.5 6.5L12 21.5 4.5 9z"/><path d="M4.5 9h15M12 2.5L9 9l3 12.5L15 9z"/></symbol>',
      '<symbol id="em-2025" viewBox="0 0 24 24"><path d="M12 2v2.5M9 4.5h6M8.5 19.5h7M12 19.5V22"/><path d="M9 4.5C5 6.5 5 17.5 9 19.5M15 4.5c4 2 4 13 0 15"/><path d="M7 9.5h10M6.8 14.5h10.4"/></symbol>',
      '<symbol id="em-2024" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 5.5l2 6.5-2 6.5-2-6.5z"/><path d="M12 1.8v1.4M12 20.8v1.4M1.8 12h1.4M20.8 12h1.4"/></symbol>',
      '<symbol id="em-2023" viewBox="0 0 24 24"><path d="M7 4.5h11a2 2 0 0 1 2 2v1.5h-4M7 4.5a2 2 0 0 0-2 2V17a2.5 2.5 0 0 0 2.5 2.5H18a2 2 0 0 0 2-2V16H9.5v1.5A2 2 0 0 1 7.5 19.5M7 4.5a2 2 0 0 1 2 2V16"/><path d="M11.5 9h5M11.5 12h5"/></symbol>',
      '<symbol id="em-2022" viewBox="0 0 24 24"><circle cx="7.5" cy="12" r="4.2"/><path d="M11.7 12H21M17.5 12v3M20.5 12v2.2"/><circle cx="7.5" cy="12" r="1.2"/></symbol>',
      '<symbol id="em-2021" viewBox="0 0 24 24"><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.2"/><path d="M12 2.2v1.6M5.2 4.6l1 1.3M18.8 4.6l-1 1.3"/></symbol>',
      '<symbol id="em-2020" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="8.5" cy="10.5" r="2.2"/><path d="M5.2 16.2c.7-2 5.9-2 6.6 0M13.5 9.5h5M13.5 12.5h5M13.5 15.5h3.5"/></symbol>',
      "</defs>",
    ].join("");
    document.body.insertBefore(sprite, document.body.firstChild);
  }

  function svgUse(symbolId, className, label) {
    var svg = document.createElementNS(SVG_NS, "svg");
    if (className) svg.setAttribute("class", className);
    svg.setAttribute("viewBox", symbolId === "i-train" ? "0 0 30 18" : "0 0 24 24");
    svg.setAttribute("focusable", "false");
    if (label) {
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", label);
    } else {
      svg.setAttribute("aria-hidden", "true");
    }
    var use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#" + symbolId);
    use.setAttributeNS(XLINK_NS, "xlink:href", "#" + symbolId);
    svg.appendChild(use);
    return svg;
  }

  function setIconLabel(node, symbolId, label) {
    if (!node) return;
    clear(node);
    node.classList.add("icon-label");
    node.appendChild(svgUse(symbolId, "icon"));
    if (label) node.appendChild(el("span", null, label));
  }

  function decorateStaticControls() {
    var searchIcon = document.querySelector(".site-search-icon");
    if (searchIcon) {
      clear(searchIcon);
      searchIcon.appendChild(svgUse("i-search", "icon"));
    }
    setIconLabel(refs.topMore, "i-more", "");
    setIconLabel(refs.hudPrev, "i-prev", "");
    setIconLabel(refs.hudNext, "i-next", "");
    setIconLabel(refs.mobileBarPrev, "i-prev", "上一篇");
    setIconLabel(refs.mobileBarNext, "i-next", "下一篇");
  }

  function createInkSeal(label, variant) {
    var seal = document.createElementNS(SVG_NS, "svg");
    seal.setAttribute("class", "seal " + (variant || ""));
    seal.setAttribute("viewBox", "0 0 100 100");
    seal.setAttribute("width", "34");
    seal.setAttribute("height", "34");
    seal.setAttribute("role", "img");
    seal.setAttribute("aria-label", label);
    seal.innerHTML = '<g filter="url(#ink)"><rect x="5" y="5" width="90" height="90" rx="5" fill="currentColor"/><g fill="var(--panel)" text-anchor="middle" font-size="35" font-weight="800"><text x="71" y="44">档</text><text x="71" y="84">案</text><text x="29" y="44">封</text><text x="29" y="84">存</text></g></g>';
    return seal;
  }

  function createRatedSeal(variant) {
    var seal = document.createElementNS(SVG_NS, "svg");
    seal.setAttribute("class", "seal " + (variant || ""));
    seal.setAttribute("viewBox", "0 0 100 100");
    seal.setAttribute("width", "36");
    seal.setAttribute("height", "36");
    seal.setAttribute("role", "img");
    seal.setAttribute("aria-label", "已评");
    seal.innerHTML = '<g filter="url(#ink)"><circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="5"/><text x="50" y="63" text-anchor="middle" font-size="38" font-weight="800" fill="currentColor">评</text></g>';
    return seal;
  }

  function createRatingSheetSeal(edition) {
    var volume = volumeInfo(edition);
    var volumeLabel = volume.number
      ? "第" + volume.chinese + "卷"
      : edition.year === 2021 ? "序卷乙" : edition.year === 2020 ? "序卷甲" : edition.year + "届";
    var seal = document.createElementNS(SVG_NS, "svg");
    seal.setAttribute("class", "seal");
    seal.setAttribute("viewBox", "0 0 100 100");
    seal.setAttribute("role", "img");
    seal.setAttribute("aria-label", "已评");
    seal.innerHTML = '<defs><path id="rating-sheet-seal-ring" d="M50,50 m-35.5,0 a35.5,35.5 0 1,1 71,0 a35.5,35.5 0 1,1 -71,0"/></defs>' +
      '<g filter="url(#ink)"><circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3.5"/>' +
      '<circle cx="50" cy="50" r="31" fill="none" stroke="currentColor" stroke-width="1.2"/>' +
      '<text font-size="7.8" letter-spacing="1.5" fill="currentColor"><textPath href="#rating-sheet-seal-ring">幻梦境档案馆 · 调查员评议 · ' + volumeLabel + ' · </textPath></text>' +
      '<text x="50" y="58" text-anchor="middle" font-size="23" font-weight="800" fill="currentColor">已评</text></g>';
    return seal;
  }

  function createSpotlightSeal(date) {
    var seal = document.createElementNS(SVG_NS, "svg");
    var stampDate = String(date || "").replace(/\./g, "·");
    seal.setAttribute("class", "seal seal-tilt-l spotlight-date-seal");
    seal.setAttribute("viewBox", "0 0 140 70");
    seal.setAttribute("width", "104");
    seal.setAttribute("height", "52");
    seal.setAttribute("role", "img");
    seal.setAttribute("aria-label", "今日聚光 " + date);
    seal.innerHTML = '<g filter="url(#ink)"><ellipse cx="70" cy="35" rx="66" ry="31" fill="none" stroke="currentColor" stroke-width="3"/><ellipse cx="70" cy="35" rx="58" ry="24" fill="none" stroke="currentColor" stroke-width="1"/><text x="70" y="30" text-anchor="middle" font-size="12" letter-spacing="4" fill="currentColor" font-weight="700">今日聚光</text><text x="70" y="49" text-anchor="middle" font-size="15" fill="currentColor" style="font-family:Georgia,serif">' + stampDate + "</text></g>";
    return seal;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    return (
      d.getFullYear() +
      "." +
      pad(d.getMonth() + 1) +
      "." +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function formatDateInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      "T" +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  var SPOTLIGHT_TIMEZONE = "Asia/Hong_Kong";
  var SPOTLIGHT_MIN_COUNT = 1;
  var SPOTLIGHT_DEFAULT_COUNT = 3;
  var SPOTLIGHT_MAX_COUNT = 5;

  function normalizeSpotlightCount(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
      return SPOTLIGHT_DEFAULT_COUNT;
    }
    var parsed = Number(value);
    if (!isFinite(parsed)) return SPOTLIGHT_DEFAULT_COUNT;
    return Math.max(
      SPOTLIGHT_MIN_COUNT,
      Math.min(SPOTLIGHT_MAX_COUNT, Math.floor(parsed)),
    );
  }

  function dateKeyInTimezone(date, timezone) {
    var parts;
    try {
      parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone || SPOTLIGHT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
    } catch (err) {
      parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: SPOTLIGHT_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
    }
    var map = {};
    parts.forEach(function (part) {
      if (part.type !== "literal") map[part.type] = part.value;
    });
    return map.year + "-" + map.month + "-" + map.day;
  }

  function formatShortDate(value) {
    if (!value) return "";
    var raw = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.replace(/-/g, ".");
    var date = new Date(raw);
    if (isNaN(date.getTime())) return "";
    return dateKeyInTimezone(date, SPOTLIGHT_TIMEZONE).replace(/-/g, ".");
  }

  function formatCountdown(value) {
    if (!value) return "—";
    var target = new Date(value).getTime();
    if (!isFinite(target)) return "—";
    var remaining = target - Date.now();
    if (remaining <= 0) return "已截止";
    var days = Math.floor(remaining / 86400000);
    var hours = Math.floor((remaining % 86400000) / 3600000);
    return days + " 天 " + hours + " 小时";
  }

  function stripHtmlText(html) {
    var box = document.createElement("div");
    box.innerHTML = String(html || "");
    return (box.textContent || "").replace(/\s+/g, " ").trim();
  }

  function workExcerpt(work) {
    if (!work) return "";
    var text = work.excerpt || "";
    if (!text) {
      var box = document.createElement("div");
      box.innerHTML = work.html || "";
      var firstParagraph = box.querySelector("p");
      text = firstParagraph ? firstParagraph.textContent : box.textContent;
    }
    text = String(text || "").replace(/\s+/g, " ").trim();
    return text.length > 78 ? text.slice(0, 78) + "…" : text;
  }

  function toRoman(number) {
    var value = Number(number);
    if (!isFinite(value) || value < 1) return "";
    var pairs = [
      [10, "X"],
      [9, "IX"],
      [5, "V"],
      [4, "IV"],
      [1, "I"],
    ];
    var out = "";
    pairs.forEach(function (pair) {
      while (value >= pair[0]) {
        out += pair[1];
        value -= pair[0];
      }
    });
    return out;
  }

  function volumeInfo(edition) {
    var number = Number(edition && edition.year) - 2021;
    var chinese = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
    return {
      number: number > 0 ? number : "",
      roman: toRoman(number),
      chinese: chinese[number] || String(number || ""),
    };
  }

  /** file:// 下 crypto.subtle 不可用，统一用本地哈希，保证双击 HTML 也能跑 */
  function hashPassword(text) {
    var str = String(text) + "|mythos-archive-v4";
    var h1 = 2166136261;
    var h2 = 2166136261 ^ 0x9e3779b9;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 16777619);
      h2 ^= c + ((h2 << 6) + (h2 >> 2));
      h2 = Math.imul(h2, 2246822519);
    }
    function hex(n) {
      return ("00000000" + (n >>> 0).toString(16)).slice(-8);
    }
    return Promise.resolve(hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(~h1));
  }

  function smoothScrollToId(id) {
    var target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- 存储 ---------- */

  function defaultSettings() {
    return {
      allowVisitor: true,
      allowMemberLogin: true,
      registrationOpen: true,
      memberDirectory: [],
      adminDirectory: [DEFAULT_ADMIN_QQ],
      editions: {},
      authorBindings: {},
      awardConfigs: {},
      spotlight: { editions: {} },
    };
  }

  function defaultEditionState() {
    return {
      phase: "征文",
      voteDeadline: "",
      deadlines: {
        征文: "",
        评分: "",
        统计: "",
        公示: "",
      },
      phaseAdvance: null,
    };
  }

  function emptyStore() {
    return {
      users: {},
      session: null,
      settings: defaultSettings(),
      ratings: {},
      ratingAchievements: {},
      comments: {},
      stars: {},
      authorNotes: {},
    };
  }

  function migrate(raw) {
    var base = emptyStore();
    if (!raw) return base;
    base.ratings = raw.ratings || {};
    base.ratingAchievements = raw.ratingAchievements || {};
    base.comments = raw.comments || {};
    base.stars = raw.stars || {};
    base.authorNotes = raw.authorNotes || {};
    base.users = raw.users || {};
    base.session = raw.session || null;
    var old = raw.settings || {};
    base.settings = Object.assign(defaultSettings(), {
      allowVisitor: old.allowVisitor !== false,
      allowMemberLogin: old.allowMemberLogin !== false,
      registrationOpen: old.registrationOpen !== false,
      memberDirectory: old.memberDirectory || old.whitelist || [],
      adminDirectory:
        old.adminDirectory && old.adminDirectory.length
          ? old.adminDirectory
          : [DEFAULT_ADMIN_QQ],
      editions: old.editions || {},
      authorBindings: old.authorBindings || {},
      awardConfigs: old.awardConfigs || {},
      spotlight: old.spotlight || { editions: {} },
    });
    if (!Object.keys(base.settings.editions).length) {
      var first = (DATA.editions && DATA.editions[0] && DATA.editions[0].slug) || "2026";
      var st = defaultEditionState();
      if (old.phase === "公示" || old.phase === "public") st.phase = "公示";
      else if (old.phase === "voting" || old.phase === "评分") st.phase = "评分";
      else if (old.phase === "统计") st.phase = "统计";
      st.voteDeadline = old.voteDeadline || "";
      st.deadlines = {
        征文: (old.deadlines && old.deadlines["征文"]) || "",
        评分:
          (old.deadlines && old.deadlines["评分"]) || old.voteDeadline || "",
        统计: (old.deadlines && old.deadlines["统计"]) || "",
        公示: (old.deadlines && old.deadlines["公示"]) || "",
      };
      base.settings.editions[first] = st;
    }
    return base;
  }

  function load() {
    if (USE_CLOUD) return emptyStore();
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return migrate(JSON.parse(raw));
      var legacy =
        localStorage.getItem("mythos.archive.v4") ||
        localStorage.getItem("mythos.archive.v3") ||
        localStorage.getItem("mythos.archive.v2") ||
        localStorage.getItem("mythos.archive.v1");
      if (legacy) {
        var old = JSON.parse(legacy);
        var base = migrate(old);
        base.users = {};
        base.session = null;
        return base;
      }
      return emptyStore();
    } catch (err) {
      return emptyStore();
    }
  }

  var store = load();

  function persist() {
    if (USE_CLOUD) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) {
      /* ignore */
    }
  }

  function loadReadingState() {
    try {
      var raw = localStorage.getItem(READING_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.entries && typeof parsed.entries === "object") {
        return { entries: parsed.entries };
      }
    } catch (err) {
      /* ignore */
    }
    return { entries: {} };
  }

  var readingState = loadReadingState();

  var DEFAULT_READING_SETTINGS = {
    fontSize: 18,
    lineHeight: 1.95,
    width: 720,
  };

  function loadReadingSettings() {
    try {
      var raw = localStorage.getItem(READING_SETTINGS_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        return Object.assign({}, DEFAULT_READING_SETTINGS, parsed);
      }
    } catch (err) {
      /* ignore */
    }
    return Object.assign({}, DEFAULT_READING_SETTINGS);
  }

  function saveReadingSettings(settings) {
    try {
      localStorage.setItem(READING_SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      /* ignore */
    }
  }

  function persistReadingState() {
    try {
      localStorage.setItem(READING_KEY, JSON.stringify(readingState));
    } catch (err) {
      /* ignore */
    }
  }

  function clampReadingProgress(value) {
    var number = Number(value);
    if (!isFinite(number)) return 0;
    return Math.max(0, Math.min(1, number));
  }

  function readingEntryOf(id) {
    return readingState.entries[id] || null;
  }

  function recentReadingEntries() {
    return Object.keys(readingState.entries)
      .map(function (id) {
        var entry = readingState.entries[id];
        if (!entry || typeof entry !== "object") return null;
        var edition = findEdition(entry.editionSlug);
        var work = edition && findWork(edition, entry.workSlug);
        if (!edition || !work) return null;
        return {
          id: id,
          edition: edition,
          work: work,
          progress: clampReadingProgress(entry.progress),
          updatedAt: entry.updatedAt || "",
        };
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      });
  }

  function recordReadingOpen(edition, work) {
    var id = workId(edition.slug, work.slug);
    var previous = readingEntryOf(id);
    readingState.entries[id] = {
      editionSlug: edition.slug,
      workSlug: work.slug,
      title: work.title,
      no: work.no,
      progress: previous ? clampReadingProgress(previous.progress) : 0,
      updatedAt: new Date().toISOString(),
    };
    var entries = recentReadingEntries();
    entries.slice(READING_LIMIT).forEach(function (entry) {
      delete readingState.entries[entry.id];
    });
    persistReadingState();
    return id;
  }

  function saveReadingProgress(id, value) {
    var entry = readingEntryOf(id);
    if (!entry) return;
    entry.progress = clampReadingProgress(value);
    entry.updatedAt = new Date().toISOString();
    readingState.entries[id] = entry;
    persistReadingState();
  }

  function applyCloudAuthData(data) {
    if (!data) return;
    if (data.settings) {
      store.settings = Object.assign(defaultSettings(), data.settings);
    }
    if (data.session !== undefined) {
      if (data.session && data.session.role === "visitor") {
        store.session = { role: "visitor" };
      } else if (data.session && data.session.qq) {
        store.session = { role: data.session.role, qq: data.session.qq };
      } else {
        store.session = null;
      }
    }
    if (data.user && data.user.qq) {
      store.users[data.user.qq] = {
        qq: data.user.qq,
        nickname: data.user.nickname,
        role: data.user.role,
        enabled: data.user.enabled !== false,
        pass: "",
      };
    }
  }

  var cloudUserList = [];

  function mergeCloudUsers(list) {
    cloudUserList = Array.isArray(list) ? list.slice() : [];
    cloudUserList.forEach(function (u) {
      if (!u || !u.qq) return;
      store.users[u.qq] = {
        qq: u.qq,
        nickname: u.nickname,
        role: u.role,
        enabled: u.enabled !== false,
        pass: "",
      };
    });
  }

  function pullCloudAdminState() {
    return window.MythosAPI.bootstrap().then(function (data) {
      applyCloudAuthData(data);
      if (data && data.session && data.session.token) {
        window.MythosAPI.setToken(data.session.token);
      }
      return window.MythosAPI.call("adminGetUsers");
    }).then(function (data) {
      mergeCloudUsers(data && data.users);
      return window.MythosAPI.adminGetEditionPhaseState(state.editionSlug).then(function (phaseState) {
        applyCloudEditionPhaseState(phaseState);
        return data;
      });
    });
  }

  function applyCloudEditionPhaseState(data) {
    if (!data || !data.editionSlug) return;
    var st = editionState(data.editionSlug);
    st.phase = data.phase;
    st.phaseAdvance = data.phaseAdvance || null;
    store.settings.editions[data.editionSlug] = st;
    cloudInsightsLoaded[data.editionSlug] = false;
    cloudAwardsLoaded[data.editionSlug] = false;
    persist();
  }

  function cloudBootstrap() {
    return window.MythosAPI.bootstrap({ timeoutMs: BOOT_TIMEOUT_MS }).then(function (data) {
      applyCloudAuthData(data);
      if (data && data.session && data.session.token) {
        window.MythosAPI.setToken(data.session.token);
      }
      return data;
    });
  }

  function pushCloudSettings() {
    if (!USE_CLOUD || !isAdmin()) return Promise.resolve();
    var editions = {};
    Object.keys(store.settings.editions || {}).forEach(function (slug) {
      var current = store.settings.editions[slug] || {};
      editions[slug] = {
        voteDeadline: current.voteDeadline || "",
        deadlines: current.deadlines || {},
      };
    });
    return window.MythosAPI.call("adminSaveSettings", {
      settings: {
        allowVisitor: store.settings.allowVisitor,
        allowMemberLogin: store.settings.allowMemberLogin,
        registrationOpen: store.settings.registrationOpen,
        memberDirectory: store.settings.memberDirectory || [],
        adminDirectory: store.settings.adminDirectory || [],
        editions: editions,
        authorBindings: store.settings.authorBindings || {},
      },
    }).then(function (data) {
      if (data && data.settings) {
        store.settings = Object.assign(store.settings, data.settings);
      }
    });
  }

  function ensureAdminSeed() {
    if (USE_CLOUD) return Promise.resolve();
    if (!store.settings.adminDirectory) {
      store.settings.adminDirectory = [DEFAULT_ADMIN_QQ];
    }
    if (store.settings.adminDirectory.indexOf(DEFAULT_ADMIN_QQ) === -1) {
      store.settings.adminDirectory.unshift(DEFAULT_ADMIN_QQ);
    }
    persist();
    return Promise.resolve();
  }

  function editionState(slug) {
    slug = slug || state.editionSlug;
    if (!store.settings.editions) store.settings.editions = {};
    if (!store.settings.editions[slug]) {
      store.settings.editions[slug] = defaultEditionState();
      persist();
    }
    return normalizeEditionState(store.settings.editions[slug]);
  }

  function normalizeEditionState(st) {
    if (!st || typeof st !== "object") return defaultEditionState();
    if (!st.deadlines || typeof st.deadlines !== "object") st.deadlines = {};
    PHASES.forEach(function (p) {
      if (st.deadlines[p.key] == null) st.deadlines[p.key] = "";
    });
    // 兼容旧字段：仅大众评分截止
    if (st.voteDeadline && !st.deadlines["评分"]) {
      st.deadlines["评分"] = st.voteDeadline;
    }
    if (!st.voteDeadline && st.deadlines["评分"]) {
      st.voteDeadline = st.deadlines["评分"];
    }
    return st;
  }

  function phaseDeadlineOf(slug, phase) {
    var st = editionState(slug);
    var key = phase || st.phase;
    return (st.deadlines && st.deadlines[key]) || "";
  }

  function setPhaseDeadline(slug, phase, iso) {
    var st = editionState(slug);
    if (!st.deadlines) st.deadlines = {};
    st.deadlines[phase] = iso || "";
    if (phase === "评分") st.voteDeadline = st.deadlines[phase];
    store.settings.editions[slug] = st;
  }

  function phaseOf(slug) {
    return editionState(slug).phase;
  }

  function isArchivedEdition(value) {
    var edition = typeof value === "string" ? findEdition(value) : value;
    return !!edition && edition.status === "archived";
  }

  function editionStatusLabel(value) {
    var edition = typeof value === "string" ? findEdition(value) : value;
    if (isArchivedEdition(edition)) return "已封存";
    return phaseLabel(phaseOf(edition ? edition.slug : value));
  }

  function phaseLabel(key) {
    for (var i = 0; i < PHASES.length; i++) {
      if (PHASES[i].key === key) return PHASES[i].label;
    }
    return key;
  }

  function nextPhaseKey(current) {
    for (var i = 0; i < PHASES.length - 1; i++) {
      if (PHASES[i].key === current) return PHASES[i + 1].key;
    }
    return null;
  }

  function resolveRoleForQQ(qq) {
    var admins = store.settings.adminDirectory || [];
    if (admins.indexOf(qq) !== -1) return "admin";
    return "member";
  }

  function isQQAllowedToRegister(qq) {
    var members = store.settings.memberDirectory || [];
    var admins = store.settings.adminDirectory || [];
    return members.indexOf(qq) !== -1 || admins.indexOf(qq) !== -1;
  }

  /* ---------- 会话与权限 ---------- */

  function session() {
    return store.session;
  }

  function currentUser() {
    var s = session();
    if (!s || s.role === "visitor") return null;
    return store.users[s.qq] || null;
  }

  function role() {
    var s = session();
    if (!s) return null;
    if (s.role === "visitor") return "visitor";
    var user = store.users[s.qq];
    if (!user || !user.enabled) return null;
    if (USE_CLOUD) return user.role || s.role;
    // 每次按名单刷新角色
    var resolved = resolveRoleForQQ(user.qq);
    if (user.role !== resolved) {
      user.role = resolved;
      store.users[user.qq] = user;
      persist();
    }
    return resolved;
  }

  function isLoggedIn() {
    return !!role();
  }

  function canInteract() {
    var r = role();
    return r === "member" || r === "admin";
  }

  function isAdmin() {
    return role() === "admin";
  }

  function isVisitor() {
    return role() === "visitor";
  }

  function votingOpen(slug) {
    if (isArchivedEdition(slug)) return false;
    return phaseOf(slug) === "评分";
  }

  function isPublicPhase(slug) {
    if (isArchivedEdition(slug)) return false;
    return phaseOf(slug) === "公示";
  }

  function isJudgePhase(slug) {
    if (isArchivedEdition(slug)) return false;
    return phaseOf(slug) === "统计";
  }

  function showJudgeBox(slug) {
    if (isArchivedEdition(slug)) return false;
    var p = phaseOf(slug);
    return p === "统计" || p === "公示";
  }

  function displayName(user) {
    if (!user) return "用户";
    return user.nickname || ("QQ" + user.qq);
  }

  /* ---------- 内容检索 ---------- */

  var editions = DATA.editions || [];

  function findEdition(slug) {
    for (var i = 0; i < editions.length; i++) {
      if (editions[i].slug === slug) return editions[i];
    }
    return null;
  }

  function findWork(edition, slug) {
    if (!edition) return null;
    for (var i = 0; i < edition.works.length; i++) {
      if (edition.works[i].slug === slug) return edition.works[i];
    }
    return null;
  }

  function displayWorkNo(work) {
    return String(work && work.no != null ? work.no : "").padStart(3, "0");
  }

  function workNumberTokens(work) {
    var raw = String(work && work.no != null ? work.no : "").trim();
    if (!raw) return [];
    var numeric = Number(raw);
    if (isFinite(numeric) && numeric >= 0) {
      return [
        raw,
        String(numeric),
        String(numeric).padStart(2, "0"),
        String(numeric).padStart(3, "0"),
      ];
    }
    return [raw];
  }

  function workSearchText(work) {
    return workNumberTokens(work)
      .concat([work && work.title, work && work.author])
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function workId(editionSlug, workSlug) {
    return editionSlug + "/" + workSlug;
  }

  function authorBindings() {
    if (!store.settings.authorBindings) store.settings.authorBindings = {};
    return store.settings.authorBindings;
  }

  function effectiveAuthorQQ(id, work) {
    var bound = authorBindings()[id];
    if (bound) return String(bound).trim();
    return String((work && work.authorQQ) || "").trim();
  }

  function isWorkAuthor(id, work) {
    var user = currentUser();
    if (!user) return false;
    var qq = effectiveAuthorQQ(id, work);
    return !!qq && user.qq === qq;
  }

  function authorNoteOf(id) {
    return store.authorNotes[id] || null;
  }

  function setAuthorBinding(id, qq) {
    var bag = authorBindings();
    qq = String(qq || "").trim();
    if (!qq) delete bag[id];
    else bag[id] = qq;
    store.settings.authorBindings = bag;
    persist();
  }

  function saveAuthorNote(id, body) {
    body = String(body || "").trim().slice(0, AUTHOR_NOTE_MAX);
    if (USE_CLOUD) {
      return window.MythosAPI.call("saveAuthorNote", {
        workId: id,
        body: body,
      }).then(function (data) {
        if (data && data.authorNote) store.authorNotes[id] = data.authorNote;
        else delete store.authorNotes[id];
      });
    }
    if (!body) {
      delete store.authorNotes[id];
    } else {
      store.authorNotes[id] = {
        body: body,
        updatedAt: new Date().toISOString(),
        qq: currentUser() ? currentUser().qq : "",
      };
    }
    persist();
    return Promise.resolve();
  }

  /* ---------- 标星（按账号） ---------- */

  function starKey() {
    var user = currentUser();
    return user ? user.qq : "_anon";
  }

  function starsOf(editionSlug) {
    var bag = store.stars[editionSlug] || {};
    if (Array.isArray(bag)) {
      // 兼容旧格式
      return bag;
    }
    return bag[starKey()] || [];
  }

  function isStarred(editionSlug, workSlug) {
    return starsOf(editionSlug).indexOf(workSlug) !== -1;
  }

  function toggleStar(editionSlug, workSlug) {
    if (!canInteract()) return;
    var bag = store.stars[editionSlug];
    if (!bag || Array.isArray(bag)) bag = {};
    var key = starKey();
    var list = (bag[key] || []).slice();
    var idx = list.indexOf(workSlug);
    if (idx !== -1) list.splice(idx, 1);
    else list.unshift(workSlug);
    bag[key] = list;
    store.stars[editionSlug] = bag;
    persist();
    if (USE_CLOUD) {
      window.MythosAPI.call("setStars", {
        editionSlug: editionSlug,
        slugs: list,
      }).catch(function (e) {
        console.error(e);
      });
    }
  }

  var cloudBundleLoaded = {};
  var cloudStarsLoaded = {};
  var cloudBundleInflight = {};
  var cloudStarsInflight = {};
  var cloudRatingProgress = {};
  var cloudRatingProgressInflight = {};
  var cloudRatingProgressRefreshInflight = {};
  var cloudRatingAchievementClaimInflight = {};
  var cloudInsightsLoaded = {};
  var cloudInsightsInflight = {};
  var cloudInsights = {};
  var cloudAwardsLoaded = {};
  var cloudAwardsInflight = {};
  var cloudAwards = {};
  var cloudContent = {};
  var staticContent = {};
  var staticContentInflight = {};
  var staticContentCacheName =
    "mythos-archive-content-" +
    String(window.ARCHIVE_STATIC_VERSION || "current");

  function hydrateWorkBundle(id, data) {
    store.ratings[id] = data.ratings || [];
    store.comments[id] = data.comments || [];
    if (data.authorNote) store.authorNotes[id] = data.authorNote;
    else delete store.authorNotes[id];
    if (data.content && isValidWorkContentHtml(data.content.html)) {
      cloudContent[id] = data.content;
      return true;
    }
    if (staticContent[id]) {
      cloudContent[id] = staticContent[id];
      return false;
    }
    delete cloudContent[id];
    return false;
  }

  // 在线改过的正文：从 HTML 重新推算右侧小标题索引
  function sectionsFromHtml(html) {
    var out = [];
    try {
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      Array.prototype.forEach.call(
        doc.querySelectorAll("h2[id], h3[id]"),
        function (node) {
          out.push({
            id: node.id,
            title: String(node.textContent || "").trim(),
            level: node.tagName === "H3" ? 3 : 2,
          });
        },
      );
    } catch (e) {
      /* 解析失败就当没有小标题 */
    }
    return out;
  }

  function staticWorkContentUrl(id) {
    var parts = String(id || "").split("/");
    if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) return "";
    var staticRoot = String(window.ARCHIVE_STATIC_ROOT || "").replace(/\/+$/, "");
    var url =
      staticRoot +
      "/archive-content/" +
      encodeURIComponent(parts[0]) +
      "/" +
      encodeURIComponent(parts.slice(1).join("/")) +
      ".html";
    var version = String(window.ARCHIVE_STATIC_VERSION || "").trim();
    return version
      ? url + (url.indexOf("?") === -1 ? "?" : "&") + "v=" + encodeURIComponent(version)
      : url;
  }

  function readStaticContentCache(url) {
    if (!window.caches) return Promise.resolve(null);
    return window.caches
      .open(staticContentCacheName)
      .then(function (cache) {
        return cache.match(url);
      })
      .catch(function () {
        return null;
      });
  }

  function writeStaticContentCache(url, response) {
    if (!window.caches || !response || !response.ok) return Promise.resolve();
    return window.caches
      .open(staticContentCacheName)
      .then(function (cache) {
        return cache.put(url, response.clone());
      })
      .catch(function () {
        /* 缓存失败不影响正文展示。 */
      });
  }

  function loadStaticWorkContent(id) {
    var url = staticWorkContentUrl(id);
    if (!url) return Promise.reject(new Error("作品编号无效"));
    if (staticContent[id]) return Promise.resolve(staticContent[id]);
    if (staticContentInflight[id]) return staticContentInflight[id];

    staticContentInflight[id] = readStaticContentCache(url)
      .then(function (cached) {
        if (cached) return cached.text();
        return fetch(url, { cache: "default" }).then(function (response) {
          if (!response.ok) {
            throw new Error("正文文件不存在（" + response.status + "）");
          }
          return writeStaticContentCache(url, response).then(function () {
            return response.text();
          });
        });
      })
      .then(function (html) {
        if (!html.trim()) throw new Error("正文为空");
        var content = { html: html, updatedAt: "", editedBy: "" };
        staticContent[id] = content;
        return content;
      })
      .then(
        function (content) {
          delete staticContentInflight[id];
          return content;
        },
        function (err) {
          delete staticContentInflight[id];
          throw err;
        },
      );
    return staticContentInflight[id];
  }

  function prefetchAllowed() {
    if (!USE_CLOUD || navigator.onLine === false) return false;
    var connection =
      navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return true;
    if (connection.saveData) return false;
    return ["slow-2g", "2g"].indexOf(connection.effectiveType) === -1;
  }

  function prefetchWorkData(edition, work) {
    if (!prefetchAllowed() || !edition || !work) return;
    var id = workId(edition.slug, work.slug);
    if (isArchivedEdition(edition)) {
      loadStaticWorkContent(id).catch(function () {
        /* 预取失败不影响用户主动打开这篇文章时的重试。 */
      });
      return;
    }
    loadCloudWorkBundle(id).catch(function () {
      /* 预取失败不影响用户主动打开这篇文章时的重试。 */
    });
  }

  function bindPrefetchIntent(button, edition, work) {
    if (!button) return;
    var prefetch =
      edition && work
        ? function () {
            prefetchWorkData(edition, work);
          }
        : null;
    button.onmouseenter = prefetch;
    button.onfocus = prefetch;
    button.ontouchstart = prefetch;
  }

  function scheduleArchivedAdjacentPrefetch(edition, work) {
    if (!prefetchAllowed() || !isArchivedEdition(edition)) return;
    var index = edition.works.indexOf(work);
    if (index === -1) return;
    var targets = [edition.works[index - 1], edition.works[index + 1]].filter(Boolean);
    var run = function () {
      targets.forEach(function (target) {
        prefetchWorkData(edition, target);
      });
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      window.setTimeout(run, 1200);
    }
  }

  function updateWorkSpotlightNote() {
    var note = refs.content.querySelector(".work-spotlight-note");
    if (!note) return;
    var edition = findEdition(state.editionSlug);
    var work = edition && findWork(edition, state.workSlug);
    var info = work && spotlightForWork(spotlightCache[edition.slug], edition, work);
    var card = refs.content.querySelector(".work-card");
    var seal = card && card.querySelector(".work-spotlight-seal");
    if (card) card.classList.toggle("has-spotlight", !!(info && info.date));
    if (info && info.date) {
      note.textContent = "今日聚光 · " + formatShortDate(info.date);
      note.hidden = false;
      if (!seal && card) {
        var spotlightSeal = createSpotlightSeal(formatShortDate(info.date));
        spotlightSeal.classList.add("work-spotlight-seal");
        card.appendChild(spotlightSeal);
      }
    } else {
      note.hidden = true;
      if (seal) seal.remove();
    }
  }

  function charsFromHtml(html) {
    var text = String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, function (_, code) {
        return String.fromCodePoint(Number(code));
      })
      .replace(/&#x([0-9a-f]+);/gi, function (_, code) {
        return String.fromCodePoint(parseInt(code, 16));
      });
    var han = text.match(/\p{Script=Han}/gu) || [];
    var nonHan = text.replace(/\p{Script=Han}/gu, " ");
    var words =
      nonHan.match(/[A-Za-z0-9]+(?:['’._:/-][A-Za-z0-9]+)*/g) || [];
    return han.length + words.length;
  }

  function excerptFromHtml(html) {
    try {
      var doc = new DOMParser().parseFromString(String(html || ""), "text/html");
      var first = doc.querySelector("p");
      var text = first ? first.textContent : doc.body.textContent;
      return String(text || "").replace(/\s+/g, " ").trim();
    } catch (e) {
      return "";
    }
  }

  function isValidWorkContentHtml(html) {
    var source = String(html || "").trim();
    if (!source || /<(?:!doctype|html|head|body)\b/i.test(source)) return false;
    try {
      var doc = new DOMParser().parseFromString(source, "text/html");
      if (doc.querySelector("#layout, #boot-splash, script, link, meta")) {
        return false;
      }
      return !!doc.querySelector("h2, h3, h4, h5, p, blockquote, ul, ol, table");
    } catch (e) {
      return false;
    }
  }

  function trimShareText(text, limit) {
    var value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return "";
    if (value.length <= limit) return value;
    return value.slice(0, Math.max(0, limit - 1)).trimEnd() + "…";
  }

  function loadCloudWorkBundle(id, force) {
    if (!USE_CLOUD) return Promise.resolve();
    if (!force && cloudBundleLoaded[id]) return Promise.resolve();
    if (!force && cloudBundleInflight[id]) return cloudBundleInflight[id];
    cloudBundleInflight[id] = window.MythosAPI.call("getWorkBundle", {
      workId: id,
    })
      .then(function (data) {
        var acceptedContent = hydrateWorkBundle(id, data || {});
        if (acceptedContent) {
          cloudBundleLoaded[id] = true;
          return;
        }
        if (staticContent[id]) {
          cloudContent[id] = staticContent[id];
          cloudBundleLoaded[id] = true;
          return;
        }
        return loadStaticWorkContent(id).then(function (content) {
          cloudContent[id] = content;
          cloudBundleLoaded[id] = true;
        });
      })
      .then(
        function () {
          delete cloudBundleInflight[id];
        },
        function (err) {
          delete cloudBundleInflight[id];
          throw err;
        },
      );
    return cloudBundleInflight[id];
  }

  function loadCloudStars(editionSlug, force) {
    if (!USE_CLOUD || !canInteract()) {
      cloudStarsLoaded[editionSlug] = true;
      return Promise.resolve();
    }
    if (!force && cloudStarsLoaded[editionSlug]) return Promise.resolve();
    if (!force && cloudStarsInflight[editionSlug]) {
      return cloudStarsInflight[editionSlug];
    }
    cloudStarsInflight[editionSlug] = window.MythosAPI.call("getStars", {
      editionSlug: editionSlug,
    })
      .then(function (data) {
        var bag = store.stars[editionSlug] || {};
        if (Array.isArray(bag)) bag = {};
        bag[starKey()] = (data && data.stars) || [];
        store.stars[editionSlug] = bag;
        cloudStarsLoaded[editionSlug] = true;
      })
      .then(
        function () {
          delete cloudStarsInflight[editionSlug];
        },
        function (err) {
          delete cloudStarsInflight[editionSlug];
          throw err;
        },
      );
    return cloudStarsInflight[editionSlug];
  }

  function loadCloudEditionInsights(editionSlug, force) {
    if (!USE_CLOUD) return Promise.resolve(null);
    if (!force && cloudInsightsLoaded[editionSlug]) {
      return Promise.resolve(cloudInsights[editionSlug]);
    }
    if (!force && cloudInsightsInflight[editionSlug]) {
      return cloudInsightsInflight[editionSlug];
    }
    cloudInsightsInflight[editionSlug] = window.MythosAPI
      .call("getEditionInsights", { editionSlug: editionSlug })
      .then(function (data) {
        cloudInsights[editionSlug] = data || {};
        cloudInsightsLoaded[editionSlug] = true;
        return cloudInsights[editionSlug];
      })
      .then(
        function (data) {
          delete cloudInsightsInflight[editionSlug];
          return data;
        },
        function (err) {
          delete cloudInsightsInflight[editionSlug];
          throw err;
        },
      );
    return cloudInsightsInflight[editionSlug];
  }

  function loadCloudEditionAwards(editionSlug, force) {
    if (!USE_CLOUD) return Promise.resolve(null);
    if (!force && cloudAwardsLoaded[editionSlug]) {
      return Promise.resolve(cloudAwards[editionSlug]);
    }
    if (!force && cloudAwardsInflight[editionSlug]) {
      return cloudAwardsInflight[editionSlug];
    }
    cloudAwardsInflight[editionSlug] = window.MythosAPI
      .call("getEditionAwards", { editionSlug: editionSlug })
      .then(function (data) {
        cloudAwards[editionSlug] = data || { published: false, authorReveals: {}, specialAwards: [] };
        cloudAwardsLoaded[editionSlug] = true;
        return cloudAwards[editionSlug];
      })
      .then(
        function (data) {
          delete cloudAwardsInflight[editionSlug];
          return data;
        },
        function (err) {
          delete cloudAwardsInflight[editionSlug];
          throw err;
        },
      );
    return cloudAwardsInflight[editionSlug];
  }

  function editionAwardsData(editionSlug) {
    if (USE_CLOUD) return cloudAwards[editionSlug] || null;
    if (!isPublicPhase(editionSlug)) return null;
    var config =
      store.settings.awardConfigs && store.settings.awardConfigs[editionSlug];
    if (!config) return null;
    var edition = findEdition(editionSlug);
    var ranked = edition
      ? edition.works
          .map(function (work) {
            return {
              work: work,
              id: workId(editionSlug, work.slug),
              stats: averages(workId(editionSlug, work.slug)),
            };
          })
          .filter(function (row) { return row.stats.count > 0; })
          .sort(function (a, b) {
            return b.stats.overall - a.stats.overall ||
              b.stats.count - a.stats.count ||
              a.id.localeCompare(b.id);
          })
      : [];
    var specialAwards = config.specialAwards || [];
    var revealIds = new Set(
      ranked.slice(0, Number(config.authorRevealRankLimit) || 0).map(function (row) { return row.id; }),
    );
    specialAwards.forEach(function (award) { if (award && award.workId) revealIds.add(award.workId); });
    var authorReveals = {};
    revealIds.forEach(function (id) {
      var slug = id.slice(editionSlug.length + 1);
      var work = edition && findWork(edition, slug);
      var qq = work && effectiveAuthorQQ(id, work);
      var author = qq && store.users[qq];
      if (author && author.nickname) authorReveals[id] = author.nickname;
    });
    return {
      published: true,
      authorRevealRankLimit: Number(config.authorRevealRankLimit) || 0,
      authorReveals: authorReveals,
      awardedWorkIds: Array.from(revealIds),
      specialAwards: specialAwards,
    };
  }

  function revealedAuthorName(editionSlug, id) {
    var result = editionAwardsData(editionSlug);
    return result && result.published && result.authorReveals
      ? String(result.authorReveals[id] || "")
      : "";
  }

  function clearCloudCaches() {
    cloudBundleLoaded = {};
    cloudStarsLoaded = {};
    cloudBundleInflight = {};
    cloudStarsInflight = {};
    cloudRatingProgress = {};
    cloudRatingProgressInflight = {};
    cloudRatingProgressRefreshInflight = {};
    cloudRatingAchievementClaimInflight = {};
    cloudInsightsLoaded = {};
    cloudInsightsInflight = {};
    cloudInsights = {};
    cloudAwardsLoaded = {};
    cloudAwardsInflight = {};
    cloudAwards = {};
    cloudUserList = [];
  }

  /* ---------- 首页聚光灯 ---------- */

  function spotlightForWork(result, edition, targetWork) {
    if (!result || !Array.isArray(result.items) || !edition) return null;
    var targetSlug = targetWork && targetWork.slug ? targetWork.slug : "";
    for (var i = 0; i < result.items.length; i++) {
      var item = result.items[i];
      if (item && item.workId && item.workId.indexOf(edition.slug + "/") === 0) {
        var slug = item.workId.slice(edition.slug.length + 1);
        if (targetSlug && slug !== targetSlug) continue;
        var work = findWork(edition, slug);
        if (work) return { item: item, work: work, date: result.date };
      }
    }
    return null;
  }

  function loadSpotlight(editionSlug, force) {
    if (!USE_CLOUD) {
      return Promise.resolve({
        editionSlug: editionSlug,
        date: dateKeyInTimezone(new Date(), SPOTLIGHT_TIMEZONE),
        items: [],
      });
    }
    if (!force && spotlightCache[editionSlug]) {
      return Promise.resolve(spotlightCache[editionSlug]);
    }
    if (!force && spotlightInflight[editionSlug]) {
      return spotlightInflight[editionSlug];
    }
    spotlightInflight[editionSlug] = window.MythosAPI.call("getSpotlight", {
      editionSlug: editionSlug,
    })
      .then(function (data) {
        var result = data || {
          editionSlug: editionSlug,
          date: dateKeyInTimezone(new Date(), SPOTLIGHT_TIMEZONE),
          items: [],
        };
        result.items = Array.isArray(result.items) ? result.items : [];
        spotlightCache[editionSlug] = result;
        return result;
      })
      .then(
        function (data) {
          delete spotlightInflight[editionSlug];
          return data;
        },
        function (err) {
          delete spotlightInflight[editionSlug];
          throw err;
        },
      );
    return spotlightInflight[editionSlug];
  }

  function createSpotlightSection(edition) {
    var section = el("section", "home-section spotlight-section");
    section.id = "home-spotlight";
    var head = el("div", "home-section-head");
    var titleBox = el("div");
    titleBox.appendChild(el("div", "home-eyebrow", "DAILY SPOTLIGHT · " + formatShortDate(new Date())));
    titleBox.appendChild(el("h2", "home-section-title", "今日聚光"));
    head.appendChild(titleBox);
    head.appendChild(el("p", "home-section-note", "今日聚光正在翻阅档案。"));
    head.appendChild(createSpotlightSeal(formatShortDate(new Date())));
    section.appendChild(head);
    section.appendChild(el("div", "spotlight-list"));
    return section;
  }

  function spotlightFlavorText(count) {
    var normalized = Math.floor(Number(count));
    if (!isFinite(normalized) || normalized <= 0) {
      return "今日暂无档案被灯光照亮。";
    }
    var numberText = ["", "一", "两", "三", "四", "五"][normalized] || String(normalized);
    var pronoun = normalized === 1 ? "它" : "它们";
    return (
      "今日有" +
      numberText +
      "份档案被灯光照亮。" +
      pronoun +
      "暂离沉灰，等待下一位调查员翻开封页。"
    );
  }

  function paintSpotlightSection(section, edition, result, error, onRetry) {
    var list = section.querySelector(".spotlight-list");
    if (!list) return;
    clear(list);
    var note = section.querySelector(".home-section-note");
    var eyebrow = section.querySelector(".home-eyebrow");
    if (eyebrow) {
      eyebrow.textContent =
        "DAILY SPOTLIGHT · " +
        formatShortDate(result && result.date ? result.date : new Date());
    }
    if (error) {
      if (note) note.textContent = "今日聚光暂时无法读取。";
      list.appendChild(el("p", "spotlight-empty", "今日聚光暂时无法读取。"));
      var retry = el("button", "btn-ghost spotlight-retry", "重新读取");
      retry.type = "button";
      retry.addEventListener("click", onRetry);
      list.appendChild(retry);
      return;
    }
    var items = result && Array.isArray(result.items) ? result.items : [];
    var rows = [];
    items.forEach(function (item) {
      if (!item || !item.workId) return;
      var prefix = edition.slug + "/";
      if (item.workId.indexOf(prefix) !== 0) return;
      var work = findWork(edition, item.workId.slice(prefix.length));
      if (!work) return;
      rows.push({ item: item, work: work });
    });
    if (note) note.textContent = spotlightFlavorText(rows.length);
    if (!rows.length) {
      list.appendChild(el("p", "spotlight-empty", "今日暂无聚光档案。"));
      return;
    }
    rows
      .sort(function (a, b) {
        return (a.item.position || 0) - (b.item.position || 0);
      })
      .forEach(function (entry) {
        var work = entry.work;
        var item = entry.item;
        var link = el("a", "spotlight-item");
        link.href = "#/" + edition.slug + "/" + encodeURIComponent(work.slug);
        var no = el("div", "spotlight-no", String(work.no).padStart(3, "0"));
        var title = el("div", "spotlight-title-box");
        title.appendChild(el("h3", "spotlight-title", work.title));
        title.appendChild(
          el(
            "div",
            "spotlight-meta",
            work.author + " · 约 " + work.chars + " 字",
          ),
        );
        var excerpt = el("p", "spotlight-excerpt", workExcerpt(work));
        var status = el("div", "spotlight-status");
        status.appendChild(el("span", "spotlight-label", item.publicLabel || "今日聚光"));
        status.appendChild(el("span", "spotlight-enter", "进入阅读 →"));
        link.appendChild(no);
        link.appendChild(title);
        link.appendChild(excerpt);
        link.appendChild(status);
        list.appendChild(link);
      });
  }

  /* ---------- 评分 ---------- */

  function ratingsOf(id) {
    return store.ratings[id] || [];
  }

  function averages(id) {
    var list = ratingsOf(id);
    var result = { count: list.length };
    DIMENSIONS.forEach(function (dim) {
      if (!list.length) {
        result[dim.key] = null;
        return;
      }
      var sum = 0;
      for (var i = 0; i < list.length; i++) sum += list[i][dim.key] || 0;
      result[dim.key] = sum / list.length;
    });
    return result;
  }

  function myRatingOf(id) {
    var user = currentUser();
    if (!user) return null;
    var list = ratingsOf(id);
    for (var i = 0; i < list.length; i++) {
      if (list[i].qq === user.qq) return list[i];
    }
    return null;
  }

  function localRatedWorkIds(edition) {
    if (!edition || !canInteract()) return [];
    return edition.works.filter(function (work) {
      return !!myRatingOf(workId(edition.slug, work.slug));
    }).map(function (work) {
      return workId(edition.slug, work.slug);
    });
  }

  function ratingAchievementDefinitions(total) {
    var count = Math.max(0, Number(total) || 0);
    var thresholds = RATING_ACHIEVEMENT_MILESTONES.filter(function (threshold) {
      return threshold < count;
    });
    if (count > 0) thresholds.push(count);
    return thresholds.filter(function (threshold, index) {
      return thresholds.indexOf(threshold) === index;
    }).map(function (threshold) {
      var isFirst = threshold === 5;
      var isComplete = threshold === count;
      var title = RATING_ACHIEVEMENT_TITLES[threshold] ||
        (isComplete ? "幻梦全录" : "第" + Math.ceil(threshold / 5) + "层回声");
      var description = isFirst
        ? "你已为本届 5 份档案留下评议。幻梦境的门，已经向你敞开。"
        : isComplete
          ? "你已为本届全部 " + count + " 份档案留下评议。此番下潜，幻梦境已被你完整记录。"
          : "你已为本届 " + threshold + " 份档案留下评议。梦境的回声，又向深处延伸一步。";
      return {
        key: isFirst ? "first-five" : isComplete ? "full-volume" : "rated-" + threshold,
        threshold: threshold,
        title: title,
        description: description,
      };
    });
  }

  function localRatingAchievementStates(edition, ratedCount) {
    if (!edition || !canInteract()) return [];
    var user = currentUser();
    var legacyId = edition.slug + "::" + user.qq;
    var definitions = ratingAchievementDefinitions(edition.works.length);
    var missingReached = definitions.filter(function (definition) {
      var key = legacyId + "::" + definition.key;
      var hasLegacyFirst = definition.key === "first-five" && store.ratingAchievements[legacyId];
      return definition.threshold <= ratedCount && !store.ratingAchievements[key] && !hasLegacyFirst;
    });
    var newestMissingKey = missingReached.length
      ? missingReached[missingReached.length - 1].key
      : "";
    if (missingReached.length) {
      var now = new Date().toISOString();
      missingReached.forEach(function (definition) {
        store.ratingAchievements[legacyId + "::" + definition.key] = {
          unlockedAt: now,
          notifiedAt: definition.key === newestMissingKey ? null : now,
        };
      });
      persist();
    }

    return definitions.map(function (definition) {
      var record = store.ratingAchievements[legacyId + "::" + definition.key];
      if (!record && definition.key === "first-five") record = store.ratingAchievements[legacyId];
      return Object.assign({}, definition, {
        unlocked: !!record,
        noticePending: !!(record && !record.notifiedAt),
        unlockedAt: record ? record.unlockedAt : null,
      });
    });
  }

  function localRatingProgress(edition) {
    var ratedWorkIds = localRatedWorkIds(edition);
    var achievements = localRatingAchievementStates(edition, ratedWorkIds.length);
    var pendingAchievements = achievements.filter(function (item) { return item.noticePending; });
    return {
      status: "loaded",
      editionSlug: edition.slug,
      ratedWorkIds: ratedWorkIds,
      ratedCount: ratedWorkIds.length,
      eligibleWorkCount: edition.works.length,
      milestone: RATING_PROGRESS_MILESTONE,
      achievements: achievements,
      pendingAchievements: pendingAchievements,
      nextAchievement: achievements.find(function (item) { return !item.unlocked; }) || null,
      achievementUnlocked: achievements.some(function (item) { return item.unlocked; }),
      achievementNoticePending: pendingAchievements.length > 0,
    };
  }

  function ratingProgressAvailable(edition) {
    if (!edition || edition.slug !== RATING_PROGRESS_EDITION) return false;
    if (!canInteract()) return false;
    return isArchivedEdition(edition) || phaseOf(edition.slug) !== "征文";
  }

  function loadCloudRatingProgress(editionSlug, force) {
    if (!USE_CLOUD || !canInteract()) return Promise.resolve(null);
    if (!force && cloudRatingProgress[editionSlug] && cloudRatingProgress[editionSlug].status === "loaded") {
      return Promise.resolve(cloudRatingProgress[editionSlug]);
    }
    if (cloudRatingProgressRefreshInflight[editionSlug]) {
      return cloudRatingProgressRefreshInflight[editionSlug];
    }
    if (cloudRatingProgressInflight[editionSlug]) {
      if (!force) return cloudRatingProgressInflight[editionSlug];
      var currentRequest = cloudRatingProgressInflight[editionSlug];
      var refreshRequest = currentRequest.then(
        function () { return requestCloudRatingProgress(editionSlug); },
        function () { return requestCloudRatingProgress(editionSlug); },
      );
      cloudRatingProgressRefreshInflight[editionSlug] = refreshRequest.then(
        function (data) {
          delete cloudRatingProgressRefreshInflight[editionSlug];
          return data;
        },
        function (error) {
          delete cloudRatingProgressRefreshInflight[editionSlug];
          throw error;
        },
      );
      return cloudRatingProgressRefreshInflight[editionSlug];
    }
    return requestCloudRatingProgress(editionSlug);
  }

  function requestCloudRatingProgress(editionSlug) {
    cloudRatingProgress[editionSlug] = { status: "loading", editionSlug: editionSlug };
    cloudRatingProgressInflight[editionSlug] = window.MythosAPI.call(
      "getMyRatingProgress",
      { editionSlug: editionSlug },
    ).then(function (data) {
      var achievements = Array.isArray(data && data.achievements)
        ? data.achievements
        : [];
      if (!achievements.length && data && data.achievementUnlocked) {
        var legacyAchievement = ratingAchievementDefinitions(Number(data.eligibleWorkCount) || 53)[0];
        achievements = [Object.assign({}, legacyAchievement, {
          unlocked: true,
          noticePending: !!data.achievementNoticePending,
        })];
      }
      var pendingAchievements = Array.isArray(data && data.pendingAchievements)
        ? data.pendingAchievements
        : achievements.filter(function (item) { return item.noticePending; });
      cloudRatingProgress[editionSlug] = {
        status: "loaded",
        editionSlug: editionSlug,
        ratedWorkIds: Array.isArray(data && data.ratedWorkIds) ? data.ratedWorkIds : [],
        ratedCount: Number(data && data.ratedCount) || 0,
        eligibleWorkCount: Number(data && data.eligibleWorkCount) || 0,
        milestone: Number(data && data.milestone) || RATING_PROGRESS_MILESTONE,
        achievements: achievements,
        pendingAchievements: pendingAchievements,
        nextAchievement: data && data.nextAchievement || achievements.find(function (item) { return !item.unlocked; }) || null,
        achievementUnlocked: achievements.some(function (item) { return item.unlocked; }) || !!(data && data.achievementUnlocked),
        achievementNoticePending: pendingAchievements.length > 0 || !!(data && data.achievementNoticePending),
      };
      updateWitchRatingProgress(findEdition(editionSlug), cloudRatingProgress[editionSlug]);
      refreshRatingProgressViews(editionSlug);
      if (cloudRatingProgress[editionSlug].achievementNoticePending) {
        window.setTimeout(function () {
          claimPendingRatingAchievement(editionSlug);
        }, 0);
      }
      return cloudRatingProgress[editionSlug];
    }).catch(function (error) {
      cloudRatingProgress[editionSlug] = {
        status: "error",
        editionSlug: editionSlug,
        message: error && error.message ? error.message : String(error),
      };
      refreshRatingProgressViews(editionSlug);
      throw error;
    }).then(function (data) {
      delete cloudRatingProgressInflight[editionSlug];
      return data;
    }, function (error) {
      delete cloudRatingProgressInflight[editionSlug];
      throw error;
    });
    return cloudRatingProgressInflight[editionSlug];
  }

  function claimPendingRatingAchievement(editionSlug) {
    var progress = cloudRatingProgress[editionSlug];
    var edition = findEdition(editionSlug);
    if (!USE_CLOUD) {
      if (!edition || !ratingProgressAvailable(edition)) return Promise.resolve(false);
      progress = localRatingProgress(edition);
      var localPending = progress.pendingAchievements && progress.pendingAchievements[0];
      if (!localPending) return Promise.resolve(false);
      if (cloudRatingAchievementClaimInflight[editionSlug]) {
        return cloudRatingAchievementClaimInflight[editionSlug];
      }
      var localUserId = editionSlug + "::" + currentUser().qq;
      var localAchievementId = localUserId + "::" + localPending.key;
      var localRecord = store.ratingAchievements[localAchievementId];
      if (!localRecord && localPending.key === "first-five") {
        localRecord = store.ratingAchievements[localUserId];
      }
      if (!localRecord || localRecord.notifiedAt) return Promise.resolve(false);
      localRecord.notifiedAt = new Date().toISOString();
      persist();
      var localClaim = Promise.resolve(true).then(function () {
        refreshRatingProgressViews(editionSlug);
        updateWitchRatingProgress(edition, localRatingProgress(edition));
        showRatingAchievementNotice(editionSlug, localPending);
        return true;
      }).then(function (claimed) {
        delete cloudRatingAchievementClaimInflight[editionSlug];
        return claimed;
      });
      cloudRatingAchievementClaimInflight[editionSlug] = localClaim;
      return localClaim;
    }
    var pending = progress && Array.isArray(progress.pendingAchievements)
      ? progress.pendingAchievements[0]
      : null;
    if (!pending && progress && progress.achievementNoticePending) {
      pending = (progress.achievements || []).find(function (item) { return item.noticePending; }) || null;
    }
    if (!progress || !pending) return Promise.resolve(false);
    if (cloudRatingAchievementClaimInflight[editionSlug]) {
      return cloudRatingAchievementClaimInflight[editionSlug];
    }
    cloudRatingAchievementClaimInflight[editionSlug] = window.MythosAPI.call(
      "claimRatingAchievement",
      { editionSlug: editionSlug, achievementKey: pending.key },
    ).then(function (result) {
      var current = cloudRatingProgress[editionSlug];
      if (current) {
        current.achievements = (current.achievements || []).map(function (item) {
          return item.key === pending.key
            ? Object.assign({}, item, { noticePending: false })
            : item;
        });
        current.pendingAchievements = current.achievements.filter(function (item) { return item.noticePending; });
        current.achievementNoticePending = current.pendingAchievements.length > 0;
        updateWitchRatingProgress(edition, current);
      }
      refreshRatingProgressViews(editionSlug);
      if (result && result.claimed) {
        var hasMorePending = !!(current && current.pendingAchievements.length);
        showRatingAchievementNotice(
          editionSlug,
          result.achievement || pending,
          hasMorePending ? function () { claimPendingRatingAchievement(editionSlug); } : null,
        );
      }
      return !!(result && result.claimed);
    }).catch(function (error) {
      console.error(error);
      return false;
    }).then(function (claimed) {
      delete cloudRatingAchievementClaimInflight[editionSlug];
      return claimed;
    });
    return cloudRatingAchievementClaimInflight[editionSlug];
  }

  function ratingProgressData(edition) {
    if (!ratingProgressAvailable(edition)) return null;
    if (!USE_CLOUD) {
      var localProgress = localRatingProgress(edition);
      updateWitchRatingProgress(edition, localProgress);
      if (localProgress.achievementNoticePending) {
        window.setTimeout(function () { claimPendingRatingAchievement(edition.slug); }, 0);
      }
      return localProgress;
    }
    var progress = cloudRatingProgress[edition.slug];
    if (!progress) {
      progress = cloudRatingProgress[edition.slug] = {
        status: "loading",
        editionSlug: edition.slug,
      };
      loadCloudRatingProgress(edition.slug, false).catch(function () {});
    } else if (progress.status === "loaded" && progress.achievementNoticePending) {
      window.setTimeout(function () {
        claimPendingRatingAchievement(edition.slug);
      }, 0);
    }
    updateWitchRatingProgress(edition, progress);
    return progress;
  }

  function ratingPercent(progress, total) {
    var denominator = total || (progress && progress.eligibleWorkCount);
    if (!progress || !denominator) return 0;
    return Math.max(0, Math.min(100, progress.ratedCount / denominator * 100));
  }

  function firstUnratedWork(edition, progress, skipWorkId) {
    if (!edition || !progress || !Array.isArray(progress.ratedWorkIds)) return null;
    var rated = {};
    progress.ratedWorkIds.forEach(function (id) { rated[id] = true; });
    for (var i = 0; i < edition.works.length; i++) {
      var work = edition.works[i];
      var id = workId(edition.slug, work.slug);
      if (!rated[id] && id !== skipWorkId) return work;
    }
    return null;
  }

  function showRatingAchievementModal(editionSlug, selectedAchievement) {
    var edition = findEdition(editionSlug);
    var progress = edition
      ? (USE_CLOUD ? cloudRatingProgress[editionSlug] : localRatingProgress(edition))
      : null;
    var achievements = progress && Array.isArray(progress.achievements)
      ? progress.achievements.filter(function (item) { return item.unlocked; })
      : [];
    var body = el("div", "modal-body rating-achievement-detail");
    body.appendChild(el("div", "rating-achievement-mark", "✦"));
    body.appendChild(el("h3", "rating-achievement-title", "已解锁 " + achievements.length + " 项成就"));
    if (achievements.length) {
      var list = el("div", "rating-achievement-list");
      achievements.forEach(function (achievement) {
        var item = el("article", "rating-achievement-item");
        var heading = el("div", "rating-achievement-item-head");
        heading.appendChild(el("strong", null, achievement.title));
        heading.appendChild(el("span", null, achievement.threshold + "/" + (progress.eligibleWorkCount || 53)));
        item.appendChild(heading);
        item.appendChild(el("p", null, achievement.description));
        list.appendChild(item);
      });
      body.appendChild(list);
    } else if (selectedAchievement) {
      body.appendChild(el("p", "modal-meta", selectedAchievement.description));
    }
    openModal("成就记录", body);
  }

  var ratingAchievementTimer = null;
  var ratingAchievementNoticeQueue = [];
  var ratingAchievementActiveNotice = null;
  var ratingAchievementActiveOnDismiss = null;

  function removeRatingAchievementNotice(notice) {
    if (notice && notice.parentNode) notice.parentNode.removeChild(notice);
    if (ratingAchievementActiveNotice !== notice) return;
    if (ratingAchievementTimer) window.clearTimeout(ratingAchievementTimer);
    ratingAchievementTimer = null;
    ratingAchievementActiveNotice = null;
    var onDismiss = ratingAchievementActiveOnDismiss;
    ratingAchievementActiveOnDismiss = null;
    if (ratingAchievementNoticeQueue.length) {
      window.setTimeout(showNextRatingAchievementNotice, 180);
    }
    if (onDismiss) onDismiss();
  }

  function showRatingAchievementNotice(editionSlug, achievement, onDismiss) {
    ratingAchievementNoticeQueue.push({
      editionSlug: editionSlug,
      achievement: achievement,
      onDismiss: onDismiss || null,
    });
    showNextRatingAchievementNotice();
  }

  function showNextRatingAchievementNotice() {
    if (ratingAchievementActiveNotice || !ratingAchievementNoticeQueue.length) return;
    var notification = ratingAchievementNoticeQueue.shift();
    var editionSlug = notification.editionSlug;
    var edition = findEdition(editionSlug);
    var total = edition ? edition.works.length : 53;
    var details = notification.achievement || ratingAchievementDefinitions(total)[0];
    var slot = refs.content.querySelector('.rating-progress-slot[data-edition="' + editionSlug + '"]');
    if (isMobileLayout() && slot) {
      var inlineNotice = el("div", "rating-achievement-notice");
      inlineNotice.setAttribute("role", "status");
      inlineNotice.setAttribute("aria-live", "polite");
      var inlineCopy = el("div", "rating-achievement-copy");
      inlineCopy.appendChild(el("strong", null, "✦ 成就解锁：" + details.title));
      inlineCopy.appendChild(el("span", null, details.description));
      inlineNotice.appendChild(inlineCopy);
      var inlineClose = el("button", "rating-achievement-close", "收起");
      inlineClose.type = "button";
      inlineClose.setAttribute("aria-label", "收起成就提示");
      inlineClose.addEventListener("click", function () { removeRatingAchievementNotice(inlineNotice); });
      inlineNotice.appendChild(inlineClose);
      slot.appendChild(inlineNotice);
      ratingAchievementActiveNotice = inlineNotice;
      ratingAchievementActiveOnDismiss = notification.onDismiss;
      ratingAchievementTimer = window.setTimeout(function () { removeRatingAchievementNotice(inlineNotice); }, 4800);
      return;
    }

    var notice = el("section", "rating-achievement-toast");
    notice.id = "rating-achievement-toast";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.appendChild(el("span", "rating-achievement-toast-mark", "✦"));
    var copy = el("div", "rating-achievement-toast-copy");
    copy.appendChild(el("span", "rating-achievement-toast-kicker", "卡莉欧碧 · 成就解锁"));
    copy.appendChild(el("strong", "rating-achievement-toast-title", details.title));
    copy.appendChild(el("span", "rating-achievement-toast-meta", "已评 " + details.threshold + " / " + total + " 篇"));
    copy.appendChild(el("p", "rating-achievement-toast-description", details.description));
    notice.appendChild(copy);
    var close = el("button", "rating-achievement-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "收起成就提示");
    close.addEventListener("click", function () { removeRatingAchievementNotice(notice); });
    notice.appendChild(close);
    document.body.appendChild(notice);
    ratingAchievementActiveNotice = notice;
    ratingAchievementActiveOnDismiss = notification.onDismiss;
    ratingAchievementTimer = window.setTimeout(function () { removeRatingAchievementNotice(notice); }, 5200);
  }

  function renderRatingProgress(edition, compact, currentWorkId) {
    if (!ratingProgressAvailable(edition)) return null;
    var progress = ratingProgressData(edition);
    var slot = el("section", "rating-progress-slot" + (compact ? " is-compact" : ""));
    slot.dataset.edition = edition.slug;
    slot.dataset.workId = currentWorkId || "";
    if (!progress || progress.status === "loading") {
      slot.appendChild(el("p", "rating-progress-loading", "正在读取评议进度…"));
      return slot;
    }
    if (progress.status === "error") {
      var retry = el("button", "btn-ghost btn-tiny rating-progress-retry", "进度暂时无法读取 · 重试");
      retry.type = "button";
      retry.addEventListener("click", function () {
        loadCloudRatingProgress(edition.slug, true).catch(function () {});
      });
      slot.appendChild(retry);
      return slot;
    }

    var total = progress.eligibleWorkCount || edition.works.length;
    var count = Math.min(progress.ratedCount, total);
    var percent = ratingPercent(progress, total);
    var percentText = percent.toFixed(1);
    var achievements = Array.isArray(progress.achievements) && progress.achievements.length
      ? progress.achievements
      : ratingAchievementDefinitions(total).map(function (item) {
        return Object.assign({}, item, { unlocked: false, noticePending: false });
      });
    var unlockedAchievements = achievements.filter(function (item) { return item.unlocked; });
    var latestUnlocked = unlockedAchievements.length
      ? unlockedAchievements[unlockedAchievements.length - 1]
      : null;
    var nextAchievement = achievements.find(function (item) { return !item.unlocked; }) || null;
    if (compact) {
      var summary = el("div", "rating-progress-compact-line");
      summary.appendChild(el("span", null, "沉入幻梦境"));
      summary.appendChild(el("strong", null, count + "/" + total + " 篇 · " + percentText + "%"));
      slot.appendChild(summary);
      if (latestUnlocked) {
        var earned = el("button", "rating-progress-achievement-link", "✦ " + latestUnlocked.title + " · 已解锁");
        earned.type = "button";
        earned.addEventListener("click", function () { showRatingAchievementModal(edition.slug, latestUnlocked); });
        slot.appendChild(earned);
      }
      if (nextAchievement) {
        slot.appendChild(el("p", "rating-progress-hint", "再评 " + (nextAchievement.threshold - count) + " 篇解锁「" + nextAchievement.title + "」"));
      } else {
        slot.appendChild(el("p", "rating-progress-hint", "本届评议完成 · 幻梦全录已解锁"));
      }
      var nextWork = votingOpen(edition.slug) && myRatingOf(currentWorkId)
        ? firstUnratedWork(edition, progress, currentWorkId)
        : null;
      if (nextWork) {
        var nextLink = el("a", "rating-progress-next", "再读一份未评档案 →");
        nextLink.href = "#/" + edition.slug + "/" + encodeURIComponent(nextWork.slug);
        slot.appendChild(nextLink);
      }
      return slot;
    }

    var head = el("div", "rating-progress-head");
    var title = el("div", "rating-progress-title");
    title.appendChild(el("span", "rating-progress-kicker", "沉入幻梦境"));
    head.appendChild(title);
    head.appendChild(
      el(
        "strong",
        "rating-progress-summary",
        "已评 " + count + " / " + total + " 篇 · " + percentText + "%",
      ),
    );
    slot.appendChild(head);

    var ratedSet = {};
    (progress.ratedWorkIds || []).forEach(function (workIdValue) {
      ratedSet[workIdValue] = true;
    });
    var map = el("div", "rating-progress-map");
    var track = el("div", "rating-progress-track rating-progress-ruler-track");
    track.setAttribute("role", "group");
    track.setAttribute(
      "aria-label",
      "沉入幻梦境进度：已评 " + count + " / " + total + " 篇，" + percentText + "%",
    );
    var fill = el("span", "rating-progress-fill");
    fill.style.width = percent + "%";
    fill.setAttribute("aria-hidden", "true");
    track.appendChild(fill);
    var ticks = el("div", "rating-progress-ticks");
    ticks.style.gridTemplateColumns = "repeat(" + total + ", minmax(0, 1fr))";
    ticks.setAttribute("aria-hidden", "true");
    for (var tickAt = 5; tickAt <= total; tickAt += 5) {
      var tick = el("span", "rating-progress-tick" + (tickAt % 10 === 0 ? " is-major" : ""));
      tick.style.gridColumn = String(tickAt);
      ticks.appendChild(tick);
    }
    if (total % 5 !== 0) {
      var finalTick = el("span", "rating-progress-tick is-major");
      finalTick.style.gridColumn = String(total);
      ticks.appendChild(finalTick);
    }
    track.appendChild(ticks);
    var cells = el("div", "rating-progress-cells");
    var columns = total;
    cells.style.gridTemplateColumns = "repeat(" + columns + ", minmax(0, 1fr))";
    cells.setAttribute("aria-hidden", "true");
    edition.works.slice(0, total).forEach(function (work) {
      var id = workId(edition.slug, work.slug);
      var rated = !!ratedSet[id];
      var cell = el("span", "rating-progress-cell" + (rated ? " is-rated" : ""));
      cell.title = String(work.no).padStart(3, "0") + " · " + work.title + " · " + (rated ? "已评" : "未评");
      cell.setAttribute("aria-hidden", "true");
      cells.appendChild(cell);
    });
    track.appendChild(cells);
    map.appendChild(track);

    var ruler = el("div", "rating-progress-ruler");
    ruler.style.gridTemplateColumns = "repeat(" + columns + ", minmax(0, 1fr))";
    var rulerMarkers = [1];
    for (var marker = 10; marker <= total - 5; marker += 10) rulerMarkers.push(marker);
    if (rulerMarkers.indexOf(total) === -1) rulerMarkers.push(total);
    rulerMarkers.forEach(function (marker) {
      var label = el("span", "rating-progress-ruler-label", String(marker).padStart(3, "0"));
      if (marker === 1) label.classList.add("is-start");
      if (marker === total) label.classList.add("is-end");
      label.style.gridColumn = String(marker);
      label.dataset.marker = String(marker);
      ruler.appendChild(label);
    });
    map.appendChild(ruler);
    slot.appendChild(map);

    var foot = el("div", "rating-progress-foot");
    var footCopy = "";
    if (count >= total) {
      footCopy = "本届评议完成 · 幻梦全录已解锁";
    } else if (nextAchievement) {
      footCopy = "再评 " + (nextAchievement.threshold - count) + " 篇解锁「" + nextAchievement.title + "」";
    } else {
      footCopy = "继续评议";
    }
    foot.appendChild(el("span", "rating-progress-caption", footCopy));
    foot.appendChild(el("span", "rating-progress-milestone-note", "刻度线为成就节点"));
    slot.appendChild(foot);
    if (progress.achievementNoticePending) {
      window.setTimeout(function () { claimPendingRatingAchievement(edition.slug); }, 0);
    }
    return slot;
  }

  function refreshRatingProgressViews(editionSlug) {
    if (refs.content) {
      Array.prototype.slice.call(refs.content.querySelectorAll(".rating-progress-slot")).forEach(function (oldSlot) {
        if (oldSlot.dataset.edition !== editionSlug) return;
        var edition = findEdition(editionSlug);
        var replacement = renderRatingProgress(edition, oldSlot.classList.contains("is-compact"), oldSlot.dataset.workId || "");
        if (!replacement || !oldSlot.parentNode) return;
        var oldTrack = oldSlot.querySelector(".rating-progress-track");
        var nextTrack = replacement.querySelector(".rating-progress-track");
        var nextFill = nextTrack && nextTrack.querySelector(".rating-progress-fill");
        var oldValue = oldTrack ? Number(oldTrack.getAttribute("aria-valuenow")) : NaN;
        var oldMax = oldTrack ? Number(oldTrack.getAttribute("aria-valuemax")) : 0;
        var nextValue = nextTrack ? Number(nextTrack.getAttribute("aria-valuenow")) : NaN;
        var nextWidth = nextFill ? nextFill.style.width : "";
        if (nextFill && oldMax && oldValue !== nextValue) {
          nextFill.style.transition = "none";
          nextFill.style.width = Math.max(0, Math.min(100, oldValue / oldMax * 100)) + "%";
          oldSlot.parentNode.replaceChild(replacement, oldSlot);
          nextFill.offsetWidth;
          window.requestAnimationFrame(function () {
            nextFill.style.transition = "";
            nextFill.style.width = nextWidth;
          });
        } else {
          oldSlot.parentNode.replaceChild(replacement, oldSlot);
        }
      });
    }
    if (state && state.editionSlug === editionSlug) {
      renderToc();
      if (state.view === "edition" && state.refreshEditionList) state.refreshEditionList();
    }
  }

  function scoreDistribution(id, dimKey) {
    var bins = [0, 0, 0, 0, 0];
    ratingsOf(id).forEach(function (r) {
      var v = Math.round(r[dimKey] || 0);
      if (v >= 1 && v <= 5) bins[v - 1] += 1;
    });
    return bins;
  }

  /* ---------- 评论 ---------- */

  var openReplyRemainders = Object.create(null);
  var activeReplyComposer = "";

  function commentsOf(id) {
    return store.comments[id] || [];
  }

  // 手机端输入较长评论时，让输入区跟随内容增加高度；到五行后改为框内滚动，
  // 避免光标持续下移而让前面的文字看起来像是“消失”。
  function fitCommentTextarea(textarea) {
    var maxLines = 5;

    function fit() {
      textarea.style.height = "auto";
      var style = window.getComputedStyle(textarea);
      var lineHeight = parseFloat(style.lineHeight);
      if (!lineHeight || !isFinite(lineHeight)) lineHeight = 22;
      var maxHeight =
        lineHeight * maxLines +
        parseFloat(style.paddingTop || 0) +
        parseFloat(style.paddingBottom || 0) +
        parseFloat(style.borderTopWidth || 0) +
        parseFloat(style.borderBottomWidth || 0);
      var nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = nextHeight + "px";
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    }

    textarea.addEventListener("input", fit);
    window.requestAnimationFrame(fit);
  }

  /* ---------- DOM refs / 状态 ---------- */

  var state = {
    editionSlug: (editions[0] && editions[0].slug) || "",
    workSlug: "",
    keyword: "",
    view: "home",
    onlyUnrated: false,
    catalogueSort: "number",
    catalogueLength: "all",
    refreshEditionList: null,
  };

  var refs = {
    layout: document.getElementById("layout"),
    siteBar: document.getElementById("site-bar"),
    siteBrand: document.getElementById("site-brand"),
    siteNav: document.getElementById("site-nav"),
    siteSearch: document.getElementById("site-search"),
    siteSearchInput: document.getElementById("site-search-input"),
    siteSearchPanel: document.getElementById("site-search-panel"),
    siteAccountLink: document.getElementById("site-account-link"),
    editionSelect: document.getElementById("edition-select"),
    search: document.getElementById("search"),
    toc: document.getElementById("toc"),
    content: document.getElementById("content"),
    sidebarToggle: document.getElementById("sidebar-toggle"),
    hud: document.getElementById("hud-pager"),
    hudPrev: document.getElementById("hud-prev"),
    hudNext: document.getElementById("hud-next"),
    mobileBar: document.getElementById("mobile-bar"),
    mobileBarPrev: document.getElementById("mobile-bar-prev"),
    mobileBarNext: document.getElementById("mobile-bar-next"),
    mobileBarToc: document.getElementById("mobile-bar-toc"),
    topTools: document.getElementById("top-tools"),
    topMore: document.getElementById("top-more"),
    topMenu: document.getElementById("top-menu"),
    topResults: document.getElementById("top-results"),
    authGate: document.getElementById("auth-gate"),
    accountBar: document.getElementById("account-bar"),
    accountHud: document.getElementById("account-hud"),
    modalRoot: document.getElementById("modal-root"),
    toastRoot: document.getElementById("toast-root"),
    sidebarBackdrop: document.getElementById("sidebar-backdrop"),
    themeToggle: document.getElementById("theme-toggle"),
  };

  var sectionObserver = null;
  var spotlightCache = {};
  var spotlightInflight = {};
  var readingScrollHandler = null;
  var readingScrollTimer = null;
  var activeReadingId = "";
  var readingProgressParts = null;
  var toastTimer = null;

  function stopReadingTracking() {
    if (readingScrollHandler) {
      window.removeEventListener("scroll", readingScrollHandler);
    }
    readingScrollHandler = null;
    if (readingScrollTimer) {
      window.clearTimeout(readingScrollTimer);
    }
    readingScrollTimer = null;
    document.body.classList.remove("is-reader-compact");
    if (window.MythosWitch && window.MythosWitch.setReadingPresence) {
      window.MythosWitch.setReadingPresence(false);
    }
    if (activeReadingId && readingProgressParts) {
      var current = readingProgressParts.getValue
        ? readingProgressParts.getValue()
        : null;
      if (current !== null && current !== undefined) {
        saveReadingProgress(activeReadingId, current);
      }
    }
    activeReadingId = "";
    readingProgressParts = null;
  }

  function startReadingTracking(edition, work, parts, restorePosition) {
    stopReadingTracking();
    var id = workId(edition.slug, work.slug);
    var remembered = readingEntryOf(id);
    activeReadingId = id;
    readingProgressParts = parts;
    var presenceLastY = window.scrollY;
    var presenceDownDistance = 0;
    var presenceUpDistance = 0;
    var presenceDimmed = false;

    function setWitchPresence(dimmed) {
      if (presenceDimmed === dimmed) return;
      presenceDimmed = dimmed;
      if (window.MythosWitch && window.MythosWitch.setReadingPresence) {
        window.MythosWitch.setReadingPresence(dimmed);
      }
    }

    function resetWitchPresence() {
      presenceLastY = window.scrollY;
      presenceDownDistance = 0;
      presenceUpDistance = 0;
      setWitchPresence(false);
    }

    function updateWitchPresence() {
      if (isMobileLayout()) {
        resetWitchPresence();
        return;
      }
      var y = window.scrollY;
      var delta = y - presenceLastY;
      presenceLastY = y;
      var scorePanel = document.getElementById("score-panel");
      var scoreReached = !!(
        scorePanel &&
        scorePanel.getBoundingClientRect().top <= window.innerHeight * 0.85
      );

      if (y <= 80 || scoreReached) {
        presenceDownDistance = 0;
        presenceUpDistance = 0;
        setWitchPresence(false);
        return;
      }
      if (delta > 0) {
        presenceDownDistance += delta;
        presenceUpDistance = 0;
      } else if (delta < 0) {
        presenceUpDistance += -delta;
        presenceDownDistance = 0;
      }
      if (presenceUpDistance >= 18) setWitchPresence(false);
      else if (presenceDownDistance >= 72) setWitchPresence(true);
    }

    function currentProgress() {
      var root = document.scrollingElement || document.documentElement;
      var max = Math.max(0, root.scrollHeight - window.innerHeight);
      return max > 0 ? clampReadingProgress(window.scrollY / max) : 0;
    }

    function paintProgress(value) {
      var progress = clampReadingProgress(value);
      var percent = Math.round(progress * 100);
      var progressLabel = percent ? "已读约 " + percent + "%" : "开始阅读";
      parts.bar.style.width = percent + "%";
      parts.text.textContent = progressLabel;
      if (parts.compactText) {
        var totalChars = Number(parts.totalChars) || Number(work.chars) || 0;
        var remainingMinutes = totalChars ? Math.ceil((totalChars * (1 - progress)) / 400) : 0;
        var readingTime = progress >= 1
          ? "已读完"
          : remainingMinutes
            ? (isMobileLayout() ? "约 " + remainingMinutes + " 分" : "还剩约 " + remainingMinutes + " 分钟")
            : "时长暂不可估";
        parts.compactText.textContent =
          (percent ? "已读 " + percent + "%" : "开始阅读") + " · " + readingTime;
        parts.compactText.setAttribute(
          "aria-label",
          (percent ? "已读约 " + percent + "%" : "尚未开始阅读") + "，" +
            (progress >= 1 ? "已读完" : remainingMinutes ? "还剩约 " + remainingMinutes + " 分钟" : "阅读时长暂不可估"),
        );
      }
      if (parts.compactFill) parts.compactFill.style.width = percent + "%";
      if (parts.compactTrain) {
        var compactTrackWidth = parts.compactTrack ? parts.compactTrack.clientWidth : 0;
        var trainInset = compactTrackWidth
          ? Math.min(50 / compactTrackWidth * 100, 50)
          : 0;
        parts.compactTrain.style.left =
          Math.max(trainInset, Math.min(100 - trainInset, percent)) + "%";
      }
      parts.track.setAttribute("aria-valuenow", String(percent));
      parts.getValue = function () {
        return progress;
      };
    }

    function scheduleSave() {
      updateWitchPresence();
      paintProgress(currentProgress());
      if (readingScrollTimer) window.clearTimeout(readingScrollTimer);
      readingScrollTimer = window.setTimeout(function () {
        readingScrollTimer = null;
        saveReadingProgress(id, currentProgress());
      }, 180);
    }

    readingScrollHandler = scheduleSave;
    window.addEventListener("scroll", readingScrollHandler, { passive: true });
    paintProgress(remembered ? remembered.progress : 0);
    resetWitchPresence();

    if (restorePosition && remembered && remembered.progress > 0.02) {
      window.requestAnimationFrame(function () {
        var root = document.scrollingElement || document.documentElement;
        var max = Math.max(0, root.scrollHeight - window.innerHeight);
        if (max > 0) window.scrollTo(0, Math.round(max * remembered.progress));
        paintProgress(currentProgress());
        resetWitchPresence();
      });
    } else {
      paintProgress(currentProgress());
      resetWitchPresence();
    }
  }

  function showToast(message, duration) {
    if (!refs.toastRoot) return;
    if (toastTimer) window.clearTimeout(toastTimer);
    var durationMs = typeof duration === "number" && duration > 0 ? duration : 2400;
    clear(refs.toastRoot);
    refs.toastRoot.appendChild(el("span", null, message));
    refs.toastRoot.hidden = false;
    toastTimer = window.setTimeout(function () {
      refs.toastRoot.hidden = true;
      clear(refs.toastRoot);
      toastTimer = null;
    }, durationMs);
  }

  /* ---------- 阅读主题 ---------- */

  function applyTheme(theme, save) {
    var dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", dark ? "#11141b" : "#f5f4ef");
    if (refs.themeToggle) {
      setIconLabel(refs.themeToggle, dark ? "i-sun" : "i-moon", dark ? "日间" : "黑夜");
      refs.themeToggle.setAttribute(
        "aria-label",
        dark ? "切换到日间模式" : "切换到黑夜模式",
      );
      refs.themeToggle.title = dark ? "切换到日间模式" : "切换到黑夜模式";
      refs.themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    }
    if (save) {
      try {
        localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
      } catch (err) {
        /* ignore */
      }
    }
  }

  function initThemeToggle() {
    var theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(theme, false);
    if (!refs.themeToggle) return;
    refs.themeToggle.addEventListener("click", function () {
      applyTheme(
        document.documentElement.dataset.theme === "dark" ? "light" : "dark",
        true,
      );
    });
  }

  /* ---------- 侧栏折叠 ---------- */

  function isMobileLayout() {
    return window.matchMedia("(max-width: 780px)").matches;
  }

  function applySidebarCollapsed(collapsed) {
    refs.layout.classList.toggle("sidebar-collapsed", collapsed);
    refs.sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (isMobileLayout()) {
      setIconLabel(refs.sidebarToggle, collapsed ? "i-toc" : "i-close", collapsed ? "目录" : "收起");
    } else {
      setIconLabel(refs.sidebarToggle, collapsed ? "i-toc" : "i-prev", collapsed ? "目录页" : "");
    }
    refs.sidebarToggle.title = collapsed ? "展开目录" : "收起目录";
    if (refs.mobileBarToc) {
      // 手机端目录入口在底部栏里，文案要跟着抽屉状态走
      setIconLabel(refs.mobileBarToc, collapsed ? "i-toc" : "i-close", collapsed ? "目录" : "收起");
      refs.mobileBarToc.setAttribute(
        "aria-expanded",
        collapsed ? "false" : "true",
      );
    }
    if (refs.sidebarBackdrop) {
      refs.sidebarBackdrop.hidden = collapsed || !isMobileLayout();
    }
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch (err) {
      /* ignore */
    }
  }

  function collapseSidebarOnMobile() {
    if (isMobileLayout()) applySidebarCollapsed(true);
  }

  function initSidebarToggle() {
    var collapsed = false;
    try {
      collapsed = localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch (err) {
      collapsed = false;
    }
    // 手机端默认收起，避免目录盖住正文且难以关闭
    if (isMobileLayout()) collapsed = true;
    applySidebarCollapsed(collapsed);
    refs.sidebarToggle.addEventListener("click", function () {
      applySidebarCollapsed(!refs.layout.classList.contains("sidebar-collapsed"));
    });
    if (refs.sidebarBackdrop) {
      refs.sidebarBackdrop.addEventListener("click", function () {
        applySidebarCollapsed(true);
      });
    }
    window.addEventListener("resize", function () {
      if (isMobileLayout() && refs.sidebarBackdrop) {
        refs.sidebarBackdrop.hidden =
          refs.layout.classList.contains("sidebar-collapsed");
      } else if (refs.sidebarBackdrop) {
        refs.sidebarBackdrop.hidden = true;
      }
    });
  }

  /* ---------- 右上工具条 ---------- */

  // 窄屏把公示、账号、主题收进一个「⋯」下拉菜单，宽屏直接平铺可用入口
  function setTopMenuOpen(open) {
    if (!refs.topTools || !refs.topMore) return;
    refs.topTools.classList.toggle("is-menu-open", !!open);
    refs.topMore.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function initTopMenu() {
    if (!refs.topMore || !refs.topMenu) return;
    refs.topMore.addEventListener("click", function (event) {
      event.stopPropagation();
      setTopMenuOpen(!refs.topTools.classList.contains("is-menu-open"));
    });
    // 点菜单内部不关闭（切换主题要能连点），点别处、按 Esc 则关闭
    refs.topMenu.addEventListener("click", function (event) {
      event.stopPropagation();
      if (event.target.closest(".theme-toggle")) return;
      setTopMenuOpen(false);
    });
    document.addEventListener("click", function () {
      setTopMenuOpen(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setTopMenuOpen(false);
    });
  }

  /* ---------- 手机端底部操作栏 ---------- */

  // 手机端底部栏的上下篇按钮与桌面浮动药丸共用同一份相邻篇目信息
  function setMobilePager(edition, prev, next) {
    [
      [refs.mobileBarPrev, prev, "上一篇"],
      [refs.mobileBarNext, next, "下一篇"],
    ].forEach(function (item) {
      var button = item[0];
      if (!button) return;
      var target = item[1];
      var label = item[2];
      button.disabled = !target;
      button.title = target ? label + "：" + target.title : "";
      button.setAttribute(
        "aria-label",
        target ? label + "：" + target.title : label,
      );
      setIconLabel(
        button,
        label === "上一篇" ? "i-prev" : "i-next",
        label,
      );
      button.onclick =
        target && edition
          ? function () {
              location.hash =
                "#/" + edition.slug + "/" + encodeURIComponent(target.slug);
            }
          : null;
      bindPrefetchIntent(button, edition, target);
    });
  }

  function initMobileBar() {
    if (!refs.mobileBar) return;
    if (refs.mobileBarToc) {
      refs.mobileBarToc.addEventListener("click", function () {
        applySidebarCollapsed(
          !refs.layout.classList.contains("sidebar-collapsed"),
        );
      });
    }
    // 向下读时整条收起，阅读页切换为紧凑页眉；向上滚或到顶/到底立刻回来。
    var lastY = window.scrollY;
    var acc = 0;
    var queued = false;
    function evaluate() {
      queued = false;
      var y = window.scrollY;
      var dy = y - lastY;
      lastY = y;
      // 同向累积、方向一变就清零：慢速滑动也能识别出意图，
      // 单帧位移小于阈值时不会漏判。
      if (dy !== 0 && (dy > 0) !== (acc > 0)) acc = 0;
      acc += dy;
      var bottom = document.documentElement.scrollHeight - window.innerHeight;
      var retract;
      if (y < 80 || y >= bottom - 32) {
        // 到顶或到底：控件必须可见
        retract = false;
      } else if (acc > 24) {
        retract = true;
      } else if (acc < -12) {
        retract = false;
      } else {
        retract = refs.mobileBar.classList.contains("is-hidden");
      }
      refs.mobileBar.classList.toggle("is-hidden", retract);
      var readerCompact = state.view === "reader" && retract;
      if (refs.topTools) {
        refs.topTools.classList.toggle("is-hidden", isMobileLayout() ? retract : readerCompact);
      }
      var compactBar = document.querySelector(".reader-compact-bar");
      document.body.classList.toggle("is-reader-compact", readerCompact && !!compactBar);
      if (compactBar) compactBar.classList.toggle("is-visible", readerCompact);
      if (retract) setTopMenuOpen(false);
    }
    window.addEventListener(
      "scroll",
      function () {
        if (queued) return;
        queued = true;
        window.requestAnimationFrame(evaluate);
      },
      { passive: true },
    );
    // 尺寸变化时重置方向累计，下一次滚动重新判断收起状态。
    window.addEventListener("resize", function () {
      refs.mobileBar.classList.remove("is-hidden");
      if (refs.topTools) refs.topTools.classList.remove("is-hidden");
      document.body.classList.remove("is-reader-compact");
      var compactBar = document.querySelector(".reader-compact-bar");
      if (compactBar) compactBar.classList.remove("is-visible");
      lastY = window.scrollY;
      acc = 0;
      setTopMenuOpen(false);
    });
  }

  /* ---------- 账号条 / 右上账号 ---------- */

  function renderAccountBar() {
    clear(refs.accountBar);
  }

  function renderAccountHud() {
    if (!refs.accountHud) return;
    clear(refs.accountHud);
    if (!isLoggedIn()) {
      refs.accountHud.hidden = true;
      return;
    }
    refs.accountHud.hidden = false;
    var r = role();

    if (r === "admin") {
      var adminHudBtn = el("button", "account-hud-btn account-hud-admin-btn");
      adminHudBtn.type = "button";
      adminHudBtn.appendChild(el("span", "account-hud-icon", "⚙"));
      adminHudBtn.appendChild(el("span", "account-hud-text", "管理后台"));
      adminHudBtn.title = "打开赛事管理面板";
      adminHudBtn.addEventListener("click", function () {
        openAdminModal();
      });
      refs.accountHud.appendChild(adminHudBtn);
    }

    var btn = el("button", "account-hud-btn");
    btn.type = "button";
    var title =
      r === "visitor"
        ? "访客"
        : displayName(currentUser()) + (r === "admin" ? " · 管理员" : "");
    btn.appendChild(el("span", "account-hud-icon", "◎"));
    btn.appendChild(el("span", "account-hud-text", "账号管理"));
    btn.title = title;
    btn.addEventListener("click", function () {
      if (r === "visitor") {
        var body = el("div", "modal-body");
        body.appendChild(el("p", "modal-meta", "当前为访客，仅可阅读。"));
        var logout = el("button", "btn", "退出访客");
        logout.type = "button";
        logout.addEventListener("click", function () {
          function done() {
            store.session = null;
            persist();
            closeModal();
            showAuthGate();
          }
          if (USE_CLOUD) {
            window.MythosAPI.logout().then(done).catch(done);
            return;
          }
          done();
        });
        body.appendChild(logout);
        openModal("账号", body);
      } else {
        openAccountModal();
      }
    });
    refs.accountHud.appendChild(btn);
  }

  function refreshChrome() {
    renderAccountBar();
    renderAccountHud();
    renderSiteBar();
  }

  /* ---------- 登录门 ---------- */

  function finishBoot() {
    document.body.classList.remove("is-booting");
    var splash = document.getElementById("boot-splash");
    if (splash) splash.hidden = true;
    // 只有真实的启动状态处理完成后才让开场让出页面，
    // 不在 DOMContentLoaded 就假装接口和页面都准备好了。
    if (window.DreamGate && window.DreamGate.ready) window.DreamGate.ready();
  }

  function showAuthGate() {
    if (window.MythosWitch && window.MythosWitch.hideForModal) {
      window.MythosWitch.hideForModal();
    }
    refs.authGate.hidden = false;
    refs.layout.setAttribute("aria-hidden", "true");
    document.body.classList.add("is-authing");
    setTopMenuOpen(false);
    finishBoot();
    renderAuthGate();
  }

  function hideAuthGate() {
    // 进入档案后才需要展示标题字体，避免它在启动阶段和接口、脚本抢带宽。
    document.documentElement.classList.add("is-archive");
    refs.authGate.hidden = true;
    if (window.MythosWitch && window.MythosWitch.restoreAfterModal) {
      window.MythosWitch.restoreAfterModal();
    }
    refs.layout.removeAttribute("aria-hidden");
    document.body.classList.remove("is-authing");
    finishBoot();
    refreshChrome();
    route();
  }

  function renderAuthGate() {
    clear(refs.authGate);
    var card = el("div", "auth-card");
    var cardHead = el("div", "auth-card-head");
    cardHead.appendChild(el("span", "auth-card-label", "幻梦境档案馆 · 调查员登记"));
    cardHead.appendChild(el("span", "auth-card-mark", "REGISTRATION"));
    card.appendChild(cardHead);
    card.appendChild(el("h1", "auth-title", "调查员登记卡"));
    card.appendChild(
      el(
        "p",
        "auth-sub",
        USE_CLOUD
          ? "已有账号直接登录；第一次使用请注册。访客无需账号。"
          : "离线演示版：账号数据仅保存在本机浏览器。",
      ),
    );
    var securityNote = el("div", "auth-security-note");
    securityNote.setAttribute("role", "note");
    securityNote.appendChild(el("span", "auth-security-label", "注意事项"));
    securityNote.appendChild(
      el("span", "auth-security-copy", "请为本站单独设置密码，不要使用你的 QQ 密码。"),
    );
    card.appendChild(securityNote);

    var tabs = el("div", "auth-tabs");
    var tabLogin = el("button", "auth-tab is-active", "调查员登录");
    var tabReg = el("button", "auth-tab", "注册");
    tabLogin.type = "button";
    tabReg.type = "button";
    tabs.appendChild(tabLogin);
    tabs.appendChild(tabReg);
    card.appendChild(tabs);

    var panel = el("div", "auth-panel");
    card.appendChild(panel);
    var authRecoveryTimer = null;

    function appendAuthField(form, labelText, input, id) {
      var field = el("label", "auth-field");
      field.htmlFor = id;
      field.appendChild(el("span", "field-label", labelText));
      input.id = id;
      field.appendChild(input);
      form.appendChild(field);
    }

    function showLogin() {
      if (authRecoveryTimer) {
        window.clearInterval(authRecoveryTimer);
        authRecoveryTimer = null;
      }
      tabLogin.classList.add("is-active");
      tabReg.classList.remove("is-active");
      clear(panel);
      var form = el("form", "auth-form");
      var qq = el("input", "auth-input");
      qq.type = "text";
      qq.placeholder = "QQ 号";
      qq.name = "username";
      qq.autocomplete = "username";
      qq.inputMode = "numeric";
      qq.required = true;
      var pass = el("input", "auth-input");
      pass.type = "password";
      pass.placeholder = "密码";
      pass.name = "password";
      pass.autocomplete = "current-password";
      pass.required = true;
      var err = el("p", "auth-error");
      err.setAttribute("aria-live", "polite");
      var submit = el("button", "btn", "登录");
      submit.type = "submit";
      appendAuthField(form, "QQ 号", qq, "login-qq");
      appendAuthField(form, "密码", passwordRow(pass), "login-password");
      form.appendChild(err);
      form.appendChild(submit);
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        err.textContent = "";
        var id = qq.value.trim();
        if (USE_CLOUD) {
          submit.disabled = true;
          submit.textContent = "登录中…";
          window.MythosAPI.login(id, pass.value)
            .then(function (data) {
              clearCloudCaches();
              applyCloudAuthData(data);
              hideAuthGate();
            })
            .catch(function (e) {
              var message = e.message || String(e);
              if (message.indexOf("账号不存在") !== -1) {
                showReg({ qq: id, autoSend: true });
                return;
              }
              err.textContent = message;
              submit.disabled = false;
              submit.textContent = "登录";
            });
          return;
        }
        var user = store.users[id];
        if (!user) {
          showReg({ qq: id, password: pass.value, firstUse: true });
          return;
        }
        if (!user.enabled) {
          err.textContent = "该账号已被管理员停用。";
          return;
        }
        if (!store.settings.allowMemberLogin && user.role !== "admin") {
          err.textContent = "管理员已关闭调查员登录。";
          return;
        }
        hashPassword(pass.value).then(function (hash) {
          if (hash !== user.pass) {
            err.textContent = "密码不正确。";
            return;
          }
          user.role = resolveRoleForQQ(user.qq);
          store.users[user.qq] = user;
          store.session = { role: user.role, qq: user.qq };
          persist();
          hideAuthGate();
        });
      });
      panel.appendChild(form);
      panel.appendChild(
        el(
          "p",
          "auth-hint",
          "首次使用请点上面的「注册」：QQ 需在名单内，验证码会发到你的 QQ 邮箱。",
        ),
      );
      if (USE_CLOUD) {
        var forgot = el("button", "btn-ghost auth-forgot", "忘记密码？");
        forgot.type = "button";
        forgot.addEventListener("click", function () {
          showForgotPassword(qq.value.trim());
        });
        panel.appendChild(forgot);
      }
    }

    function showForgotPassword(prefillQQ) {
      var recovery = {
        qq: String(prefillQQ || ""),
        cooldown: 0,
        timer: null,
        code: "",
        password: "",
        password2: "",
      };

      function clearTimer() {
        if (recovery.timer) {
          window.clearInterval(recovery.timer);
          if (authRecoveryTimer === recovery.timer) authRecoveryTimer = null;
          recovery.timer = null;
        }
      }

      function showRequestStep() {
        clearTimer();
        clear(panel);
        var form = el("form", "auth-form");
        var qq = el("input", "auth-input");
        qq.type = "text";
        qq.placeholder = "QQ 号";
        qq.inputMode = "numeric";
        qq.autocomplete = "username";
        qq.required = true;
        qq.value = recovery.qq;
        var err = el("p", "auth-error");
        err.setAttribute("aria-live", "polite");
        var send = el("button", "btn", "发送验证码");
        send.type = "submit";
        appendAuthField(form, "QQ 号", qq, "reset-qq");
        form.appendChild(err);
        form.appendChild(send);
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          var id = qq.value.trim();
          if (!/^\d{5,12}$/.test(id)) {
            err.textContent = "请输入 5–12 位数字 QQ 号。";
            return;
          }
          recovery.qq = id;
          send.disabled = true;
          send.textContent = "发送中…";
          window.MythosAPI.requestPasswordReset(id)
            .then(function (data) {
              recovery.cooldown = Number(data && data.retryAfterSeconds) || 60;
              showResetStep((data && data.message) || "若账号存在且可找回，验证码将发送至其 QQ 邮箱。请检查收件箱和垃圾邮件。");
            })
            .catch(function (e) {
              err.textContent = e.message || String(e);
              send.disabled = false;
              send.textContent = "发送验证码";
            });
        });
        panel.appendChild(form);
        panel.appendChild(
          el(
            "p",
            "auth-hint",
            "若账号存在且可找回，验证码将发送至其 QQ 邮箱。请检查收件箱和垃圾邮件。",
          ),
        );
        var back = el("button", "btn-ghost auth-forgot", "返回登录");
        back.type = "button";
        back.addEventListener("click", showLogin);
        panel.appendChild(back);
      }

      function showResetStep(notice) {
        clear(panel);
        var heading = el("p", "auth-hint", notice);
        heading.setAttribute("role", "status");
        panel.appendChild(heading);
        var form = el("form", "auth-form");
        var code = el("input", "auth-input");
        code.type = "text";
        code.inputMode = "numeric";
        code.autocomplete = "one-time-code";
        code.maxLength = 8;
        code.placeholder = "8 位验证码";
        code.required = true;
        code.value = recovery.code;
        code.addEventListener("input", function () {
          recovery.code = code.value;
        });
        var password = el("input", "auth-input");
        password.type = "password";
        password.autocomplete = "new-password";
        password.maxLength = 256;
        password.placeholder = "新密码（至少 4 位）";
        password.required = true;
        password.value = recovery.password;
        password.addEventListener("input", function () {
          recovery.password = password.value;
        });
        var password2 = el("input", "auth-input");
        password2.type = "password";
        password2.autocomplete = "new-password";
        password2.maxLength = 256;
        password2.placeholder = "再次输入新密码";
        password2.required = true;
        password2.value = recovery.password2;
        password2.addEventListener("input", function () {
          recovery.password2 = password2.value;
        });
        var err = el("p", "auth-error");
        err.setAttribute("aria-live", "polite");
        var submit = el("button", "btn", "重置密码");
        submit.type = "submit";
        form.appendChild(el("p", "auth-recovery-account", "账号 QQ " + recovery.qq));
        appendAuthField(form, "验证码", code, "reset-code");
        appendAuthField(form, "新密码", password, "reset-new-password");
        appendAuthField(form, "确认新密码", password2, "reset-confirm-password");
        form.appendChild(err);
        form.appendChild(submit);
        form.addEventListener("submit", function (event) {
          event.preventDefault();
          err.textContent = "";
          recovery.code = code.value.trim();
          recovery.password = password.value;
          recovery.password2 = password2.value;
          if (!/^\d{8}$/.test(recovery.code)) {
            err.textContent = "请输入 8 位数字验证码。";
            return;
          }
          if (recovery.password.length < 4 || recovery.password.length > 256) {
            err.textContent = "新密码需为 4–256 个字符。";
            return;
          }
          if (recovery.password !== recovery.password2) {
            err.textContent = "两次输入的新密码不一致。";
            return;
          }
          submit.disabled = true;
          submit.textContent = "正在重置…";
          window.MythosAPI.resetPassword(recovery.qq, recovery.code, recovery.password)
            .then(function () {
              clearTimer();
              window.MythosAPI.setToken("");
              store.session = null;
              clearCloudCaches();
              recovery.code = "";
              recovery.password = "";
              recovery.password2 = "";
              clear(panel);
              panel.appendChild(el("p", "auth-ok", "密码已重置，旧登录会话已失效。请使用新密码登录。"));
              var back = el("button", "btn", "返回登录");
              back.type = "button";
              back.addEventListener("click", showLogin);
              panel.appendChild(back);
            })
            .catch(function (e) {
              err.textContent = e.message || String(e);
              submit.disabled = false;
              submit.textContent = "重置密码";
            });
        });
        panel.appendChild(form);

        var actions = el("div", "auth-recovery-actions");
        var resend = el("button", "btn-ghost", "重新发送验证码");
        resend.type = "button";
        var changeQQ = el("button", "btn-ghost", "修改 QQ 号");
        changeQQ.type = "button";
        changeQQ.addEventListener("click", function () {
          recovery.code = "";
          recovery.password = "";
          recovery.password2 = "";
          showRequestStep();
        });
        actions.appendChild(resend);
        actions.appendChild(changeQQ);
        panel.appendChild(actions);

        function updateResendLabel() {
          if (recovery.cooldown > 0) {
            resend.disabled = true;
            resend.textContent = "重新发送（" + recovery.cooldown + " 秒）";
          } else {
            resend.disabled = false;
            resend.textContent = "重新发送验证码";
          }
        }
        function countDown() {
          if (recovery.cooldown <= 0) {
            clearTimer();
            updateResendLabel();
            return;
          }
          recovery.cooldown -= 1;
          updateResendLabel();
        }
        updateResendLabel();
        if (recovery.cooldown > 0 && !recovery.timer) {
          recovery.timer = window.setInterval(countDown, 1000);
          authRecoveryTimer = recovery.timer;
        }
        resend.addEventListener("click", function () {
          if (recovery.cooldown > 0) return;
          resend.disabled = true;
          resend.textContent = "发送中…";
          window.MythosAPI.requestPasswordReset(recovery.qq)
            .then(function (data) {
              recovery.cooldown = Number(data && data.retryAfterSeconds) || 60;
              heading.textContent = (data && data.message) || notice;
              countDown();
              if (recovery.cooldown > 0 && !recovery.timer) {
                recovery.timer = window.setInterval(countDown, 1000);
                authRecoveryTimer = recovery.timer;
              }
            })
            .catch(function (e) {
              heading.textContent = e.message || String(e);
              resend.disabled = false;
              resend.textContent = "重新发送验证码";
            });
        });
      }

      showRequestStep();
    }

    // 云端注册：QQ 邮箱验证码两步式
    function showRegCloud(prefill) {
      var state = { qq: String(prefill.qq || ""), email: "", cooldown: 0, timer: null };

      function clearTimer() {
        if (state.timer) {
          window.clearInterval(state.timer);
          state.timer = null;
        }
      }

      function showStepQq(notice, autoSend) {
        clearTimer();
        clear(panel);
        var form = el("form", "auth-form");
        var qq = el("input", "auth-input");
        qq.type = "text";
        qq.placeholder = "QQ 号";
        qq.name = "username";
        qq.inputMode = "numeric";
        qq.autocomplete = "username";
        qq.required = true;
        var err = el("p", "auth-error");
        err.setAttribute("aria-live", "polite");
        if (notice) err.textContent = notice;
        var send = el("button", "btn", "发送验证码");
        send.type = "submit";
        appendAuthField(form, "QQ 号", qq, "register-qq");
        form.appendChild(err);
        form.appendChild(send);
        panel.appendChild(form);
        panel.appendChild(
          el(
            "p",
            "auth-hint",
            "QQ 需已在调查员或管理员名单中。验证码会发到「QQ号@qq.com」，若收件箱没有请看一眼垃圾邮件。",
          ),
        );
        qq.value = state.qq;

        function doSend() {
          var id = qq.value.trim();
          err.className = "auth-error";
          err.textContent = "";
          if (!/^\d{5,12}$/.test(id)) {
            err.textContent = "请输入 5–12 位数字 QQ 号。";
            return;
          }
          state.qq = id;
          send.disabled = true;
          send.textContent = "发送中…";
          window.MythosAPI.sendRegisterCode(id)
            .then(function (data) {
              state.email = (data && data.email) || id + "@qq.com";
              state.cooldown = (data && data.cooldown) || 60;
              showStepCode("验证码已发送到 " + state.email + "，10 分钟内有效。");
            })
            .catch(function (e) {
              err.textContent = e.message || String(e);
              send.disabled = false;
              send.textContent = "发送验证码";
            });
        }

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          doSend();
        });
        if (autoSend) window.setTimeout(doSend, 60);
      }

      function showStepCode(notice) {
        clear(panel);
        var form = el("form", "auth-form");
        var code = el("input", "auth-input");
        code.type = "text";
        code.placeholder = "6 位验证码";
        code.inputMode = "numeric";
        code.maxLength = 6;
        code.autocomplete = "one-time-code";
        code.required = true;
        var nick = el("input", "auth-input");
        nick.type = "text";
        nick.placeholder = "昵称";
        nick.name = "nickname";
        nick.maxLength = NAME_MAX;
        nick.required = true;
        var pass = el("input", "auth-input");
        pass.type = "password";
        pass.placeholder = "设置本站密码（至少 4 位）";
        pass.name = "new-password";
        pass.autocomplete = "new-password";
        pass.required = true;
        var pass2 = el("input", "auth-input");
        pass2.type = "password";
        pass2.placeholder = "再输一次密码";
        pass2.name = "confirm-password";
        pass2.autocomplete = "new-password";
        pass2.required = true;
        var resend = el("button", "btn-ghost btn-tiny", "重新发送");
        resend.type = "button";
        var codeRow = el("div", "auth-code-row");
        codeRow.appendChild(code);
        codeRow.appendChild(resend);
        var err = el("p", "auth-error");
        err.setAttribute("aria-live", "polite");
        var submit = el("button", "btn", "完成注册");
        submit.type = "submit";
        appendAuthField(form, "邮箱验证码", codeRow, "register-code");
        appendAuthField(form, "昵称", nick, "register-nickname");
        appendAuthField(form, "设置本站密码", passwordRow(pass), "register-password");
        appendAuthField(form, "确认密码", passwordRow(pass2), "register-password2");
        form.appendChild(err);
        form.appendChild(submit);
        var back = el("button", "btn-ghost btn-tiny", "换个 QQ");
        back.type = "button";
        back.addEventListener("click", function () {
          showStepQq("");
        });
        panel.appendChild(form);
        panel.appendChild(
          el("p", "auth-hint", "正在注册 QQ：" + state.qq + "，验证码收件箱：" + state.email + "。"),
        );
        panel.appendChild(back);
        if (notice) {
          err.className = "auth-ok";
          err.textContent = notice;
        }

        function tick() {
          if (!resend.isConnected) {
            clearTimer();
            return;
          }
          if (state.cooldown <= 0) {
            clearTimer();
            resend.disabled = false;
            resend.textContent = "重新发送";
            return;
          }
          resend.disabled = true;
          resend.textContent = "重新发送（" + state.cooldown + "s）";
          state.cooldown -= 1;
        }
        clearTimer();
        tick();
        state.timer = window.setInterval(tick, 1000);

        resend.addEventListener("click", function () {
          if (state.cooldown > 0) return;
          resend.disabled = true;
          resend.textContent = "发送中…";
          window.MythosAPI.sendRegisterCode(state.qq)
            .then(function (data) {
              state.email = (data && data.email) || state.email;
              state.cooldown = (data && data.cooldown) || 60;
              err.className = "auth-ok";
              err.textContent = "验证码已重新发送到 " + state.email + "。";
              clearTimer();
              tick();
              state.timer = window.setInterval(tick, 1000);
            })
            .catch(function (e) {
              err.className = "auth-error";
              err.textContent = e.message || String(e);
              resend.disabled = false;
              resend.textContent = "重新发送";
            });
        });

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          err.className = "auth-error";
          err.textContent = "";
          var codeValue = code.value.trim();
          if (!/^\d{6}$/.test(codeValue)) {
            err.textContent = "请输入 6 位数字验证码。";
            return;
          }
          if (pass.value.length < 4) {
            err.textContent = "密码至少 4 位。";
            return;
          }
          if (pass.value !== pass2.value) {
            err.textContent = "两次输入的密码不一致。";
            return;
          }
          var nickname = nick.value.trim().slice(0, NAME_MAX) || "用户" + state.qq.slice(-4);
          submit.disabled = true;
          submit.textContent = "注册中…";
          window.MythosAPI.register(state.qq, pass.value, nickname, codeValue)
            .then(function (data) {
              clearCloudCaches();
              applyCloudAuthData(data);
              hideAuthGate();
            })
            .catch(function (e) {
              err.textContent = e.message || String(e);
              submit.disabled = false;
              submit.textContent = "完成注册";
            });
        });
        window.setTimeout(function () {
          code.focus();
        }, 0);
      }

      showStepQq("", !!prefill.autoSend);
    }

    function showReg(prefill) {
      if (authRecoveryTimer) {
        window.clearInterval(authRecoveryTimer);
        authRecoveryTimer = null;
      }
      prefill = prefill || {};
      tabReg.classList.add("is-active");
      tabLogin.classList.remove("is-active");
      clear(panel);
      if (USE_CLOUD) {
        showRegCloud(prefill);
        return;
      }
      var form = el("form", "auth-form");
      var qq = el("input", "auth-input");
      qq.type = "text";
      qq.placeholder = "QQ 号";
      qq.name = "username";
      qq.autocomplete = "username";
      qq.inputMode = "numeric";
      qq.required = true;
      var nick = el("input", "auth-input");
      nick.type = "text";
      nick.placeholder = "昵称";
      nick.name = "nickname";
      nick.autocomplete = "nickname";
      nick.maxLength = NAME_MAX;
      nick.required = true;
      var pass = el("input", "auth-input");
      pass.type = "password";
      pass.placeholder = "设置密码（至少 4 位）";
      pass.name = "new-password";
      pass.autocomplete = "new-password";
      pass.required = true;
      var err = el("p", "auth-error");
      err.setAttribute("aria-live", "polite");
      var submit = el("button", "btn", "注册并登录");
      submit.type = "submit";
      appendAuthField(form, "QQ 号", qq, "register-qq");
      appendAuthField(form, "昵称", nick, "register-nickname");
      appendAuthField(form, "设置本站密码", passwordRow(pass), "register-password");
      form.appendChild(err);
      form.appendChild(submit);
      qq.value = prefill.qq || "";
      pass.value = prefill.password || "";
      if (prefill.firstUse) {
        err.className = "auth-ok";
        err.textContent = "这是首次使用，请补充昵称后完成注册。";
        window.setTimeout(function () {
          nick.focus();
        }, 0);
      }
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        err.className = "auth-error";
        err.textContent = "";
        if (!store.settings.registrationOpen && !USE_CLOUD) {
          err.textContent = "管理员已关闭注册。";
          return;
        }
        var id = qq.value.trim();
        if (!/^\d{5,12}$/.test(id)) {
          err.textContent = "请输入 5–12 位数字 QQ 号。";
          return;
        }
        if (pass.value.length < 4) {
          err.textContent = "密码至少 4 位。";
          return;
        }
        var nickname = nick.value.trim().slice(0, NAME_MAX) || ("用户" + id.slice(-4));
        if (!store.settings.registrationOpen) {
          err.textContent = "管理员已关闭注册。";
          return;
        }
        if (!isQQAllowedToRegister(id)) {
          err.textContent =
            "该 QQ 不在调查员目录或管理员名单中。请联系已有管理员添加后再注册。";
          return;
        }
        if (store.users[id]) {
          err.textContent = "该 QQ 已注册，请直接登录。";
          return;
        }
        var resolved = resolveRoleForQQ(id);
        hashPassword(pass.value).then(function (hash) {
          store.users[id] = {
            qq: id,
            pass: hash,
            nickname: nickname,
            role: resolved,
            enabled: true,
            createdAt: new Date().toISOString(),
          };
          store.session = { role: resolved, qq: id };
          persist();
          hideAuthGate();
        });
      });
      panel.appendChild(form);
      panel.appendChild(
        el(
          "p",
          "auth-hint",
          "QQ 需已在调查员或管理员名单中。请使用本站专用密码，不要使用 QQ 密码。",
        ),
      );
    }

    tabLogin.addEventListener("click", showLogin);
    tabReg.addEventListener("click", function () {
      showReg();
    });
    showLogin();

    if (store.settings.allowVisitor !== false) {
      var visitor = el("button", "btn-ghost auth-visitor", "访客进入（仅观看）");
      visitor.type = "button";
      visitor.addEventListener("click", function () {
        if (USE_CLOUD) {
          visitor.disabled = true;
          window.MythosAPI.visitor()
            .then(function (data) {
              clearCloudCaches();
              applyCloudAuthData(data);
              hideAuthGate();
            })
            .catch(function (e) {
              alert(e.message || String(e));
              visitor.disabled = false;
            });
          return;
        }
        store.session = { role: "visitor" };
        persist();
        hideAuthGate();
      });
      card.appendChild(visitor);
    }

    refs.authGate.appendChild(card);
  }

  /* ---------- 模态框 ---------- */

  var modalReturnFocus = null;
  var modalKeyHandler = null;

  function closeModal() {
    clear(refs.modalRoot);
    refs.modalRoot.hidden = true;
    if (window.MythosWitch && window.MythosWitch.restoreAfterModal) {
      window.MythosWitch.restoreAfterModal();
    }
    if (modalKeyHandler) document.removeEventListener("keydown", modalKeyHandler);
    modalKeyHandler = null;
    if (modalReturnFocus && typeof modalReturnFocus.focus === "function") {
      modalReturnFocus.focus();
    }
    modalReturnFocus = null;
  }

  function openModal(title, bodyNode) {
    if (window.MythosWitch && window.MythosWitch.hideForModal) {
      window.MythosWitch.hideForModal();
    }
    modalReturnFocus = document.activeElement;
    clear(refs.modalRoot);
    refs.modalRoot.hidden = false;
    var backdrop = el("div", "modal-backdrop");
    backdrop.addEventListener("click", closeModal);
    var dialog = el("div", "modal-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "modal-title");
    dialog.tabIndex = -1;
    var head = el("div", "modal-head");
    var heading = el("h2", "modal-title", title);
    heading.id = "modal-title";
    head.appendChild(heading);
    var closeBtn = el("button", "btn-ghost btn-tiny", "关闭");
    closeBtn.type = "button";
    closeBtn.addEventListener("click", closeModal);
    head.appendChild(closeBtn);
    dialog.appendChild(head);
    dialog.appendChild(bodyNode);
    refs.modalRoot.appendChild(backdrop);
    refs.modalRoot.appendChild(dialog);
    modalKeyHandler = function (event) {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", modalKeyHandler);
    closeBtn.focus();
  }

  function openAccountModal() {
    var user = currentUser();
    if (!user) return;
    var body = el("div", "modal-body");

    if (isAdmin()) {
      var adminBox = el("div", "admin-account-card");
      adminBox.style.padding = "14px";
      adminBox.style.marginBottom = "16px";
      adminBox.style.borderRadius = "8px";
      adminBox.style.background = "#efebe4";
      adminBox.style.border = "1px solid #dcd5c9";

      var adminHead = el("div", null, "👑 当前身份：管理员");
      adminHead.style.fontWeight = "bold";
      adminHead.style.marginBottom = "10px";
      adminHead.style.color = "#2a2825";
      adminBox.appendChild(adminHead);

      var adminBtn = el("button", "btn", "⚙ 打开管理后台（赛程 / 白名单 / 账号）");
      adminBtn.type = "button";
      adminBtn.style.width = "100%";
      adminBtn.addEventListener("click", function () {
        closeModal();
        openAdminModal();
      });
      adminBox.appendChild(adminBtn);
      body.appendChild(adminBox);
    }

    body.appendChild(el("p", "modal-meta", "QQ " + user.qq + (isAdmin() ? "（管理员）" : "")));

    var nickLabel = el("label", "field-label", "昵称");
    var nick = el("input", "auth-input");
    nick.type = "text";
    nick.value = user.nickname || "";
    nick.maxLength = NAME_MAX;
    body.appendChild(nickLabel);
    body.appendChild(nick);

    var saveNick = el("button", "btn", "保存昵称");
    saveNick.type = "button";
    saveNick.addEventListener("click", function () {
      var nextNick = nick.value.trim().slice(0, NAME_MAX) || user.nickname;
      if (USE_CLOUD) {
        saveNick.disabled = true;
        window.MythosAPI.call("updateProfile", { nickname: nextNick })
          .then(function (data) {
            if (data && data.user) applyCloudAuthData({ user: data.user, session: store.session });
            else {
              user.nickname = nextNick;
              store.users[user.qq] = user;
            }
            refreshChrome();
            closeModal();
          })
          .catch(function (e) {
            alert(e.message || String(e));
            saveNick.disabled = false;
          });
        return;
      }
      user.nickname = nextNick;
      store.users[user.qq] = user;
      persist();
      refreshChrome();
      closeModal();
    });
    body.appendChild(saveNick);

    body.appendChild(el("hr", "modal-rule"));
    body.appendChild(el("h3", "modal-sub", "修改密码"));
    body.appendChild(
      el(
        "p",
        "modal-meta",
        "已登录状态下直接设置新密码即可（输入两次确认）。",
      ),
    );
    var newPass = el("input", "auth-input");
    newPass.type = "password";
    newPass.placeholder = "新密码（至少 4 位）";
    newPass.autocomplete = "new-password";
    newPass.setAttribute("name", "mythos-new-pass");
    var newPass2 = el("input", "auth-input");
    newPass2.type = "password";
    newPass2.placeholder = "再次输入新密码";
    newPass2.autocomplete = "new-password";
    newPass2.setAttribute("name", "mythos-new-pass2");
    var err = el("p", "auth-error");
    var savePass = el("button", "btn", "更新密码");
    savePass.type = "button";
    savePass.addEventListener("click", function () {
      err.textContent = "";
      err.className = "auth-error";
      var next = String(newPass.value || "");
      var next2 = String(newPass2.value || "");
      if (next.length < 4) {
        err.textContent = "新密码至少 4 位。";
        return;
      }
      if (next !== next2) {
        err.textContent = "两次输入的新密码不一致。";
        return;
      }
      if (USE_CLOUD) {
        savePass.disabled = true;
        window.MythosAPI.call("updateProfile", { newPass: next })
          .then(function () {
            newPass.value = "";
            newPass2.value = "";
            err.textContent = "密码已更新，下次请用新密码登录。";
            err.className = "auth-ok";
            savePass.disabled = false;
          })
          .catch(function (e) {
            err.textContent = e.message || String(e);
            savePass.disabled = false;
          });
        return;
      }
      hashPassword(next).then(function (hash) {
        user.pass = hash;
        store.users[user.qq] = user;
        persist();
        newPass.value = "";
        newPass2.value = "";
        err.textContent = "密码已更新，下次请用新密码登录。";
        err.className = "auth-ok";
      });
    });
    body.appendChild(passwordRow(newPass));
    body.appendChild(passwordRow(newPass2));
    body.appendChild(err);
    body.appendChild(savePass);

    body.appendChild(el("hr", "modal-rule"));
    var logout = el("button", "btn-ghost", "退出登录");
    logout.type = "button";
    logout.addEventListener("click", function () {
      function done() {
        store.session = null;
        clearCloudCaches();
        persist();
        closeModal();
        showAuthGate();
      }
      if (USE_CLOUD) {
        window.MythosAPI.logout().then(done).catch(done);
        return;
      }
      done();
    });
    body.appendChild(logout);
    openModal("账号管理", body);
  }

  function parseQQLines(text) {
    return text
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);
  }

  function togglePhaseConfirm(slug, nextKey) {
    if (USE_CLOUD) {
      return window.MythosAPI.adminConfirmEditionPhase(slug).then(function (data) {
        applyCloudEditionPhaseState(data);
        return data;
      });
    }
    var st = editionState(slug);
    var user = currentUser();
    if (!user || !isAdmin()) return;
    if (!st.phaseAdvance || st.phaseAdvance.next !== nextKey) {
      st.phaseAdvance = { next: nextKey, votes: [user.qq] };
    } else {
      var votes = st.phaseAdvance.votes.slice();
      var idx = votes.indexOf(user.qq);
      if (idx === -1) votes.push(user.qq);
      else votes.splice(idx, 1);
      if (!votes.length) st.phaseAdvance = null;
      else st.phaseAdvance = { next: nextKey, votes: votes };
    }
    if (st.phaseAdvance && st.phaseAdvance.votes.length >= 2) {
      st.phase = st.phaseAdvance.next;
      st.phaseAdvance = null;
    }
    store.settings.editions[slug] = st;
    persist();
    return Promise.resolve();
  }

  function clearPhaseConfirm(slug) {
    if (USE_CLOUD) {
      return window.MythosAPI.adminClearEditionPhaseConfirm(slug).then(function (data) {
        applyCloudEditionPhaseState(data);
        return data;
      });
    }
    var st = editionState(slug);
    st.phaseAdvance = null;
    store.settings.editions[slug] = st;
    persist();
    return Promise.resolve();
  }

  function openAdminModal() {
    if (!isAdmin()) return;
    if (USE_CLOUD && !openAdminModal._ready) {
      var loading = el("div", "modal-body");
      loading.appendChild(el("p", "modal-meta", "正在从云端同步管理数据…"));
      openModal("管理面板", loading);
      pullCloudAdminState()
        .then(function () {
          openAdminModal._ready = true;
          openAdminModal();
          openAdminModal._ready = false;
        })
        .catch(function (e) {
          var fail = el("div", "modal-body");
          fail.appendChild(
            el("p", "auth-error", e.message || String(e) || "同步失败"),
          );
          var retry = el("button", "btn", "重试");
          retry.type = "button";
          retry.addEventListener("click", openAdminModal);
          fail.appendChild(retry);
          openModal("管理面板", fail);
        });
      return;
    }

    var body = el("div", "modal-body");
    var settings = store.settings;
    var slug = state.editionSlug;
    var st = editionState(slug);
    var edition = findEdition(slug);

    body.appendChild(
      el(
        "h3",
        "modal-sub",
        "本届阶段 · " + ((edition && edition.shortName) || slug),
      ),
    );
    body.appendChild(
      el("p", "modal-meta", "当前：" + phaseLabel(st.phase)),
    );

    var deadlineLabel = el(
      "label",
      "field-label",
      "「" + phaseLabel(st.phase) + "」阶段截止日期（可选）",
    );
    var deadline = el("input", "auth-input");
    deadline.type = "datetime-local";
    deadline.value = formatDateInput(phaseDeadlineOf(slug, st.phase));
    body.appendChild(deadlineLabel);
    body.appendChild(deadline);
    var saveDeadline = el("button", "btn", "保存本阶段截止日期");
    saveDeadline.type = "button";
    saveDeadline.addEventListener("click", function () {
      setPhaseDeadline(
        slug,
        st.phase,
        deadline.value ? new Date(deadline.value).toISOString() : "",
      );
      persist();
      if (USE_CLOUD) {
        pushCloudSettings()
          .then(function () {
            closeModal();
            route();
          })
          .catch(function (e) {
            alert(e.message || String(e));
          });
        return;
      }
      closeModal();
      route();
    });
    body.appendChild(saveDeadline);

    var next = nextPhaseKey(st.phase);
    if (next) {
      var adv = st.phaseAdvance;
      var count = adv && adv.next === next ? adv.votes.length : 0;
      body.appendChild(
        el(
          "p",
          "modal-meta",
          "推进至「" +
            phaseLabel(next) +
            "」需要 2 位管理员确认。当前确认：" +
            count +
            "/2" +
            (adv && adv.votes.length
              ? "（" + adv.votes.join("、") + "）"
              : ""),
        ),
      );
      var phaseRow = el("div", "admin-row");
      var confirmBtn = el(
        "button",
        "btn",
        adv && adv.next === next && adv.votes.indexOf(currentUser().qq) !== -1
          ? "取消我的确认"
          : "确认推进下一阶段",
      );
      confirmBtn.type = "button";
      confirmBtn.addEventListener("click", function () {
        confirmBtn.disabled = true;
        togglePhaseConfirm(slug, next).then(function () {
          openAdminModal();
          route();
        }).catch(function (e) {
          confirmBtn.disabled = false;
          alert(e.message || String(e));
        });
      });
      var clearBtn = el("button", "btn-ghost", "清空确认计数");
      clearBtn.type = "button";
      clearBtn.addEventListener("click", function () {
        clearBtn.disabled = true;
        clearPhaseConfirm(slug).then(function () {
          openAdminModal();
        }).catch(function (e) {
          clearBtn.disabled = false;
          alert(e.message || String(e));
        });
      });
      phaseRow.appendChild(confirmBtn);
      phaseRow.appendChild(clearBtn);
      body.appendChild(phaseRow);
    } else {
      body.appendChild(el("p", "modal-meta", "已是最终阶段「结果公示」。"));
    }

    if (st.phase === "公示") {
      var viewPub = el("button", "btn-ghost", "查看本届公示页");
      viewPub.type = "button";
      viewPub.addEventListener("click", function () {
        closeModal();
        location.hash = "#/" + slug + "/__results";
      });
      body.appendChild(viewPub);
    }

    body.appendChild(el("hr", "modal-rule"));
    body.appendChild(el("h3", "modal-sub", "匿名规则与评委特别奖"));
    body.appendChild(
      el(
        "p",
        "modal-meta",
        "不展示捐赠奖品。设置作者公开名次，并在结果公示时展示特别奖与评语。",
      ),
    );
    var awardConfigButton = el("button", "btn-ghost", "配置匿名规则与特别奖");
    awardConfigButton.type = "button";
    awardConfigButton.addEventListener("click", function () {
      openEditionAwardConfigModal(slug);
    });
    body.appendChild(awardConfigButton);

    body.appendChild(el("hr", "modal-rule"));
    body.appendChild(el("h3", "modal-sub", "首页聚光"));
    body.appendChild(
      el(
        "p",
        "modal-meta",
          "每天可配置 1–5 篇，默认 3 篇。管理员指定优先，未满时按低评分人数候选补齐；评分人数只在这里提供给管理员查看。",
      ),
    );
    var spotlightButton = el("button", "btn-ghost", "配置首页聚光");
    spotlightButton.type = "button";
    spotlightButton.disabled = !USE_CLOUD;
    spotlightButton.title = USE_CLOUD ? "" : "离线单文件版未连接聚光接口";
    spotlightButton.addEventListener("click", function () {
      openSpotlightConfigModal();
    });
    body.appendChild(spotlightButton);

    body.appendChild(el("hr", "modal-rule"));
    body.appendChild(el("h3", "modal-sub", "登录权限"));

    function check(label, key) {
      var wrap = el("label", "checkbox admin-check");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!settings[key];
      input.addEventListener("change", function () {
        settings[key] = input.checked;
        store.settings = settings;
        persist();
        if (USE_CLOUD) {
          pushCloudSettings().catch(function (e) {
            console.error(e);
          });
        }
      });
      wrap.appendChild(input);
      wrap.appendChild(el("span", null, label));
      body.appendChild(wrap);
    }
    check("允许访客进入", "allowVisitor");
    check("允许调查员登录", "allowMemberLogin");
    check("开放注册", "registrationOpen");

    body.appendChild(el("hr", "modal-rule"));
    body.appendChild(el("h3", "modal-sub", "名单与账号"));
    body.appendChild(
      el(
        "p",
        "modal-meta",
        USE_CLOUD
          ? "云端共享：名单、注册账号、评分与评论全员同步。打开本面板会先拉取最新数据。"
          : "离线版数据仅保存在本机。点「查看 / 编辑」打开独立窗口，避免主面板过长。",
      ),
    );

    function dirEntry(title, countText, onView, onEdit) {
      var block = el("div", "admin-dir-entry");
      var head = el("div", "admin-dir-entry-head");
      head.appendChild(el("strong", null, title));
      head.appendChild(el("span", "admin-dir-count", countText));
      block.appendChild(head);
      var row = el("div", "admin-row");
      var viewBtn = el("button", "btn-ghost", "查看目录");
      viewBtn.type = "button";
      viewBtn.addEventListener("click", onView);
      var editBtn = el("button", "btn", "编辑目录");
      editBtn.type = "button";
      editBtn.addEventListener("click", onEdit);
      row.appendChild(viewBtn);
      row.appendChild(editBtn);
      block.appendChild(row);
      body.appendChild(block);
    }

    var memberCount = (settings.memberDirectory || []).length;
    var adminCount = (settings.adminDirectory || []).length;
    var userCount = USE_CLOUD
      ? cloudUserList.length
      : Object.keys(store.users).length;
    var authorBound = 0;
    var authorTotal = 0;
    editions.forEach(function (ed) {
      (ed.works || []).forEach(function (work) {
        authorTotal += 1;
        if (effectiveAuthorQQ(workId(ed.slug, work.slug), work)) authorBound += 1;
      });
    });

    dirEntry(
      "调查员 QQ 目录",
      memberCount + " 人",
      function () {
        openQQDirectoryModal("member", "view");
      },
      function () {
        openQQDirectoryModal("member", "edit");
      },
    );
    dirEntry(
      "管理员 QQ 名单",
      adminCount + " 人",
      function () {
        openQQDirectoryModal("admin", "view");
      },
      function () {
        openQQDirectoryModal("admin", "edit");
      },
    );
    dirEntry(
      "作者 QQ 绑定",
      authorBound + " / " + authorTotal + " 篇（全年届）",
      function () {
        openAuthorEditionPicker("view");
      },
      function () {
        openAuthorEditionPicker("edit");
      },
    );

    var accountBlock = el("div", "admin-dir-entry");
    var accountHead = el("div", "admin-dir-entry-head");
    accountHead.appendChild(el("strong", null, "已注册账号"));
    accountHead.appendChild(el("span", "admin-dir-count", userCount + " 个"));
    accountBlock.appendChild(accountHead);
    var accountRow = el("div", "admin-row");
    var viewUsers = el("button", "btn-ghost", "查看账号");
    viewUsers.type = "button";
    viewUsers.addEventListener("click", function () {
      openRegisteredUsersModal();
    });
    accountRow.appendChild(viewUsers);
    accountBlock.appendChild(accountRow);
    body.appendChild(accountBlock);

    var reportBlock = el("div", "admin-dir-entry");
    var reportHead = el("div", "admin-dir-entry-head");
    reportHead.appendChild(el("strong", null, "数据与导出"));
    reportHead.appendChild(el("span", "admin-dir-count", "评分 / 评论 / 热度"));
    reportBlock.appendChild(reportHead);
    reportBlock.appendChild(el("p", "modal-meta", "查看全站统计和作品热度，并下载可用 Excel 打开的 CSV 明细。"));
    var reportRow = el("div", "admin-row");
    var reportBtn = el("button", "btn-ghost", "查看统计与导出");
    reportBtn.type = "button";
    reportBtn.addEventListener("click", openAdminReportModal);
    reportRow.appendChild(reportBtn);
    reportBlock.appendChild(reportRow);
    body.appendChild(reportBlock);

    var contentBlock = el("div", "admin-dir-entry");
    var contentHead = el("div", "admin-dir-entry-head");
    contentHead.appendChild(el("strong", null, "作品正文"));
    contentHead.appendChild(el("span", "admin-dir-count", "在线编辑"));
    contentBlock.appendChild(contentHead);
    contentBlock.appendChild(
      el(
        "p",
        "modal-meta",
        "改正文、删段落、去掉署名都在这儿操作，保存后立即对所有访客生效，并保留最近 5 个历史版本可一键还原。",
      ),
    );
    var contentRow = el("div", "admin-row");
    var editContent = el("button", "btn-ghost", "编辑作品正文");
    editContent.type = "button";
    editContent.addEventListener("click", openWorkContentPicker);
    contentRow.appendChild(editContent);
    contentBlock.appendChild(contentRow);
    body.appendChild(contentBlock);

    openModal("管理面板", body);
  }

  function openEditionAwardConfigModal(editionSlug) {
    if (!isAdmin()) return;
    var edition = findEdition(editionSlug);
    if (!edition) return;
    var loading = el("div", "modal-body");
    loading.appendChild(el("p", "modal-meta", "正在读取匿名规则与特别奖…"));
    openModal("匿名规则与评委特别奖", loading);

    var load = USE_CLOUD
      ? window.MythosAPI.call("adminGetEditionAwardsConfig", {
          editionSlug: editionSlug,
        })
      : Promise.resolve({
          config:
            (store.settings.awardConfigs && store.settings.awardConfigs[editionSlug]) ||
            { authorRevealRankLimit: 25, specialAwards: [] },
        });
    load.then(function (data) {
      renderEditor((data && data.config) || { authorRevealRankLimit: 25, specialAwards: [] });
    }).catch(function (err) {
      var fail = el("div", "modal-body");
      fail.appendChild(backToAdminButton());
      fail.appendChild(el("p", "auth-error", err.message || String(err)));
      openModal("匿名规则与评委特别奖", fail);
    });

    function renderEditor(config) {
      var awards = Array.isArray(config.specialAwards)
        ? config.specialAwards.slice(0, 6).map(function (award) {
            return {
              name: String((award && award.name) || ""),
              workId: String((award && award.workId) || ""),
              excerpt: String((award && award.excerpt) || ""),
              review: String((award && award.review) || ""),
            };
          })
        : [];
      var body = el("div", "modal-body award-config-modal");
      body.appendChild(backToAdminButton());
      body.appendChild(
        el(
          "p",
          "modal-meta",
          "奖品清单和捐赠信息不公开。获奖作者在公示阶段解封；特别奖作品不受名次上限限制。",
        ),
      );

      var rankField = el("label", "field-label", "作者公开名次上限");
      var rankInput = el("input", "auth-input");
      rankInput.type = "number";
      rankInput.min = "0";
      rankInput.max = String((edition.works || []).length);
      rankInput.step = "1";
      rankInput.value = String(
        config.authorRevealRankLimit == null ? 25 : config.authorRevealRankLimit,
      );
      rankField.appendChild(rankInput);
      body.appendChild(rankField);
      body.appendChild(
        el(
          "p",
          "modal-meta",
          "例如填 25，表示前 25 名可以公开作者；第 26 名及以后匿名。特别奖获奖作品会在公示时解封作者。作者昵称取自现有作者 QQ 绑定，请先确认获奖作品已绑定。",
        ),
      );

      body.appendChild(el("h3", "modal-sub", "特别奖（最多 6 项）"));
      var awardList = el("div", "award-editor-list");
      body.appendChild(awardList);
      var boundAuthors = {};
      authorBindRows(edition).forEach(function (row) {
        boundAuthors[row.id] = !!row.qq;
      });
      var addAward = el("button", "btn-ghost", "添加特别奖");
      addAward.type = "button";
      body.appendChild(addAward);
      var error = el("p", "auth-error");
      error.hidden = true;
      body.appendChild(error);
      var status = el("p", "modal-meta");
      body.appendChild(status);
      var save = el("button", "btn", "保存本届设置");
      save.type = "button";
      body.appendChild(save);
      openModal("匿名规则与评委特别奖", body);

      function paintAwards() {
        clear(awardList);
        awards.forEach(function (award, index) {
          var details = el("details", "award-editor-item");
          if (index === 0) details.open = true;
          var summary = el("summary", null, "特别奖 " + (index + 1) + " · " + (award.name || "未命名"));
          details.appendChild(summary);
          var fields = el("div", "award-editor-fields");

          var nameLabel = el("label", "field-label", "奖项名称");
          var nameInput = el("input", "auth-input");
          nameInput.type = "text";
          nameInput.maxLength = 100;
          nameInput.value = award.name;
          nameInput.placeholder = "例如：暗夜呢喃奖";
          nameInput.addEventListener("input", function () {
            summary.textContent = "特别奖 " + (index + 1) + " · " + (nameInput.value.trim() || "未命名");
          });
          nameLabel.appendChild(nameInput);
          fields.appendChild(nameLabel);

          var workLabel = el("label", "field-label", "获奖作品");
          var workSelect = el("select", "auth-input");
          var emptyOption = el("option", null, "请选择作品");
          emptyOption.value = "";
          workSelect.appendChild(emptyOption);
          (edition.works || []).forEach(function (work) {
            var id = workId(edition.slug, work.slug);
            var option = el(
              "option",
              null,
              String(work.no).padStart(2, "0") +
                " · " +
                work.title +
                (boundAuthors[id] ? " · 已绑定作者" : " · 未绑定作者"),
            );
            option.value = id;
            if (id === award.workId) option.selected = true;
            workSelect.appendChild(option);
          });
          workLabel.appendChild(workSelect);
          fields.appendChild(workLabel);

          var excerptLabel = el("label", "field-label", "作品节选（可选）");
          var excerptInput = el("textarea", "auth-textarea");
          excerptInput.rows = 3;
          excerptInput.maxLength = 3000;
          excerptInput.value = award.excerpt;
          excerptInput.placeholder = "可放一小段作品原文，评语 PDF 也采用了这种结构";
          excerptLabel.appendChild(excerptInput);
          fields.appendChild(excerptLabel);

          var reviewLabel = el("label", "field-label", "评委评语");
          var reviewInput = el("textarea", "auth-textarea");
          reviewInput.rows = 8;
          reviewInput.maxLength = 30000;
          reviewInput.value = award.review;
          reviewInput.placeholder = "可粘贴完整评语，多段评语之间空一行";
          reviewLabel.appendChild(reviewInput);
          fields.appendChild(reviewLabel);

          var remove = el("button", "btn-ghost btn-tiny", "删除此特别奖");
          remove.type = "button";
          remove.addEventListener("click", function () {
            awards.splice(index, 1);
            paintAwards();
          });
          fields.appendChild(remove);
          details.appendChild(fields);
          awardList.appendChild(details);
        });
        addAward.disabled = awards.length >= 6;
        addAward.textContent = "添加特别奖（" + awards.length + "/6）";
      }

      addAward.addEventListener("click", function () {
        if (awards.length >= 6) return;
        awards.push({ name: "", workId: "", excerpt: "", review: "" });
        paintAwards();
        var last = awardList.lastElementChild;
        if (last) last.open = true;
      });

      save.addEventListener("click", function () {
        error.hidden = true;
        status.textContent = "";
        var rankLimit = Number(rankInput.value);
        if (!Number.isInteger(rankLimit) || rankLimit < 0 || rankLimit > (edition.works || []).length) {
          error.textContent = "名次上限请填写 0 到 " + (edition.works || []).length + " 之间的整数。";
          error.hidden = false;
          return;
        }
        var nextAwards = [];
        var rows = awardList.querySelectorAll(".award-editor-item");
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var name = row.querySelector('input[type="text"]').value.trim();
          var workIdValue = row.querySelector("select").value;
          var excerpt = row.querySelectorAll("textarea")[0].value.trim();
          var review = row.querySelectorAll("textarea")[1].value.trim();
          if (!name && !workIdValue && !excerpt && !review) continue;
          if (!name || !workIdValue) {
            error.textContent = "每项特别奖都需要填写奖项名称和获奖作品。";
            error.hidden = false;
            return;
          }
          nextAwards.push({ name: name, workId: workIdValue, excerpt: excerpt, review: review });
        }
        if (nextAwards.length > 6) {
          error.textContent = "本届最多设置 6 项特别奖。";
          error.hidden = false;
          return;
        }
        var next = { authorRevealRankLimit: rankLimit, specialAwards: nextAwards };
        save.disabled = true;
        var request = USE_CLOUD
          ? window.MythosAPI.call("adminSaveEditionAwardsConfig", {
              editionSlug: editionSlug,
              config: next,
            })
          : Promise.resolve({ config: next });
        request.then(function (result) {
          if (!store.settings.awardConfigs) store.settings.awardConfigs = {};
          store.settings.awardConfigs[editionSlug] = (result && result.config) || next;
          persist();
          cloudAwardsLoaded[editionSlug] = false;
          delete cloudAwards[editionSlug];
          status.textContent = "设置已保存。特别奖只会在结果公示阶段显示。";
          save.disabled = false;
        }).catch(function (err) {
          error.textContent = err.message || String(err);
          error.hidden = false;
          save.disabled = false;
        });
      });

      paintAwards();
    }
  }

  function csvValue(value) {
    var text = value == null ? "" : String(value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function downloadCsv(filename, headers, rows) {
    var lines = [headers.map(csvValue).join(",")];
    rows.forEach(function (row) {
      lines.push(row.map(csvValue).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function openAdminReportModal() {
    if (!isAdmin() || !USE_CLOUD) return;
    var loading = el("div", "modal-body");
    loading.appendChild(el("p", "modal-meta", "正在汇总评分、评论与作品热度…"));
    openModal("数据与导出", loading);
    window.MythosAPI.call("adminGetReport").then(function (report) {
      var body = el("div", "modal-body");
      var summary = report.summary || {};
      var summaryLine = el("p", "modal-meta");
      body.appendChild(summaryLine);
      body.appendChild(el("h3", "modal-sub", "作品评分与热度"));

      function editionYear(edition) {
        var year = Number(edition && edition.year);
        if (isFinite(year) && year) return year;
        var match = String(edition && edition.slug || "").match(/\d{4}/);
        return match ? Number(match[0]) : 0;
      }

      var editionChoices = (editions || []).slice();
      var knownEditionSlugs = Object.create(null);
      editionChoices.forEach(function (edition) {
        knownEditionSlugs[edition.slug] = true;
      });
      (report.workStats || []).forEach(function (row) {
        var slug = String(row.workId || "").split("/")[0];
        if (slug && !knownEditionSlugs[slug]) {
          knownEditionSlugs[slug] = true;
          editionChoices.push({ slug: slug, shortName: slug });
        }
      });
      editionChoices.sort(function (a, b) {
        return editionYear(a) - editionYear(b) || String(a.slug).localeCompare(String(b.slug), undefined, { numeric: true });
      });
      var selectedEdition = editionChoices.length
        ? editionChoices[editionChoices.length - 1].slug
        : "__all__";

      function editionForRow(row) {
        return String(row && row.workId || "").split("/")[0];
      }

      function rowsForSelection(rows) {
        return (rows || []).filter(function (row) {
          return selectedEdition === "__all__" || editionForRow(row) === selectedEdition;
        });
      }

      var controls = el("div", "report-filters");
      var editionField = el("label", "report-filter");
      editionField.appendChild(el("span", "field-label", "届次"));
      var editionSelect = el("select", "auth-input");
      editionSelect.setAttribute("aria-label", "筛选届次");
      var allOption = el("option", null, "全部届次");
      allOption.value = "__all__";
      editionSelect.appendChild(allOption);
      editionChoices.slice().reverse().forEach(function (edition) {
        var option = el("option", null, edition.shortName || edition.name || edition.slug);
        option.value = edition.slug;
        editionSelect.appendChild(option);
      });
      editionSelect.value = selectedEdition;
      editionField.appendChild(editionSelect);
      controls.appendChild(editionField);

      var sortField = el("label", "report-filter");
      sortField.appendChild(el("span", "field-label", "排序"));
      var sortSelect = el("select", "auth-input");
      sortSelect.setAttribute("aria-label", "作品热度排序");
      [
        ["comments-desc", "评论数：从多到少"],
        ["comments-asc", "评论数：从少到多"],
        ["ratings-desc", "评分人数：从多到少"],
        ["ratings-asc", "评分人数：从少到多"],
        ["average-desc", "综合均分：从高到低"],
        ["average-asc", "综合均分：从低到高"],
        ["work-asc", "作品编号：升序"],
        ["work-desc", "作品编号：降序"],
      ].forEach(function (item) {
        var option = el("option", null, item[1]);
        option.value = item[0];
        sortSelect.appendChild(option);
      });
      sortSelect.value = "comments-desc";
      sortField.appendChild(sortSelect);
      controls.appendChild(sortField);
      body.appendChild(controls);

      var table = el("table", "rank-table");
      var head = el("tr");
      ["作品", "评分", "综合均分", "评论"].forEach(function (label) { head.appendChild(el("th", null, label)); });
      var thead = el("thead"); thead.appendChild(head); table.appendChild(thead);
      var tbody = el("tbody");
      table.appendChild(tbody); body.appendChild(table);

      function compareWorkIds(a, b) {
        return String(a.workId || "").localeCompare(String(b.workId || ""), undefined, { numeric: true });
      }

      function sortedWorkStats() {
        var rows = rowsForSelection(report.workStats).slice();
        var sortMode = sortSelect.value;
        rows.sort(function (a, b) {
          var value = 0;
          if (sortMode === "work-asc" || sortMode === "work-desc") {
            value = compareWorkIds(a, b);
            return sortMode === "work-desc" ? -value : value;
          }
          var field = sortMode.indexOf("comments-") === 0
            ? "commentCount"
            : sortMode.indexOf("ratings-") === 0 ? "ratingCount" : "totalAvg";
          var av = a[field] == null ? null : Number(a[field]);
          var bv = b[field] == null ? null : Number(b[field]);
          var aMissing = av == null || !isFinite(av);
          var bMissing = bv == null || !isFinite(bv);
          if (aMissing || bMissing) return aMissing === bMissing ? compareWorkIds(a, b) : aMissing ? 1 : -1;
          value = av - bv;
          if (sortMode.endsWith("-desc")) value = -value;
          return value || compareWorkIds(a, b);
        });
        return rows;
      }

      function updateReportView() {
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
        var rows = sortedWorkStats();
        if (!rows.length) {
          var empty = el("tr");
          var emptyCell = el("td", "modal-meta", "所选届次暂无评分或评论数据。");
          emptyCell.colSpan = 4;
          empty.appendChild(emptyCell);
          tbody.appendChild(empty);
        } else {
          rows.forEach(function (row) {
            var tr = el("tr");
            [row.workId, row.ratingCount, row.totalAvg == null ? "—" : Number(row.totalAvg).toFixed(2), row.commentCount].forEach(function (value) {
              tr.appendChild(el("td", null, String(value)));
            });
            tbody.appendChild(tr);
          });
        }
        var edition = editionChoices.filter(function (item) { return item.slug === selectedEdition; })[0];
        var editionLabel = selectedEdition === "__all__"
          ? "全部届次"
          : edition ? (edition.shortName || edition.name || edition.slug) : selectedEdition;
        summaryLine.textContent = editionLabel + " · 账号 " + (summary.users || 0) + "（启用 " + (summary.enabledUsers || 0) + "） · 评分 " + rowsForSelection(report.ratings).length + " · 评论 " + rowsForSelection(report.comments).length;
      }

      editionSelect.addEventListener("change", function () {
        selectedEdition = editionSelect.value;
        updateReportView();
      });
      sortSelect.addEventListener("change", updateReportView);

      var tools = el("div", "admin-row");
      function addExport(label, suffix, headers, getRows) {
        var button = el("button", "btn-ghost", label); button.type = "button";
        button.addEventListener("click", function () {
          var editionPart = selectedEdition === "__all__" ? "全部届次" : selectedEdition;
          downloadCsv("幻梦境-" + editionPart + "-" + suffix + ".csv", headers, getRows());
        });
        tools.appendChild(button);
      }
      addExport("导出评分明细", "评分明细", ["作品", "评分者QQ", "传录", "档案", "综合", "评分时间"], function () {
        return rowsForSelection(report.ratings).map(function (r) { return [r.workId, r.qq, r.chuanlu, r.dangan, r.overall, r.t]; });
      });
      addExport("导出评分汇总", "评分汇总", ["作品", "评分人数", "传录均分", "档案均分", "综合均分", "总平均分", "评论数"], function () {
        return sortedWorkStats().map(function (r) { return [r.workId, r.ratingCount, r.chuanluAvg, r.danganAvg, r.overallAvg, r.totalAvg, r.commentCount]; });
      });
      addExport("导出评论明细", "评论明细", ["作品", "QQ", "昵称", "匿名", "评委", "评论", "发表时间", "编辑时间"], function () {
        return rowsForSelection(report.comments).map(function (r) { return [r.workId, r.qq, r.name, r.anonymous ? "是" : "否", r.judge ? "是" : "否", r.body, r.t, r.editedAt]; });
      });
      body.appendChild(tools);
      updateReportView();
      openModal("数据与导出", body);
    }).catch(function (err) {
      loading.appendChild(el("p", "auth-error", err.message || String(err)));
    });
  }

  function openSpotlightConfigModal() {
    if (!isAdmin() || !USE_CLOUD) return;
    var edition = findEdition(state.editionSlug);
    if (!edition) return;
    var loading = el("div", "modal-body");
    loading.appendChild(el("p", "modal-meta", "正在读取首页聚光配置…"));
    openModal("首页聚光", loading);
    window.MythosAPI.call("adminGetSpotlightConfig", {
      editionSlug: edition.slug,
      catalogueWorkIds: edition.works.map(function (work) {
        return workId(edition.slug, work.slug);
      }),
    })
      .then(function (data) {
        renderSpotlightAdmin(data || {});
      })
      .catch(function (err) {
        var fail = el("div", "modal-body");
        fail.appendChild(backToAdminButton());
        fail.appendChild(el("p", "auth-error", err.message || String(err)));
        openModal("首页聚光", fail);
      });

    function renderSpotlightAdmin(data) {
      var config = data.config || {};
      var schedule = Object.assign({}, config.manualSchedule || {});
      var body = el("div", "modal-body spotlight-admin");
      body.appendChild(backToAdminButton());
      body.appendChild(
        el(
          "p",
          "modal-meta",
          "当前届别：" +
            edition.shortName +
            "。普通用户只会看到公开标签，不会看到评分人数、候选排序或未来排期。",
        ),
      );

      var enabledWrap = el("label", "checkbox admin-check");
      var enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = config.enabled !== false;
      enabledWrap.appendChild(enabled);
      enabledWrap.appendChild(el("span", null, "启用首页聚光"));
      body.appendChild(enabledWrap);

      var modeLabel = el("label", "field-label", "推荐模式");
      var mode = el("select", "auth-input");
      [
        ["hybrid", "管理员优先，自动补齐"],
        ["manual", "只使用管理员指定"],
        ["automatic", "完全自动补齐"],
      ].forEach(function (item) {
        var option = el("option", null, item[1]);
        option.value = item[0];
        option.selected = config.mode === item[0];
        mode.appendChild(option);
      });
      body.appendChild(modeLabel);
      body.appendChild(mode);

      var countLabel = el("label", "field-label", "每日聚光数量（1–5）");
      var count = el("input", "auth-input");
      count.type = "number";
      count.min = String(SPOTLIGHT_MIN_COUNT);
      count.max = String(SPOTLIGHT_MAX_COUNT);
      count.step = "1";
      count.inputMode = "numeric";
      count.value = String(normalizeSpotlightCount(config.dailyCount));
      countLabel.appendChild(count);
      body.appendChild(countLabel);

      var thresholdLabel = el("label", "field-label", "自动候选条件：有效评分人数少于");
      var threshold = el("input", "auth-input");
      threshold.type = "number";
      threshold.min = "1";
      threshold.max = "1000";
      threshold.value = String(config.ratingThreshold || 5);
      thresholdLabel.appendChild(threshold);
      body.appendChild(thresholdLabel);

      var cooldownLabel = el("label", "field-label", "重复冷却（天）");
      var cooldown = el("input", "auth-input");
      cooldown.type = "number";
      cooldown.min = "0";
      cooldown.max = "365";
      cooldown.value = String(config.cooldownDays == null ? 7 : config.cooldownDays);
      cooldownLabel.appendChild(cooldown);
      body.appendChild(cooldownLabel);

      var dateLabel = el("label", "field-label", "推荐日期");
      var date = el("input", "auth-input");
      date.type = "date";
      date.value = data.date || dateKeyInTimezone(new Date(), SPOTLIGHT_TIMEZONE);
      dateLabel.appendChild(date);
      body.appendChild(dateLabel);

      body.appendChild(el("h3", "modal-sub", "当天管理员指定"));
      body.appendChild(
        el(
          "p",
          "modal-meta",
          "每个位置都可以留空交给自动补齐。评分人数和近 7 日状态只在此后台显示。",
        ),
      );
      var slotsRoot = el("div", "spotlight-admin-slots");
      body.appendChild(slotsRoot);
      var slotRefs = [];
      var candidateMap = {};
      (data.candidates || []).forEach(function (candidate) {
        candidateMap[candidate.workId] = candidate;
      });

      function workLabel(work) {
        var id = workId(edition.slug, work.slug);
        var candidate = candidateMap[id];
        var suffix = candidate
          ? " · " +
            candidate.ratingCount +
            " 票" +
            (candidate.recent ? " · 近 7 日出现" : "")
          : "";
        return String(work.no).padStart(3, "0") + " " + work.title + suffix;
      }

      function paintSlots() {
        clear(slotsRoot);
        slotRefs = [];
        var entries = Array.isArray(schedule[date.value]) ? schedule[date.value] : [];
        var slotCount = normalizeSpotlightCount(count.value);
        count.value = String(slotCount);
        for (var i = 0; i < slotCount; i++) {
          var entry = entries[i] || {};
          var row = el("div", "spotlight-admin-slot");
          row.appendChild(el("span", "spotlight-slot-no", String(i + 1)));
          var controls = el("div", "spotlight-slot-controls");
          var select = el("select", "auth-input");
          var automatic = el("option", null, "自动补齐");
          automatic.value = "";
          select.appendChild(automatic);
          edition.works.forEach(function (work) {
            var option = el("option", null, workLabel(work));
            option.value = workId(edition.slug, work.slug);
            option.selected = option.value === entry.workId;
            select.appendChild(option);
          });
          controls.appendChild(select);

          var label = el("select", "auth-input");
          [
            ["今日选读", "今日选读"],
            ["待更多评议", "待更多评议"],
            ["今日聚光", "今日聚光"],
          ].forEach(function (item) {
            var labelOption = el("option", null, item[1]);
            labelOption.value = item[0];
            labelOption.selected = (entry.publicLabel || "今日选读") === item[0];
            label.appendChild(labelOption);
          });
          controls.appendChild(label);

          var note = el("input", "auth-input");
          note.type = "text";
          note.maxLength = 200;
          note.placeholder = "内部备注（不公开）";
          note.value = entry.note || "";
          controls.appendChild(note);
          row.appendChild(controls);
          slotsRoot.appendChild(row);
          slotRefs.push({ select: select, label: label, note: note });
        }
      }
      paintSlots();
      count.addEventListener("change", function () {
        count.value = String(normalizeSpotlightCount(count.value));
        paintSlots();
      });
      date.addEventListener("change", paintSlots);

      body.appendChild(el("h3", "modal-sub", "今日固化结果"));
      var todayBox = el("div", "spotlight-admin-today");
      var todayRows = data.today || [];
      if (!todayRows.length) {
        todayBox.appendChild(el("p", "comment-empty", "今天尚未生成结果；保存后可按需立即重算。"));
      } else {
        todayRows.forEach(function (row) {
          var candidate = candidateMap[row.workId];
          var work = edition.works.filter(function (item) {
            return workId(edition.slug, item.slug) === row.workId;
          })[0];
          todayBox.appendChild(
            el(
              "p",
              "modal-meta",
              String(row.position) +
                " · " +
                (work ? work.title : row.workId) +
                " · " +
                row.publicLabel +
                (candidate ? " · 当前 " + candidate.ratingCount + " 票" : ""),
            ),
          );
        });
      }
      body.appendChild(todayBox);

      var error = el("p", "auth-error");
      error.setAttribute("aria-live", "polite");
      body.appendChild(error);
      var actions = el("div", "admin-row");
      var save = el("button", "btn", "保存排期");
      save.type = "button";
      var rebuild = el("button", "btn-ghost", "保存并立即重算今天");
      rebuild.type = "button";
      actions.appendChild(save);
      actions.appendChild(rebuild);
      body.appendChild(actions);

      function collectConfig() {
        var entries = slotRefs
          .map(function (slot) {
            if (!slot.select.value) return null;
            return {
              workId: slot.select.value,
              publicLabel: slot.label.value,
              note: slot.note.value.trim(),
            };
          })
          .filter(Boolean);
        if (entries.length) schedule[date.value] = entries;
        else delete schedule[date.value];
        return {
          enabled: enabled.checked,
          mode: mode.value,
          dailyCount: normalizeSpotlightCount(count.value),
          ratingThreshold: Number(threshold.value) || 5,
          cooldownDays: Number(cooldown.value) || 0,
          timezone: config.timezone || SPOTLIGHT_TIMEZONE,
          catalogueWorkIds: edition.works.map(function (work) {
            return workId(edition.slug, work.slug);
          }),
          manualSchedule: schedule,
        };
      }

      function saveConfig(rebuildToday) {
        error.textContent = "";
        save.disabled = true;
        rebuild.disabled = true;
        var nextConfig = collectConfig();
        window.MythosAPI.call("adminSaveSpotlightConfig", {
          editionSlug: edition.slug,
          config: nextConfig,
          rebuildToday: !!rebuildToday,
        })
          .then(function () {
            delete spotlightCache[edition.slug];
            openSpotlightConfigModal();
          })
          .catch(function (err) {
            error.textContent = err.message || String(err);
            save.disabled = false;
            rebuild.disabled = false;
          });
      }
      save.addEventListener("click", function () {
        saveConfig(false);
      });
      rebuild.addEventListener("click", function () {
        saveConfig(true);
      });
      openModal("首页聚光", body);
    }
  }

  function backToAdminButton() {
    var btn = el("button", "btn-ghost", "返回管理面板");
    btn.type = "button";
    btn.addEventListener("click", openAdminModal);
    return btn;
  }

  function makeSearchBox(placeholder, onInput) {
    var input = el("input", "auth-input admin-search");
    input.type = "search";
    input.placeholder = placeholder;
    input.addEventListener("input", function () {
      onInput(input.value.trim().toLowerCase());
    });
    return input;
  }

  // 密码框 + "显示 / 隐藏"按钮
  function passwordRow(input) {
    var row = el("div", "auth-code-row");
    row.appendChild(input);
    var toggle = el("button", "btn-ghost btn-tiny", "显示");
    toggle.type = "button";
    toggle.setAttribute("aria-label", "显示密码");
    toggle.addEventListener("click", function () {
      var shown = input.type === "text";
      input.type = shown ? "password" : "text";
      toggle.textContent = shown ? "显示" : "隐藏";
      toggle.setAttribute("aria-label", shown ? "显示密码" : "隐藏密码");
      input.focus();
    });
    row.appendChild(toggle);
    return row;
  }

  function openQQDirectoryModal(kind, mode) {
    if (!isAdmin()) return;
    var isMember = kind === "member";
    var title = isMember ? "调查员 QQ 目录" : "管理员 QQ 名单";
    var list = (
      isMember
        ? store.settings.memberDirectory
        : store.settings.adminDirectory
    ).slice();
    var body = el("div", "modal-body");
    body.appendChild(backToAdminButton());
    body.appendChild(
      el(
        "p",
        "modal-meta",
        isMember
          ? "注册前须在此目录或管理员名单中。正式版将改为核验 QQ 群。"
          : "在此名单中的 QQ 注册/登录后自动成为管理员。默认保留 " +
              DEFAULT_ADMIN_QQ +
              "。",
      ),
    );

    if (mode === "view") {
      body.appendChild(el("h3", "modal-sub", "查看 · " + title));
      var result = el("ul", "admin-user-list admin-dir-list");
      var empty = el("p", "comment-empty", "目录为空。");
      function paint(needle) {
        clear(result);
        var shown = list.filter(function (qq) {
          if (!needle) return true;
          var user = store.users[qq];
          var hay = (qq + " " + (user ? displayName(user) : "")).toLowerCase();
          return hay.indexOf(needle) !== -1;
        });
        empty.hidden = !!shown.length;
        shown.forEach(function (qq) {
          var li = el("li", "admin-user-item");
          var user = store.users[qq];
          li.appendChild(
            el(
              "span",
              null,
              qq +
                (user
                  ? " · " +
                    displayName(user) +
                    (user.role === "admin" ? " · 已注册管理" : " · 已注册")
                  : " · 未注册"),
            ),
          );
          result.appendChild(li);
        });
      }
      body.appendChild(makeSearchBox("检索 QQ 或已注册昵称…", paint));
      body.appendChild(empty);
      body.appendChild(result);
      paint("");
      var toEdit = el("button", "btn", "去编辑目录");
      toEdit.type = "button";
      toEdit.addEventListener("click", function () {
        openQQDirectoryModal(kind, "edit");
      });
      body.appendChild(toEdit);
    } else {
      body.appendChild(el("h3", "modal-sub", "编辑 · " + title));
      body.appendChild(el("p", "modal-meta", "每行一个 QQ 号。"));
      var area = el("textarea", "auth-textarea");
      area.rows = 14;
      area.value = list.join("\n");
      body.appendChild(area);
      var save = el("button", "btn", "保存目录");
      save.type = "button";
      save.addEventListener("click", function () {
        var next = parseQQLines(area.value);
        if (isMember) {
          store.settings.memberDirectory = next;
        } else {
          if (next.indexOf(DEFAULT_ADMIN_QQ) === -1) next.unshift(DEFAULT_ADMIN_QQ);
          store.settings.adminDirectory = next;
          Object.keys(store.users).forEach(function (qq) {
            store.users[qq].role = resolveRoleForQQ(qq);
          });
        }
        persist();
        refreshChrome();
        if (USE_CLOUD) {
          pushCloudSettings()
            .then(function () {
              openQQDirectoryModal(kind, "view");
            })
            .catch(function (e) {
              alert(e.message || String(e));
            });
          return;
        }
        openQQDirectoryModal(kind, "view");
      });
      body.appendChild(save);
    }

    openModal(title, body);
  }

  function authorBindRows(edition) {
    if (!edition || !edition.works) return [];
    return edition.works.map(function (work) {
      var wid = workId(edition.slug, work.slug);
      return {
        work: work,
        id: wid,
        qq: effectiveAuthorQQ(wid, work),
        fromFile: !!(work.authorQQ && String(work.authorQQ).trim()),
      };
    });
  }

  function countAuthorBound(edition) {
    var n = 0;
    authorBindRows(edition).forEach(function (row) {
      if (row.qq) n += 1;
    });
    return n;
  }

  function openAuthorEditionPicker(mode) {
    if (!isAdmin()) return;
    var body = el("div", "modal-body");
    body.appendChild(backToAdminButton());
    body.appendChild(el("h3", "modal-sub", "选择届别"));
    body.appendChild(
      el(
        "p",
        "modal-meta",
        (mode === "edit" ? "编辑" : "查看") +
          "作者绑定前，请先选择要管理的届。",
      ),
    );
    var list = el("ul", "admin-user-list admin-dir-list");
    editions.forEach(function (ed) {
      var bound = countAuthorBound(ed);
      var total = (ed.works || []).length;
      var li = el("li", "admin-user-item");
      li.appendChild(
        el(
          "span",
          null,
          ed.shortName +
            " · 已绑定 " +
            bound +
            " / " +
            total +
            (total ? "" : "（尚无作品）"),
        ),
      );
      var go = el("button", "btn-ghost btn-tiny", mode === "edit" ? "编辑" : "查看");
      go.type = "button";
      go.disabled = !total;
      go.addEventListener("click", function () {
        openAuthorDirectoryModal(mode, ed.slug);
      });
      li.appendChild(go);
      list.appendChild(li);
    });
    body.appendChild(list);
    openModal("作者 QQ 绑定 · 选届", body);
  }

  function openAuthorDirectoryModal(mode, editionSlug) {
    if (!isAdmin()) return;
    var slug = editionSlug || state.editionSlug;
    var edition = findEdition(slug);
    if (!edition) {
      openAuthorEditionPicker(mode);
      return;
    }
    var settings = store.settings;
    var rows = authorBindRows(edition);
    var body = el("div", "modal-body");
    body.appendChild(backToAdminButton());
    var switchEd = el("button", "btn-ghost", "切换届别");
    switchEd.type = "button";
    switchEd.addEventListener("click", function () {
      openAuthorEditionPicker(mode);
    });
    body.appendChild(switchEd);
    body.appendChild(
      el(
        "p",
        "modal-meta",
        "当前届：" +
          edition.shortName +
          "。绑定后仅该 QQ 可编辑对应作品的「作者的话」。也可在 Markdown 写 authorQQ。",
      ),
    );

    if (mode === "view") {
      body.appendChild(
        el("h3", "modal-sub", "查看 · " + edition.shortName + " 作者绑定"),
      );
      var result = el("ul", "admin-user-list admin-dir-list");
      var empty = el("p", "comment-empty", "没有匹配项。");
      function paint(needle) {
        clear(result);
        var shown = rows.filter(function (row) {
          if (!needle) return true;
          var hay = [row.work.no, row.work.title, row.work.slug, row.qq]
            .join(" ")
            .toLowerCase();
          return hay.indexOf(needle) !== -1;
        });
        empty.hidden = !!shown.length;
        shown.forEach(function (row) {
          var li = el("li", "admin-user-item");
          li.appendChild(
            el(
              "span",
              null,
              String(row.work.no).padStart(2, "0") +
                " " +
                row.work.title +
                " → " +
                (row.qq || "未绑定") +
                (row.qq && row.fromFile && !authorBindings()[row.id]
                  ? "（稿件）"
                  : ""),
            ),
          );
          result.appendChild(li);
        });
      }
      body.appendChild(makeSearchBox("检索编号、标题或 QQ…", paint));
      body.appendChild(empty);
      body.appendChild(result);
      paint("");
      var toEdit = el("button", "btn", "去编辑本届目录");
      toEdit.type = "button";
      toEdit.addEventListener("click", function () {
        openAuthorDirectoryModal("edit", slug);
      });
      body.appendChild(toEdit);
    } else {
      body.appendChild(
        el("h3", "modal-sub", "编辑 · " + edition.shortName + " 作者绑定"),
      );
      body.appendChild(
        el(
          "p",
          "modal-meta",
          "每行：编号=QQ 或 slug=QQ。保存时会把作者 QQ 自动加入调查员目录。清空某行绑定请删除该行。",
        ),
      );
      var area = el("textarea", "auth-textarea");
      area.rows = 14;
      area.placeholder = "01=123456789\n02=987654321";
      area.value = rows
        .filter(function (row) {
          return !!row.qq;
        })
        .map(function (row) {
          return String(row.work.no).padStart(2, "0") + "=" + row.qq;
        })
        .join("\n");
      body.appendChild(area);
      var save = el("button", "btn", "保存本届作者绑定");
      save.type = "button";
      save.addEventListener("click", function () {
        if (!edition.works) return;
        var byNo = {};
        var bySlug = {};
        edition.works.forEach(function (work) {
          byNo[String(work.no)] = work;
          byNo[String(work.no).padStart(2, "0")] = work;
          bySlug[work.slug] = work;
        });
        edition.works.forEach(function (work) {
          delete authorBindings()[workId(slug, work.slug)];
        });
        area.value.split(/\r?\n/).forEach(function (line) {
          line = line.trim();
          if (!line || line.indexOf("=") === -1) return;
          var parts = line.split("=");
          var key = parts[0].trim();
          var qq = parts.slice(1).join("=").trim();
          if (!/^\d{5,12}$/.test(qq)) return;
          var work = byNo[key] || bySlug[key];
          if (!work) return;
          var wid = workId(slug, work.slug);
          if (String(work.authorQQ || "") === qq) {
            delete authorBindings()[wid];
          } else {
            authorBindings()[wid] = qq;
          }
          if ((settings.memberDirectory || []).indexOf(qq) === -1) {
            settings.memberDirectory = (settings.memberDirectory || []).concat([
              qq,
            ]);
          }
        });
        store.settings = settings;
        persist();
        if (USE_CLOUD) {
          pushCloudSettings()
            .then(function () {
              openAuthorDirectoryModal("view", slug);
              route();
            })
            .catch(function (e) {
              alert(e.message || String(e));
            });
          return;
        }
        openAuthorDirectoryModal("view", slug);
        route();
      });
      body.appendChild(save);
    }

    openModal("作者 QQ 绑定 · " + edition.shortName, body);
  }

  function openRegisteredUsersModal() {
    if (!isAdmin()) return;

    function renderList(users) {
      var body = el("div", "modal-body");
      body.appendChild(backToAdminButton());
      body.appendChild(el("h3", "modal-sub", "已注册账号"));
      body.appendChild(
        el(
          "p",
          "modal-meta",
          USE_CLOUD
            ? "数据来自云端，可按 QQ、昵称、角色检索；可启停账号。"
            : "可按 QQ、昵称、角色检索；可启停账号。",
        ),
      );
      var result = el("ul", "admin-user-list admin-dir-list");
      var empty = el("p", "comment-empty", "没有匹配的账号。");
      if (USE_CLOUD) {
        var actions = el("div", "admin-row");
        var createUser = el("button", "btn-ghost btn-tiny", "手动建号（对方收不到邮件时用）");
        createUser.type = "button";
        createUser.addEventListener("click", openAdminCreateUserModal);
        actions.appendChild(createUser);
        body.appendChild(actions);
      }
      var qqs = users
        .map(function (u) {
          return u.qq;
        })
        .filter(Boolean)
        .sort();

      function paint(needle) {
        clear(result);
        var shown = qqs.filter(function (qq) {
          var user = store.users[qq];
          if (!user) return false;
          if (!needle) return true;
          var hay = [
            qq,
            displayName(user),
            user.role === "admin" ? "管理" : "调查员",
            user.enabled ? "" : "停用",
          ]
            .join(" ")
            .toLowerCase();
          return hay.indexOf(needle) !== -1;
        });
        empty.hidden = !!shown.length;
        shown.forEach(function (qq) {
          var user = store.users[qq];
          var li = el("li", "admin-user-item");
          li.appendChild(
            el(
              "span",
              null,
              qq +
                " · " +
                displayName(user) +
                " · " +
                (user.role === "admin" ? "管理" : "调查员") +
                (user.enabled ? "" : "（已停用）"),
            ),
          );
          var toggle = el(
            "button",
            "btn-ghost btn-tiny",
            user.enabled ? "停用" : "启用",
          );
          toggle.type = "button";
          toggle.addEventListener("click", function () {
            var nextEnabled = !user.enabled;
            if (USE_CLOUD) {
              toggle.disabled = true;
              window.MythosAPI.call("adminSetUserEnabled", {
                qq: qq,
                enabled: nextEnabled,
              })
                .then(function () {
                  user.enabled = nextEnabled;
                  store.users[qq] = user;
                  openRegisteredUsersModal();
                })
                .catch(function (e) {
                  alert(e.message || String(e));
                  toggle.disabled = false;
                });
              return;
            }
            user.enabled = nextEnabled;
            store.users[qq] = user;
            persist();
            openRegisteredUsersModal();
          });
          li.appendChild(toggle);
          result.appendChild(li);
        });
      }

      var search = makeSearchBox("检索 QQ / 昵称 / 管理 / 调查员…", paint);
      body.appendChild(search);
      body.appendChild(empty);
      body.appendChild(result);
      paint("");
      openModal("已注册账号", body);
    }

    if (USE_CLOUD) {
      var loading = el("div", "modal-body");
      loading.appendChild(backToAdminButton());
      loading.appendChild(el("p", "modal-meta", "正在加载云端账号…"));
      openModal("已注册账号", loading);
      window.MythosAPI.call("adminGetUsers")
        .then(function (data) {
          mergeCloudUsers(data && data.users);
          renderList(cloudUserList);
        })
        .catch(function (e) {
          var fail = el("div", "modal-body");
          fail.appendChild(backToAdminButton());
          fail.appendChild(el("p", "auth-error", e.message || String(e)));
          openModal("已注册账号", fail);
        });
      return;
    }

    renderList(
      Object.keys(store.users).map(function (qq) {
        return store.users[qq];
      }),
    );
  }

  // 管理员兜底建号：对方收不到验证码邮件时使用
  function openAdminCreateUserModal() {
    if (!isAdmin()) return;
    var body = el("div", "modal-body");
    body.appendChild(backToAdminButton());
    body.appendChild(el("h3", "modal-sub", "手动建号"));
    body.appendChild(
      el(
        "p",
        "modal-meta",
        "用于对方收不到验证码邮件（例如 QQ 邮箱未开通）时兜底。请把临时密码私下发给他，并提醒登录后自行修改。",
      ),
    );
    var form = el("form", "auth-form");
    var qq = el("input", "auth-input");
    qq.type = "text";
    qq.placeholder = "QQ 号";
    qq.inputMode = "numeric";
    var nick = el("input", "auth-input");
    nick.type = "text";
    nick.placeholder = "昵称";
    nick.maxLength = NAME_MAX;
    var pass = el("input", "auth-input");
    pass.type = "password";
    pass.placeholder = "临时密码（至少 4 位）";
    var err = el("p", "auth-error");
    err.setAttribute("aria-live", "polite");
    var submit = el("button", "btn", "创建账号");
    submit.type = "submit";
    form.appendChild(qq);
    form.appendChild(nick);
    form.appendChild(passwordRow(pass));
    form.appendChild(err);
    form.appendChild(submit);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      err.textContent = "";
      var id = qq.value.trim();
      if (!/^\d{5,12}$/.test(id)) {
        err.textContent = "请输入 5–12 位数字 QQ 号。";
        return;
      }
      if (pass.value.length < 4) {
        err.textContent = "临时密码至少 4 位。";
        return;
      }
      submit.disabled = true;
      submit.textContent = "创建中…";
      window.MythosAPI.call("adminCreateUser", {
        qq: id,
        pass: pass.value,
        nickname: nick.value.trim(),
      })
        .then(function () {
          openRegisteredUsersModal();
        })
        .catch(function (e) {
          err.textContent = e.message || String(e);
          submit.disabled = false;
          submit.textContent = "创建账号";
        });
    });
    body.appendChild(form);
    openModal("手动建号", body);
  }

  /* ---------- 管理员：在线编辑作品正文 ---------- */

  function openWorkEditor(id, work) {
    if (!isAdmin()) return;
    var title = "编辑正文 · " + (work && work.title ? work.title : id);
    var loading = el("div", "modal-body");
    loading.appendChild(el("p", "modal-meta", "正在读取正文…"));
    openModal(title, loading);

    window.MythosAPI.call("getWorkContent", { workId: id })
      .then(function (data) {
        renderEditor(data || {});
      })
      .catch(function (e) {
        var fail = el("div", "modal-body");
        fail.appendChild(el("p", "auth-error", e.message || String(e)));
        openModal(title, fail);
      });

    function renderEditor(data) {
      var hasOverride = !!(data.html && data.html.length);
      var source = hasOverride ? data.html : (work && work.html ? work.html : "");
      var body = el("div", "modal-body editor-modal");
      body.appendChild(
        el(
          "p",
          "modal-meta",
          hasOverride
            ? "这篇正文已被在线改过（" + formatTime(data.updatedAt) + "，由 " + (data.qq || "管理员") + "）。保存后立即对所有访客生效。"
            : "下面是构建时生成的正文源码。保存后会覆盖线上显示，原始文件不受影响，随时可以「恢复构建版本」。",
        ),
      );
      body.appendChild(
        el(
          "p",
          "modal-meta",
          '写法：一段正文＝一行 <p class="doc-p">…</p>，删掉整行就删掉该段；小标题是 <h2 id="任意英文">标题</h2>。改完先看预览，确认无误再保存。',
        ),
      );

      var area = el("textarea", "editor-source");
      area.value = source;
      area.spellcheck = false;
      var err = el("p", "auth-error");
      err.setAttribute("aria-live", "polite");
      var preview = el("div", "editor-preview work-body" + (id === "2026/34-沃多在哪里？" ? " work-no-indent" : ""));
      preview.innerHTML = source;

      var row = el("div", "admin-row editor-actions");
      var save = el("button", "btn", "保存并生效");
      save.type = "button";
      var reset = el("button", "btn-ghost", "恢复构建版本");
      reset.type = "button";
      reset.disabled = !hasOverride;
      var close = el("button", "btn-ghost", "关闭");
      close.type = "button";
      row.appendChild(save);
      row.appendChild(reset);
      row.appendChild(close);

      body.appendChild(el("h4", "modal-sub", "正文源码"));
      body.appendChild(area);
      body.appendChild(err);
      body.appendChild(row);

      if (data.history && data.history.length) {
        var histBox = el("div", "editor-history");
        histBox.appendChild(el("h4", "modal-sub", "历史版本"));
        data.history.forEach(function (item) {
          var line = el("div", "editor-history-item");
          line.appendChild(
            el("span", null, formatTime(item.updatedAt) + " · " + (item.qq || "管理员")),
          );
          var undo = el("button", "btn-ghost btn-tiny", "还原到这一版");
          undo.type = "button";
          undo.addEventListener("click", function () {
            undo.disabled = true;
            window.MythosAPI.call("restoreWorkContent", {
              workId: id,
              historyId: item.id,
            })
              .then(function (restored) {
                cloudContent[id] = {
                  html: restored.html,
                  updatedAt: restored.updatedAt,
                  editedBy: restored.qq,
                };
                route();
                openWorkEditor(id, work);
              })
              .catch(function (e) {
                alert(e.message || String(e));
                undo.disabled = false;
              });
          });
          line.appendChild(undo);
          histBox.appendChild(line);
        });
        body.appendChild(histBox);
      }

      body.appendChild(el("h4", "modal-sub", "预览"));
      body.appendChild(preview);

      area.addEventListener("input", function () {
        preview.innerHTML = area.value;
      });
      close.addEventListener("click", closeModal);
      save.addEventListener("click", function () {
        var html = area.value.trim();
        if (!html) {
          err.textContent = "正文不能为空；要还原请用「恢复构建版本」。";
          return;
        }
        save.disabled = true;
        save.textContent = "保存中…";
        window.MythosAPI.call("saveWorkContent", { workId: id, html: html })
          .then(function (saved) {
            cloudContent[id] = {
              html: saved.html,
              updatedAt: saved.updatedAt,
              editedBy: saved.qq,
            };
            closeModal();
            route();
          })
          .catch(function (e) {
            err.textContent = e.message || String(e);
            save.disabled = false;
            save.textContent = "保存并生效";
          });
      });
      reset.addEventListener("click", function () {
        if (!window.confirm("确定要放弃在线修改，恢复成构建时的版本吗？")) return;
        reset.disabled = true;
        window.MythosAPI.call("resetWorkContent", { workId: id })
          .then(function () {
            delete cloudContent[id];
            closeModal();
            route();
          })
          .catch(function (e) {
            alert(e.message || String(e));
            reset.disabled = false;
          });
      });

      openModal(title, body);
    }
  }

  // 后台入口：先挑作品再编辑
  function openWorkContentPicker() {
    if (!isAdmin()) return;
    var edition = findEdition(state.editionSlug);
    var body = el("div", "modal-body");
    body.appendChild(backToAdminButton());
    body.appendChild(el("h3", "modal-sub", "编辑作品正文"));
    body.appendChild(
      el(
        "p",
        "modal-meta",
        "当前届别：" +
          (edition ? edition.name : "—") +
          "。标着「已修改」的是被在线改过的作品；也可以直接打开作品页，用正文上方的「编辑正文」按钮。",
      ),
    );
    var list = el("ul", "admin-user-list admin-dir-list");
    var empty = el("p", "comment-empty", "没有匹配的作品。");
    var items = edition
      ? edition.works.map(function (w) {
          return { work: w, id: workId(edition.slug, w.slug) };
        })
      : [];

    function paint(needle) {
      clear(list);
      var shown = items.filter(function (item) {
        if (!needle) return true;
        return (String(item.work.no) + " " + item.work.title).toLowerCase().indexOf(needle) !== -1;
      });
      empty.hidden = !!shown.length;
      shown.forEach(function (item) {
        var li = el("li", "admin-user-item");
        var text =
          String(item.work.no).padStart(2, "0") + " " + item.work.title + (cloudContent[item.id] ? " · 已修改" : "");
        var open = el("button", "btn-ghost btn-tiny", text);
        open.type = "button";
        open.addEventListener("click", function () {
          openWorkEditor(item.id, item.work);
        });
        li.appendChild(open);
        list.appendChild(li);
      });
    }

    body.appendChild(makeSearchBox("搜索编号或标题…", paint));
    body.appendChild(empty);
    body.appendChild(list);
    paint("");
    openModal("编辑作品正文", body);
  }

  /* ---------- 目录 ---------- */

  function buildEditionSelect() {
    clear(refs.editionSelect);
    editions.forEach(function (edition) {
      var option = el("option", null, edition.shortName);
      option.value = edition.slug;
      if (!edition.works.length) option.textContent += "（待补充）";
      refs.editionSelect.appendChild(option);
    });
    refs.editionSelect.value = state.editionSlug;
  }

  function orderedWorks(edition) {
    if (!edition) return [];
    var starred = starsOf(edition.slug);
    var starredSet = {};
    starred.forEach(function (slug) {
      starredSet[slug] = true;
    });
    var pinned = [];
    starred.forEach(function (slug) {
      var work = findWork(edition, slug);
      if (work) pinned.push(work);
    });
    var rest = edition.works.filter(function (work) {
      return !starredSet[work.slug];
    });
    return pinned.concat(rest);
  }

  function visibleWorks() {
    var edition = findEdition(state.editionSlug);
    var works = orderedWorks(edition);
    var needle = state.keyword.trim().toLowerCase();
    if (!needle) return works;
    return works.filter(function (work) {
      return workSearchText(work).indexOf(needle) !== -1;
    });
  }

  function renderToc() {
    var scrollTop = refs.toc.scrollTop;
    clear(refs.toc);
    var editionForProgress = findEdition(state.editionSlug);
    var progress = ratingProgressAvailable(editionForProgress)
      ? ratingProgressData(editionForProgress)
      : null;
    var ratedIds = progress && progress.status === "loaded"
      ? progress.ratedWorkIds
      : [];

    var overview = el("button", "toc-overview");
    overview.type = "button";
    overview.appendChild(el("span", "toc-overview-mark", "⌂"));
    overview.appendChild(el("span", "toc-overview-text", "返回历届总览"));
    if (!state.workSlug && location.hash.indexOf("__results") === -1) {
      overview.setAttribute("aria-current", "true");
    }
    overview.addEventListener("click", function () {
      location.hash = "#/" + state.editionSlug;
      collapseSidebarOnMobile();
    });
    refs.toc.appendChild(overview);

    var tocEdition = findEdition(state.editionSlug);
    if (historicalResultsOf(tocEdition)) {
      var publicationLink = el("button", "toc-overview", "查看本届公示");
      publicationLink.type = "button";
      if (location.hash.indexOf("__results") !== -1) publicationLink.setAttribute("aria-current", "true");
      publicationLink.addEventListener("click", function () {
        location.hash = "#/" + state.editionSlug + "/__results";
        collapseSidebarOnMobile();
      });
      refs.toc.appendChild(publicationLink);
    }

    var works = visibleWorks();
    if (!works.length) {
      var edition = findEdition(state.editionSlug);
      refs.toc.appendChild(
        el(
          "p",
          "toc-empty",
          edition && !edition.works.length
            ? "这一届尚未录入作品。"
            : "没有匹配的作品。",
        ),
      );
      refs.toc.scrollTop = scrollTop;
      return;
    }

    works.forEach(function (work) {
      var starred = isStarred(state.editionSlug, work.slug);
      var row = el("div", "toc-row" + (starred ? " is-starred" : ""));
      var star = el("button", "toc-star");
      star.type = "button";
      star.setAttribute("aria-pressed", starred ? "true" : "false");
      star.setAttribute("aria-label", starred ? "取消置顶" : "标星置顶");
      star.appendChild(svgUse("i-star", "icon"));
      star.title = canInteract()
        ? starred
          ? "取消置顶"
          : "标星置顶"
        : "登录调查员账号后可标星";
      star.disabled = !canInteract();
      star.addEventListener("click", function (event) {
        event.stopPropagation();
        if (!canInteract()) return;
        toggleStar(state.editionSlug, work.slug);
        renderToc();
      });

      var item = el("button", "toc-item");
      item.type = "button";
      if (work.slug === state.workSlug) item.setAttribute("aria-current", "true");
      item.appendChild(el("span", "toc-no", String(work.no).padStart(2, "0")));
      item.appendChild(el("span", "toc-title", work.title));
      if (ratedIds.indexOf(workId(state.editionSlug, work.slug)) !== -1) {
        item.appendChild(el("span", "toc-rated", "已评"));
      }
      item.addEventListener("click", function () {
        location.hash =
          "#/" + state.editionSlug + "/" + encodeURIComponent(work.slug);
        collapseSidebarOnMobile();
      });
      row.appendChild(star);
      row.appendChild(item);
      refs.toc.appendChild(row);
    });
    refs.toc.scrollTop = scrollTop;
  }

  /* ---------- 篇内索引 ---------- */

  function renderSectionNav(sections) {
    if (!sections || !sections.length) return null;
    var nav = el("nav", "section-nav");
    nav.setAttribute("aria-label", "本文分节");
    var toggle = el("button", "section-nav-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.appendChild(el("span", "section-nav-toggle-label", "本文目录"));
    toggle.appendChild(el("span", "section-nav-toggle-count", sections.length + " 节"));
    var list = el("ul", "section-nav-list");
    list.id = "section-nav-list";
    toggle.setAttribute("aria-controls", "section-nav-list");
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    sections.forEach(function (section) {
      var li = el("li", "section-nav-item level-" + section.level);
      var link = el("button", "section-nav-link", section.title);
      link.type = "button";
      link.dataset.target = section.id;
      link.addEventListener("click", function () {
        smoothScrollToId(section.id);
        if (nav.classList.contains("is-open")) {
          nav.classList.remove("is-open");
          toggle.setAttribute("aria-expanded", "false");
        }
      });
      li.appendChild(link);
      list.appendChild(li);
    });
    nav.appendChild(toggle);
    nav.appendChild(list);
    return nav;
  }

  function bindSectionSpy(sections) {
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    if (!sections || !sections.length || !("IntersectionObserver" in window)) return;
    var links = {};
    document.querySelectorAll(".section-nav-link").forEach(function (node) {
      links[node.dataset.target] = node;
    });
    sectionObserver = new IntersectionObserver(
      function (entries) {
        var visible = entries
          .filter(function (entry) {
            return entry.isIntersecting;
          })
          .sort(function (a, b) {
            return a.boundingClientRect.top - b.boundingClientRect.top;
          });
        if (!visible.length) return;
        var activeId = visible[0].target.id;
        Object.keys(links).forEach(function (id) {
          links[id].classList.toggle("is-active", id === activeId);
        });
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 1] },
    );
    sections.forEach(function (section) {
      var node = document.getElementById(section.id);
      if (node) sectionObserver.observe(node);
    });
  }

  /* ---------- 届阶段条 ---------- */

  function renderPhaseChip(slug) {
    var edition = findEdition(slug);
    if (isArchivedEdition(edition)) {
      var archivedChip = el("div", "phase-chip phase-archived");
      archivedChip.appendChild(el("span", "phase-chip-label", "已封存"));
      return archivedChip;
    }
    var st = editionState(slug);
    var chip = el("div", "phase-chip phase-" + st.phase);
    chip.appendChild(el("span", "phase-chip-label", phaseLabel(st.phase)));
    var due = phaseDeadlineOf(slug, st.phase);
    if (due) {
      chip.appendChild(el("span", "phase-chip-meta", "截止 " + formatTime(due)));
    }
    return chip;
  }

  function renderPhaseTimeline(slug) {
    var edition = findEdition(slug);
    if (!edition || isArchivedEdition(edition)) return null;
    var current = phaseOf(slug);
    var currentIndex = PHASES.findIndex(function (phase) {
      return phase.key === current;
    });
    if (currentIndex < 0) currentIndex = 0;
    var timeline = el("div", "phase-timeline");
    timeline.setAttribute("role", "list");
    timeline.setAttribute("aria-label", "本届阶段时间线");
    PHASES.forEach(function (phase, index) {
      var stateClass = index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : "is-next";
      var item = el("div", "phase-timeline-item " + stateClass);
      item.setAttribute("role", "listitem");
      item.appendChild(el("span", "phase-timeline-label", phase.label));
      var due = phaseDeadlineOf(slug, phase.key);
      var meta = due
        ? "截止 " + formatShortDate(due)
        : index < currentIndex
          ? "已完成"
          : index === currentIndex
            ? "截止时间未设置"
            : "待开启";
      item.appendChild(el("span", "phase-timeline-meta", meta));
      timeline.appendChild(item);
    });
    var currentPhase = PHASES[currentIndex] || PHASES[0];
    var currentDue = phaseDeadlineOf(slug, currentPhase.key);
    var mobileSummary = el(
      "div",
      "phase-timeline-mobile-summary",
      currentPhase.label + (currentDue ? " · " + formatShortDate(currentDue) + " 截止" : " · 阶段进行中"),
    );
    mobileSummary.setAttribute("role", "note");
    timeline.appendChild(mobileSummary);
    return timeline;
  }

  // 匿名不是「作者为空」，而是制度的一部分，单独说明一句
  function isAnonymousAuthor(work) {
    return (
      !work.author ||
      work.authorStatus === "anonymous" ||
      work.author === "未见署名" ||
      work.author === "匿名"
    );
  }

  // 届别 + 阶段 + 截止：让「收录 / 评议 / 归档」这件事在文章页也看得见
  function renderProvenance(edition) {
    var st = editionState(edition.slug);
    var line = el("p", "work-provenance");
    line.appendChild(el("span", "work-provenance-edition", edition.shortName));
    line.appendChild(el("span", "work-provenance-sep", "·"));
    line.appendChild(
      el("span", "work-provenance-phase", editionStatusLabel(edition)),
    );
    var due = isArchivedEdition(edition) ? "" : phaseDeadlineOf(edition.slug, st.phase);
    if (due) {
      line.appendChild(el("span", "work-provenance-sep", "·"));
      line.appendChild(
        el("span", "work-provenance-due", "截止 " + formatTime(due)),
      );
    }
    return line;
  }

  /* ---------- 评分面板 ---------- */

  function renderScorePanel(id) {
    var panel = el("section", "rating-area");
    panel.id = "score-panel";
    var grid = el("div", "rating-area-grid");
    var sheet = el("div", "panel rating-sheet");
    grid.appendChild(sheet);
    panel.appendChild(grid);
    var edition = findEdition(state.editionSlug);
    var work = findWork(edition, state.workSlug);
    var sheetHead = el("div", "rating-sheet-head");
    sheetHead.appendChild(el("h2", "panel-title", "评议单"));
    sheetHead.appendChild(
      el(
        "span",
        "rating-sheet-number",
        "No. " + edition.year + " / " + String(work ? work.no : "").padStart(3, "0"),
      ),
    );
    sheet.appendChild(sheetHead);
    if (myRatingOf(id)) {
      sheet.classList.add("has-rating-stamp");
      var ratedStamp = el("span", "rating-sheet-stamp");
      ratedStamp.appendChild(createRatingSheetSeal(edition));
      ratedStamp.setAttribute("aria-label", "已评");
      sheet.appendChild(ratedStamp);
    }

    if (isArchivedEdition(edition)) {
      sheet.appendChild(
        el(
          "p",
          "rate-hint",
          "历史档案已封存，仅供阅读；原届评分与评议数据未随资料迁入。",
        ),
      );
      var archivedProgress = renderRatingProgress(edition, true, id);
      if (archivedProgress) sheet.appendChild(archivedProgress);
      return panel;
    }

    var phase = phaseOf(state.editionSlug);
    var showPublicAverages = isAdmin() || phase !== "评分";
    var summary = el("div", "score-summary");
    var stats = averages(id);
    // 投票人数只给管理员看；其他人没评过时显示"尚未评分"
    var showRaterCount = isAdmin();
    if (showPublicAverages) {
      DIMENSIONS.forEach(function (dim) {
        var cell = el("div", "score-cell");
        cell.appendChild(el("div", "score-label", dim.label));
        var value = stats[dim.key];
        cell.appendChild(
          value === null
            ? el("div", "score-value is-empty", showRaterCount ? "暂无评分" : "尚未评分")
            : el("div", "score-value", value.toFixed(1)),
        );
        if (showRaterCount) {
          cell.appendChild(
            el("div", "score-count", stats.count ? stats.count + " 人" : "0 人"),
          );
        }
        summary.appendChild(cell);
      });
      sheet.appendChild(summary);
    } else if (!votingOpen()) {
      sheet.appendChild(el("p", "rate-hint", "作品均分将在大众评分结束后开放查看。"));
    }

    if (!canInteract()) {
      grid.classList.add("is-single");
      sheet.appendChild(
        el("p", "rate-hint", "访客仅可观看。请使用调查员账号登录后参与。"),
      );
      return panel;
    }

    var ratingProgress = renderRatingProgress(edition, false, id);
    if (ratingProgress) {
      var progressColumn = el("div", "rating-map-column");
      progressColumn.appendChild(ratingProgress);
      grid.appendChild(progressColumn);
    } else {
      grid.classList.add("is-single");
    }

    if (phase === "征文") {
      var dueHint = phaseDeadlineOf(state.editionSlug, "征文");
      sheet.appendChild(
        el(
          "p",
          "rate-hint",
          "当前为创作征文阶段，尚未开放大众评分。" +
            (dueHint ? "征文截止：" + formatTime(dueHint) + "。" : ""),
        ),
      );
    } else if (votingOpen()) {
      sheet.appendChild(renderRateForm(id, panel));
    } else if (phase === "统计") {
      sheet.appendChild(
        el("p", "rate-hint", "大众评分已结束，进入投票统计。管理员可发表评委评论。"),
      );
    } else if (phase === "公示") {
      sheet.appendChild(el("p", "rate-hint", "结果公示中。评分通道已关闭。"));
    } else {
      sheet.appendChild(el("p", "rate-hint", "当前阶段不可评分。"));
    }
    return panel;
  }

  function renderRateForm(id, panel) {
    var existing = myRatingOf(id);
    var draft = {
      chuanlu: existing ? existing.chuanlu : 0,
      dangan: existing ? existing.dangan : 0,
      overall: existing ? existing.overall : 0,
    };
    var wrap = el("div", "rate-form");
    var buttons = {};

    function existingRatingStatus() {
      if (!existing) return "";
      var date = existing.t ? new Date(existing.t) : null;
      if (!date || isNaN(date.getTime())) return "已提交，可随时修改";
      var pad = function (value) { return String(value).padStart(2, "0"); };
      return "已于 " + pad(date.getMonth() + 1) + "." + pad(date.getDate()) + " " +
        pad(date.getHours()) + ":" + pad(date.getMinutes()) + " 提交，可随时修改";
    }

    DIMENSIONS.forEach(function (dim) {
      var row = el("div", "rate-row");
      row.appendChild(el("span", "rate-name", dim.label));
      var scale = el("div", "rate-scale");
      scale.setAttribute("role", "group");
      scale.setAttribute("aria-label", dim.label + "评分，1 到 5 星");
      buttons[dim.key] = [];
      var valueLabel = el("span", "rate-value", draft[dim.key] + "/5");
      valueLabel.setAttribute("aria-hidden", "true");

      function refreshScale(visibleValue) {
        valueLabel.textContent = visibleValue + "/5";
        buttons[dim.key].forEach(function (node, index) {
          var value = index + 1;
          node.dataset.filled = value <= visibleValue ? "true" : "false";
          node.setAttribute("aria-pressed", draft[dim.key] === value ? "true" : "false");
        });
      }

      for (var score = 1; score <= 5; score++) {
        (function (value) {
          var star = el("button", "rate-star");
          star.type = "button";
          setIconLabel(star, "i-star", "");
          star.setAttribute("aria-label", dim.label + " " + value + " 星（满分 5 星）");
          star.title = value + " 星";
          star.addEventListener("mouseenter", function () {
            refreshScale(value);
          });
          star.addEventListener("focus", function () {
            refreshScale(value);
          });
          star.addEventListener("click", function () {
            draft[dim.key] = value;
            refreshScale(value);
            submit.disabled = !isComplete();
            hint.textContent = hintText();
          });
          scale.appendChild(star);
          buttons[dim.key].push(star);
        })(score);
      }
      scale.addEventListener("mouseleave", function () {
        refreshScale(draft[dim.key]);
      });
      refreshScale(draft[dim.key]);
      row.appendChild(scale);
      row.appendChild(valueLabel);
      wrap.appendChild(row);
    });

    function isComplete() {
      return DIMENSIONS.every(function (dim) {
        return draft[dim.key] >= 1;
      });
    }
    function hintText() {
      if (!isComplete()) return "三项都选好后即可提交。";
      return existing ? existingRatingStatus() : "";
    }

    var actions = el("div", "rate-actions");
    var submit = el("button", "btn", existing ? "修改评议" : "提交评分");
    submit.type = "button";
    submit.disabled = !isComplete();
    var hint = el("span", "rate-hint", hintText());
    submit.addEventListener("click", function () {
      if (!isComplete() || !canInteract() || !votingOpen()) return;
      var user = currentUser();
      if (USE_CLOUD) {
        var ratingSubmitted = false;
        submit.disabled = true;
        window.MythosAPI.call("submitRating", {
          workId: id,
          chuanlu: draft.chuanlu,
          dangan: draft.dangan,
          overall: draft.overall,
        })
          .then(function (result) {
            ratingSubmitted = true;
            if (!(result && result.achievementNoticePending)) {
              notifyWitch("rating-success");
            }
            return loadCloudWorkBundle(id, true);
          })
          .then(function () {
            panel.parentNode.replaceChild(renderScorePanel(id), panel);
            loadCloudRatingProgress(state.editionSlug, true).catch(function () {});
          })
          .catch(function (e) {
            alert(e.message || String(e));
            submit.disabled = false;
            if (!ratingSubmitted) notifyWitch("rating-failure");
          });
        return;
      }
      var ratedCountBefore = localRatedWorkIds(findEdition(state.editionSlug)).length;
      var list = ratingsOf(id).slice();
      var record = {
        id: existing ? existing.id : newId(),
        qq: user.qq,
        chuanlu: draft.chuanlu,
        dangan: draft.dangan,
        overall: draft.overall,
        t: new Date().toISOString(),
      };
      var replaced = false;
      for (var i = 0; i < list.length; i++) {
        if (list[i].qq === user.qq || list[i].id === record.id) {
          list[i] = record;
          replaced = true;
          break;
        }
      }
      if (!replaced) list.push(record);
      store.ratings[id] = list;
      var ratedCountAfter = localRatedWorkIds(findEdition(state.editionSlug)).length;
      var achievementDefinition = null;
      var achievementUnlockedNow = false;
      if (state.editionSlug === RATING_PROGRESS_EDITION && ratedCountAfter > ratedCountBefore) {
        achievementDefinition = ratingAchievementDefinitions(findEdition(state.editionSlug).works.length).find(function (item) {
          return item.threshold > ratedCountBefore && item.threshold <= ratedCountAfter;
        }) || null;
        if (achievementDefinition) {
          var achievementId = state.editionSlug + "::" + user.qq + "::" + achievementDefinition.key;
          if (!store.ratingAchievements[achievementId]) {
            var unlockedAt = new Date().toISOString();
            store.ratingAchievements[achievementId] = {
              unlockedAt: unlockedAt,
              notifiedAt: unlockedAt,
            };
            achievementUnlockedNow = true;
          }
        }
      }
      persist();
      panel.parentNode.replaceChild(renderScorePanel(id), panel);
      renderToc();
      if (achievementUnlockedNow) showRatingAchievementNotice(state.editionSlug, achievementDefinition);
      else notifyWitch("rating-success");
    });
    actions.appendChild(submit);
    actions.appendChild(hint);
    wrap.appendChild(actions);
    return wrap;
  }

  /* ---------- 评论 ---------- */

  function renderCommentPanel(id) {
    var panel = el("section", "panel");
    panel.id = "comments-panel";
    var list = commentsOf(id);
    var judgeComments = [];
    var normalComments = [];
    list.forEach(function (comment) {
      if (comment.judge) judgeComments.push(comment);
      else normalComments.push(comment);
    });

    panel.appendChild(
      el("h2", "panel-title", "评论" + (list.length ? " " + list.length : "")),
    );

    if (showJudgeBox() && judgeComments.length) {
      var judgeBox = el("div", "judge-box");
      judgeBox.appendChild(el("div", "judge-box-title", "评委评价"));
      judgeComments.filter(function (comment) {
        return !comment.rootId;
      }).forEach(function (comment) {
        judgeBox.appendChild(renderCommentItem(comment, id, panel, true));
      });
      panel.appendChild(judgeBox);
    }

    if (canInteract()) {
      panel.appendChild(renderCommentForm(id, panel));
    } else {
      panel.appendChild(el("p", "comment-empty", "访客不可评论，请登录调查员账号。"));
    }

    var showList =
      showJudgeBox() && judgeComments.length
        ? normalComments
        : judgeComments.concat(normalComments);
    var rootComments = showList.filter(function (comment) {
      return !comment.rootId;
    });

    if (!rootComments.length && !(showJudgeBox() && judgeComments.length)) {
      panel.appendChild(el("p", "comment-empty", "还没有评论。"));
    } else if (rootComments.length) {
      var ul = el("ul", "comment-list");
      rootComments.forEach(function (comment) {
        ul.appendChild(renderCommentItem(comment, id, panel, false));
      });
      panel.appendChild(ul);
    }
    return panel;
  }

  function renderCommentItem(comment, id, panel, inJudgeBox, isReply) {
    var li = el(
      inJudgeBox ? "div" : isReply ? "article" : "li",
      inJudgeBox ? "judge-item" : isReply ? "comment-reply" : "comment-item",
    );
    var head = el("div", "comment-head");
    var author = comment.qq ? store.users[comment.qq] : null;
    var name = comment.anonymous
      ? "匿名"
      : comment.name || (author ? displayName(author) : "用户");
    if (comment.judge && !comment.anonymous) {
      name = (author ? displayName(author) : name) + "（评委）";
    }
    head.appendChild(el("span", "comment-name", name));
    head.appendChild(
      el("span", null, formatTime(comment.t) + (comment.editedAt ? "（已编辑）" : "")),
    );

    var user = currentUser();
    var canEdit = !comment.deleted && (isAdmin() || (user && comment.qq && comment.qq === user.qq));
    var bodyNode = el(
      "p",
      "comment-body" + (comment.deleted ? " comment-deleted" : ""),
      comment.deleted ? (isReply ? "该回复已删除。" : "该评论已删除。") : comment.body,
    );

    function afterCommentChange() {
      return loadCloudWorkBundle(id, true).then(function () {
        panel.parentNode.replaceChild(renderCommentPanel(id), panel);
      });
    }

    function startCommentEdit() {
      var box = el("div", "comment-edit");
      var area = el("textarea", "comment-input");
      area.value = comment.body;
      area.maxLength = BODY_MAX;
      var err = el("p", "auth-error");
      err.setAttribute("aria-live", "polite");
      var tools = el("div", "comment-edit-tools");
      var save = el("button", "btn btn-tiny", "保存");
      save.type = "button";
      var cancel = el("button", "btn-ghost btn-tiny", "取消");
      cancel.type = "button";
      tools.appendChild(save);
      tools.appendChild(cancel);
      box.appendChild(area);
      box.appendChild(tools);
      box.appendChild(err);
      li.replaceChild(box, bodyNode);
      fitCommentTextarea(area);
      area.focus();

      cancel.addEventListener("click", function () {
        li.replaceChild(bodyNode, box);
      });
      save.addEventListener("click", function () {
        var next = area.value.trim();
        if (!next) {
          err.textContent = "评论不能为空。";
          return;
        }
        if (next === comment.body) {
          li.replaceChild(bodyNode, box);
          return;
        }
        if (USE_CLOUD) {
          save.disabled = true;
          save.textContent = "保存中…";
          window.MythosAPI.call("updateComment", { id: comment.id, body: next })
            .then(afterCommentChange)
            .catch(function (e) {
              err.textContent = e.message || String(e);
              save.disabled = false;
              save.textContent = "保存";
            });
          return;
        }
        comment.body = next;
        comment.editedAt = new Date().toISOString();
        store.comments[id] = commentsOf(id).map(function (item) {
          return item.id === comment.id ? comment : item;
        });
        persist();
        panel.parentNode.replaceChild(renderCommentPanel(id), panel);
      });
    }

    if (canEdit) {
      var edit = el("button", "comment-delete", "编辑");
      edit.type = "button";
      edit.addEventListener("click", startCommentEdit);
      head.appendChild(edit);

      var del = el("button", "comment-delete", "删除");
      del.type = "button";
      del.addEventListener("click", function () {
        if (USE_CLOUD) {
          window.MythosAPI.call("deleteComment", { id: comment.id })
            .then(afterCommentChange)
            .catch(function (e) {
              alert(e.message || String(e));
            });
          return;
        }
        var hasReplies = !isReply && commentsOf(id).some(function (item) {
          return item.rootId === comment.id;
        });
        store.comments[id] = hasReplies
          ? commentsOf(id).map(function (item) {
              if (item.id !== comment.id) return item;
              return Object.assign({}, item, {
                body: "",
                deleted: true,
                deletedAt: new Date().toISOString(),
              });
            })
          : commentsOf(id).filter(function (item) {
              return item.id !== comment.id;
            });
        persist();
        panel.parentNode.replaceChild(renderCommentPanel(id), panel);
      });
      head.appendChild(del);
    }
    li.appendChild(head);
    li.appendChild(bodyNode);

    if (!isReply) {
      var replies = commentsOf(id).filter(function (item) {
        return item.rootId === comment.id;
      });
      var threadKey = id + "::" + comment.id;
      if (!comment.deleted && canInteract()) {
        var actions = el("div", "comment-actions");
        var replyButton = el("button", "comment-reply-action", "回复");
        replyButton.type = "button";
        replyButton.addEventListener("click", function () {
          activeReplyComposer = activeReplyComposer === threadKey ? "" : threadKey;
          panel.parentNode.replaceChild(renderCommentPanel(id), panel);
        });
        actions.appendChild(replyButton);
        li.appendChild(actions);
      }
      if (replies.length) {
        var thread = el("div", "comment-thread");
        var repliesList = el("div", "comment-replies");
        repliesList.appendChild(renderCommentItem(replies[0], id, panel, false, true));
        if (replies.length > 1) {
          var openRemainder = !!openReplyRemainders[threadKey];
          var remainder = el("div", "comment-reply-more");
          remainder.id = "comment-replies-" + comment.id + "-remaining";
          remainder.hidden = !openRemainder;
          replies.slice(1).forEach(function (reply) {
            remainder.appendChild(renderCommentItem(reply, id, panel, false, true));
          });
          var toggle = el(
            "button",
            "comment-thread-toggle",
            (openRemainder ? "收起" : "展开") + "其余 " + (replies.length - 1) + " 条回复",
          );
          toggle.type = "button";
          toggle.setAttribute("aria-expanded", openRemainder ? "true" : "false");
          toggle.setAttribute("aria-controls", remainder.id);
          toggle.addEventListener("click", function () {
            openReplyRemainders[threadKey] = !openReplyRemainders[threadKey];
            panel.parentNode.replaceChild(renderCommentPanel(id), panel);
          });
          repliesList.appendChild(toggle);
          repliesList.appendChild(remainder);
        }
        thread.appendChild(repliesList);
        li.appendChild(thread);
      }
      if (!comment.deleted && activeReplyComposer === threadKey && canInteract()) {
        li.appendChild(renderReplyForm(id, comment, panel));
      }
    }
    return li;
  }

  function renderReplyForm(id, rootComment, panel) {
    var form = el("form", "comment-form comment-reply-form");
    var rootAuthor = rootComment.anonymous
      ? "匿名"
      : rootComment.name || "用户";
    form.appendChild(el("p", "comment-replying-to", "回复主评论 · " + rootAuthor));
    var textarea = el("textarea", "comment-input");
    textarea.placeholder = "回复这条主评论…";
    textarea.maxLength = BODY_MAX;
    form.appendChild(textarea);
    fitCommentTextarea(textarea);

    var tools = el("div", "comment-tools");
    var anonWrap = el("label", "checkbox");
    var anon = document.createElement("input");
    anon.type = "checkbox";
    anonWrap.appendChild(anon);
    anonWrap.appendChild(el("span", null, "匿名"));
    tools.appendChild(anonWrap);
    var counter = el("span", "counter", "0/" + BODY_MAX);
    tools.appendChild(counter);
    var cancel = el("button", "btn-ghost btn-tiny", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", function () {
      activeReplyComposer = "";
      panel.parentNode.replaceChild(renderCommentPanel(id), panel);
    });
    tools.appendChild(cancel);
    var submit = el("button", "btn btn-tiny", "回复");
    submit.type = "submit";
    submit.disabled = true;
    tools.appendChild(submit);
    textarea.addEventListener("input", function () {
      counter.textContent = textarea.value.length + "/" + BODY_MAX;
      submit.disabled = !textarea.value.trim();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canInteract()) return;
      var body = textarea.value.trim();
      if (!body) return;
      var user = currentUser();
      if (USE_CLOUD) {
        var commentSubmitted = false;
        submit.disabled = true;
        window.MythosAPI.call("addComment", {
          workId: id,
          replyToId: rootComment.id,
          body: body,
          anonymous: !!anon.checked,
        })
          .then(function () {
            commentSubmitted = true;
            activeReplyComposer = "";
            notifyWitch("comment-success");
            return loadCloudWorkBundle(id, true);
          })
          .then(function () {
            panel.parentNode.replaceChild(renderCommentPanel(id), panel);
          })
          .catch(function (e) {
            alert(e.message || String(e));
            submit.disabled = false;
            if (!commentSubmitted) notifyWitch("comment-failure");
          });
        return;
      }
      var list = commentsOf(id).slice();
      list.push({
        id: newId(),
        workId: id,
        rootId: rootComment.id,
        qq: user.qq,
        name: displayName(user),
        anonymous: !!anon.checked,
        judge: false,
        body: body.slice(0, BODY_MAX),
        t: new Date().toISOString(),
      });
      store.comments[id] = list;
      activeReplyComposer = "";
      persist();
      panel.parentNode.replaceChild(renderCommentPanel(id), panel);
      notifyWitch("comment-success");
    });

    form.appendChild(tools);
    return form;
  }

  function renderCommentForm(id, panel) {
    var form = el("form", "comment-form");
    var asJudge = isAdmin() && isJudgePhase();
    var textarea = el("textarea", "comment-input");
    textarea.placeholder = asJudge
      ? "投票统计期：以评委身份发表（将置顶显示）…"
      : "读完这篇，说点什么…";
    textarea.maxLength = BODY_MAX;
    form.appendChild(textarea);
    fitCommentTextarea(textarea);

    if (asJudge) {
      form.appendChild(
        el(
          "p",
          "rate-hint",
          "当前为投票统计期，管理员评论将记为评委评价并置顶。其他阶段的管理评论为普通评论。",
        ),
      );
    }

    var tools = el("div", "comment-tools");
    var anonWrap = el("label", "checkbox");
    var anon = document.createElement("input");
    anon.type = "checkbox";
    anon.checked = false;
    anonWrap.appendChild(anon);
    anonWrap.appendChild(el("span", null, "匿名"));
    tools.appendChild(anonWrap);

    var nickHint = el(
      "span",
      "rate-hint",
      "将显示为：" + displayName(currentUser()) + (asJudge ? "（评委）" : ""),
    );
    tools.appendChild(nickHint);
    anon.addEventListener("change", function () {
      nickHint.textContent = anon.checked
        ? "将显示为：匿名"
        : "将显示为：" +
          displayName(currentUser()) +
          (asJudge ? "（评委）" : "");
    });

    var counter = el("span", "counter", "0/" + BODY_MAX);
    tools.appendChild(counter);
    var submit = el("button", "btn", asJudge ? "发表评委评价" : "发表");
    submit.type = "submit";
    submit.disabled = true;
    tools.appendChild(submit);

    textarea.addEventListener("input", function () {
      counter.textContent = textarea.value.length + "/" + BODY_MAX;
      submit.disabled = !textarea.value.trim();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!canInteract()) return;
      var body = textarea.value.trim();
      if (!body) return;
      var user = currentUser();
      if (USE_CLOUD) {
        var commentSubmitted = false;
        submit.disabled = true;
        window.MythosAPI.call("addComment", {
          workId: id,
          body: body,
          anonymous: !!anon.checked,
        })
          .then(function () {
            commentSubmitted = true;
            notifyWitch("comment-success");
            return loadCloudWorkBundle(id, true);
          })
          .then(function () {
            panel.parentNode.replaceChild(renderCommentPanel(id), panel);
          })
          .catch(function (e) {
            alert(e.message || String(e));
            submit.disabled = false;
            if (!commentSubmitted) notifyWitch("comment-failure");
          });
        return;
      }
      var list = commentsOf(id).slice();
      var judge = isAdmin() && isJudgePhase() && !anon.checked;
      list.push({
        id: newId(),
        qq: user.qq,
        name: displayName(user),
        anonymous: !!anon.checked,
        judge: judge,
        body: body.slice(0, BODY_MAX),
        t: new Date().toISOString(),
      });
      store.comments[id] = list;
      persist();
      panel.parentNode.replaceChild(renderCommentPanel(id), panel);
      notifyWitch("comment-success");
    });

    form.appendChild(tools);
    return form;
  }

  /* ---------- 公示 / 排名 / 饼图 ---------- */

  function conicGradient(bins) {
    var total = bins.reduce(function (a, b) {
      return a + b;
    }, 0);
    if (!total) return "conic-gradient(#e0dcd4 0 100%)";
    var parts = [];
    var acc = 0;
    bins.forEach(function (count, index) {
      if (!count) return;
      var start = (acc / total) * 100;
      acc += count;
      var end = (acc / total) * 100;
      parts.push(PIE_COLORS[index] + " " + start + "% " + end + "%");
    });
    return "conic-gradient(" + parts.join(", ") + ")";
  }

  function historicalResultsOf(edition) {
    return edition && edition.results && Array.isArray(edition.results.rankings)
      ? edition.results
      : null;
  }

  function historicalReviewsOf(edition) {
    return edition && edition.reviews && Array.isArray(edition.reviews.reviews)
      ? edition.reviews.reviews.filter(function (review) { return review && review.body; })
      : [];
  }

  function reviewsForHistoricalWork(edition, work) {
    return historicalReviewsOf(edition).filter(function (review) {
      return review.workSlug === work.slug;
    });
  }

  function appendHistoricalReviewText(parent, body) {
    String(body || "")
      .split(/\n\s*\n/)
      .map(function (paragraph) { return paragraph.trim(); })
      .filter(Boolean)
      .forEach(function (paragraph) {
        parent.appendChild(el("p", null, paragraph));
      });
  }

  function renderHistoricalReview(review, index) {
    var item = el("div", "historical-review");
    var reviewerLabel = review.reviewer === "评委组" && index != null
      ? "评委组评语 " + (index + 1)
      : (review.reviewer || "评委组评语");
    item.appendChild(el("h4", "historical-review-by", reviewerLabel));
    var body = el("div", "historical-review-body");
    appendHistoricalReviewText(body, review.body);
    item.appendChild(body);
    return item;
  }

  function renderHistoricalWorkReviews(edition, work) {
    var reviews = reviewsForHistoricalWork(edition, work);
    if (!reviews.length) return null;
    var panel = el("section", "panel historical-work-reviews");
    panel.appendChild(el("h2", "panel-title", "评委评语"));
    panel.appendChild(el("p", "rate-hint", "据当届评语整理并校对。"));
    reviews.forEach(function (review, index) { panel.appendChild(renderHistoricalReview(review, index)); });
    return panel;
  }

  function renderHistoricalResults(edition, publication) {
    var rankings = publication.rankings || [];
    var reviews = historicalReviewsOf(edition);
    var worksBySlug = {};
    (edition.works || []).forEach(function (work) { worksBySlug[work.slug] = work; });
    var sheet = el("div", "sheet results-sheet historical-results-sheet");
    var head = el("header", "results-head");
    var main = el("div", "results-head-main");
    main.appendChild(el("p", "results-kicker", "幻梦境档案馆 · " + edition.year));
    main.appendChild(el("h1", "results-title", "结果公报"));
    main.appendChild(el("p", "results-edition", edition.shortName));
    head.appendChild(main);
    var aside = el("div", "results-head-aside");
    aside.appendChild(el("div", "results-status-mark is-official", "正式公示"));
    head.appendChild(aside);
    sheet.appendChild(head);
    sheet.appendChild(el("p", "intro-text results-intro", "按当届最终结果整理。名次和奖项保留原公示口径。"));

    var summary = el("dl", "results-summary");
    [
      ["排名作品", rankings.length + " 篇"],
      ["获奖作品", rankings.filter(function (row) { return !!row.award; }).length + " 篇"],
      ["已校对评语", reviews.length + " 条"],
    ].forEach(function (pair) {
      var item = el("div", "results-summary-item");
      item.appendChild(el("dt", null, pair[0]));
      item.appendChild(el("dd", null, pair[1]));
      summary.appendChild(item);
    });
    sheet.appendChild(summary);

    sheet.appendChild(el("h2", "panel-title results-rank-title", "最终排名"));
    sheet.appendChild(el("p", "historical-scroll-hint", "左右滑动排名表，可查看分数和奖项。"));
    var tableWrap = el("div", "historical-rank-scroll");
    var table = el("table", "rank-table historical-rank-table");
    var headRow = el("tr");
    var dimensionLabels = rankings.length && Array.isArray(rankings[0].dimensions)
      ? rankings[0].dimensions.map(function (dim) { return dim.label; })
      : [];
    ["名次", "作品", "作者"].concat(dimensionLabels, ["综合", "奖项"]).forEach(function (label) {
      headRow.appendChild(el("th", null, label));
    });
    var thead = el("thead");
    thead.appendChild(headRow);
    table.appendChild(thead);
    var tbody = el("tbody");
    rankings.forEach(function (row) {
      var work = row.workSlug && worksBySlug[row.workSlug];
      var tr = el("tr", "rank-table-row" + (row.rank <= 3 ? " rank-table-row-top rank-table-row-top-" + row.rank : ""));
      tr.appendChild(el("td", "rank-cell", String(row.rank)));
      var titleCell = el("td", "rank-title-cell");
      if (work) {
        var titleButton = el("button", "edition-index-title historical-rank-title", row.title);
        titleButton.type = "button";
        titleButton.addEventListener("click", function () {
          location.hash = "#/" + edition.slug + "/" + encodeURIComponent(work.slug);
        });
        titleCell.appendChild(titleButton);
      } else {
        titleCell.appendChild(el("span", "historical-unlinked-title", row.title));
      }
      tr.appendChild(titleCell);
      tr.appendChild(el("td", "rank-author-cell", row.author || "未见署名"));
      dimensionLabels.forEach(function (label) {
        var dim = (row.dimensions || []).filter(function (item) { return item.label === label; })[0];
        tr.appendChild(el("td", "rank-score-cell", dim && dim.average != null && Number.isFinite(Number(dim.average)) ? Number(dim.average).toFixed(2) : "—"));
      });
      tr.appendChild(el("td", "rank-score-cell", row.overall != null && Number.isFinite(Number(row.overall)) ? Number(row.overall).toFixed(2) : "—"));
      tr.appendChild(el("td", "historical-award-cell", row.award || "—"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    sheet.appendChild(tableWrap);

    if (reviews.length) {
      sheet.appendChild(el("h2", "panel-title historical-reviews-title", "评委评语"));
      var groups = [];
      reviews.forEach(function (review) {
        var key = review.workSlug || review.workTitle || review.award || "";
        var group = groups.filter(function (entry) { return entry.key === key; })[0];
        if (!group) {
          var linkedWork = review.workSlug && worksBySlug[review.workSlug];
          group = { key: key, title: linkedWork ? linkedWork.title : (review.workTitle || review.award || "评语"), workSlug: review.workSlug, reviews: [] };
          groups.push(group);
        }
        group.reviews.push(review);
      });
      var reviewList = el("div", "historical-review-list");
      groups.forEach(function (group) {
        var details = el("details", "historical-review-group");
        details.appendChild(el("summary", null, group.title + " · " + group.reviews.length + " 条评语"));
        if (group.workSlug && worksBySlug[group.workSlug]) {
          var workButton = el("button", "btn-ghost historical-review-work-link", "阅读作品");
          workButton.type = "button";
          workButton.addEventListener("click", function () {
            location.hash = "#/" + edition.slug + "/" + encodeURIComponent(group.workSlug);
          });
          details.appendChild(workButton);
        }
        group.reviews.forEach(function (review, index) { details.appendChild(renderHistoricalReview(review, index)); });
        reviewList.appendChild(details);
      });
      sheet.appendChild(reviewList);
    }
    refs.content.appendChild(sheet);
    window.scrollTo(0, 0);
  }

  function renderResults(edition) {
    stopReadingTracking();
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    hideHud();
    clear(refs.content);
    var historicalResults = historicalResultsOf(edition);
    if (historicalResults) {
      renderHistoricalResults(edition, historicalResults);
      return;
    }
    if (isArchivedEdition(edition)) {
      var pending = el("div", "sheet results-sheet");
      pending.appendChild(el("h1", "results-title", edition.shortName + " · 公示待整理"));
      pending.appendChild(el("p", "intro-text", "本届尚无可核对的正式结果。"));
      refs.content.appendChild(pending);
      return;
    }
    if (USE_CLOUD && !cloudInsightsLoaded[edition.slug]) {
      refs.content.appendChild(el("div", "sheet", "正在加载本届公开数据…"));
      loadCloudEditionInsights(edition.slug)
        .then(function () { renderResults(edition); })
        .catch(function () {
          cloudInsights[edition.slug] = { rankingsAvailable: false, heat: [], leaderboard: [] };
          cloudInsightsLoaded[edition.slug] = true;
          renderResults(edition);
        });
      return;
    }
    if (USE_CLOUD && isPublicPhase(edition.slug) && !cloudAwardsLoaded[edition.slug]) {
      refs.content.appendChild(el("div", "sheet", "正在加载本届公示内容…"));
      loadCloudEditionAwards(edition.slug)
        .then(function () { renderResults(edition); })
        .catch(function () {
          cloudAwards[edition.slug] = { published: false, authorReveals: {}, specialAwards: [] };
          cloudAwardsLoaded[edition.slug] = true;
          renderResults(edition);
        });
      return;
    }
    var awardResult = editionAwardsData(edition.slug);
    var sheet = el("div", "sheet results-sheet");
    var officialResults = isPublicPhase(edition.slug) && awardResult && awardResult.published &&
      (!USE_CLOUD || !!awardResult.publication);
    var resultsHead = el("header", "results-head");
    var resultsHeadMain = el("div", "results-head-main");
    resultsHeadMain.appendChild(
      el(
        "p",
        "results-kicker",
        "幻梦境档案馆 · " + (volumeInfo(edition).chinese ? "第" + volumeInfo(edition).chinese + "卷" : edition.year + " 卷"),
      ),
    );
    resultsHeadMain.appendChild(
      el("h1", "results-title", officialResults ? "结果公报" : "投票统计"),
    );
    resultsHeadMain.appendChild(el("p", "results-edition", edition.shortName));
    resultsHead.appendChild(resultsHeadMain);
    var resultsHeadAside = el("div", "results-head-aside");
    resultsHeadAside.appendChild(renderPhaseChip(edition.slug));
    var resultsMark = el(
      "div",
      "results-status-mark" + (officialResults ? " is-official" : ""),
      officialResults ? "正式公示" : "实时预览",
    );
    resultsMark.setAttribute(
      "aria-label",
      officialResults ? "正式公示" : "当前为实时数据预览",
    );
    resultsHeadAside.appendChild(resultsMark);
    resultsHead.appendChild(resultsHeadAside);
    sheet.appendChild(resultsHead);
    var resultIntro = officialResults
      ? "结果公示。下列为综合均分排名与分数分布。"
      : "本届尚未发布固定结果。管理员可在管理面板双人确认推进阶段；下列为当前实时数据预览。";
    if (awardResult && awardResult.published && officialResults) {
      resultIntro += awardResult.authorRevealRankLimit
        ? "前 " + awardResult.authorRevealRankLimit + " 名及特别奖作品公开作者，其余作品匿名。"
        : "特别奖作品公开作者，其余作品匿名。";
    }
    sheet.appendChild(
      el("p", "intro-text results-intro", resultIntro),
    );
    var resultSummary = el("dl", "results-summary");
    function addResultSummary(label, value) {
      var item = el("div", "results-summary-item");
      item.appendChild(el("dt", null, label));
      item.appendChild(el("dd", null, value));
      resultSummary.appendChild(item);
    }
    addResultSummary("收录", edition.works.length + " 篇");
    addResultSummary(
      "当前阶段",
      isArchivedEdition(edition) ? "已封存" : phaseLabel(phaseOf(edition.slug)),
    );
    addResultSummary("页面状态", officialResults ? "正式公示" : "实时预览");
    sheet.appendChild(resultSummary);

    var insight = cloudInsights[edition.slug] || null;
    function appendRankCell(tr, rankValue) {
      var rankNumber = Number(rankValue);
      var rankCell = el("td", "rank-cell");
      rankCell.appendChild(el("span", "rank-number", String(rankValue)));
      if (officialResults && rankNumber >= 1 && rankNumber <= 3) {
        var rankMarker = svgUse("star4", "rank-marker");
        rankMarker.setAttribute("aria-hidden", "true");
        rankCell.appendChild(rankMarker);
      }
      tr.appendChild(rankCell);
    }
    function appendAwardMark(target, workIdValue) {
      if (
        !officialResults ||
        !awardResult ||
        !Array.isArray(awardResult.awardedWorkIds) ||
        awardResult.awardedWorkIds.indexOf(workIdValue) === -1
      ) {
        return;
      }
      var mark = el("span", "result-award-mark", "获奖");
      mark.setAttribute("role", "img");
      mark.setAttribute("aria-label", "获奖作品");
      target.appendChild(mark);
    }
    function appendRevealAuthorCell(tr, workIdValue) {
      var name = (awardResult && awardResult.authorReveals || {})[workIdValue] || "匿名";
      var cell = el("td", "rank-author-cell");
      cell.appendChild(el("span", "rank-author-name", name));
      if (officialResults && name !== "匿名") {
        var mark = el("span", "author-release-mark", "解封");
        mark.setAttribute("aria-label", "作者身份已解封");
        cell.appendChild(mark);
      }
      tr.appendChild(cell);
    }
    function renderWorkDistribution(work, rank, average, ratingCount, distributions) {
      if (!distributions) return null;
      var detail = el("details", "result-work-distribution");
      var summary = el("summary", "result-work-distribution-summary");
      summary.appendChild(
        el(
          "span",
          "result-work-distribution-title",
          String(rank).padStart(2, "0") + " · " + work.title,
        ),
      );
      summary.appendChild(
        el(
          "span",
          "result-work-distribution-meta",
          "综合 " + Number(average).toFixed(2) + " · " + ratingCount + " 人",
        ),
      );
      detail.appendChild(summary);
      DIMENSIONS.forEach(function (dim) {
        var bins = distributions[dim.key];
        if (Array.isArray(bins) && bins.length === 5) {
          detail.appendChild(renderDistributionBlock(dim.label, bins));
        }
      });
      return detail;
    }
    if (!isAdmin() && USE_CLOUD) {
      if (!insight || !insight.rankingsAvailable) {
        sheet.appendChild(el("p", "intro-text", "本届排名将在统计阶段或结果公示阶段开放。"));
      } else {
        var publicTable = el("table", "rank-table");
        var publicHead = el("thead");
        var publicHeadRow = el("tr");
        var publicColumns = ["名次", "编号", "标题"];
        if (awardResult && awardResult.published) publicColumns.push("作者");
        publicColumns.push("综合均分", "评分人数");
        publicColumns.forEach(function (label) { publicHeadRow.appendChild(el("th", null, label)); });
        publicHead.appendChild(publicHeadRow); publicTable.appendChild(publicHead);
        var publicBody = el("tbody");
        (insight.leaderboard || []).forEach(function (row) {
          var work = edition.works.filter(function (item) { return workId(edition.slug, item.slug) === row.workId; })[0];
          if (!work) return;
          var rankNumber = Number(row.rank);
          var tr = el(
            "tr",
            officialResults && rankNumber >= 1 && rankNumber <= 3
              ? "rank-table-row rank-table-row-top rank-table-row-top-" + rankNumber
              : "rank-table-row",
          );
          tr.dataset.workId = row.workId;
          appendRankCell(tr, row.rank);
          tr.appendChild(el("td", "rank-work-number", String(work.no).padStart(2, "0")));
          var titleCell = el("td", "rank-title-cell");
          var titleContent = el("div", "rank-title-content");
          var titleLink = el("button", "linkish rank-title-link", work.title);
          titleLink.type = "button";
          titleLink.addEventListener("click", function () {
            location.hash = "#/" + edition.slug + "/" + encodeURIComponent(work.slug);
          });
          titleContent.appendChild(titleLink);
          titleContent.appendChild(el("span", "rank-title-leader"));
          appendAwardMark(titleContent, row.workId);
          titleCell.appendChild(titleContent);
          tr.appendChild(titleCell);
          if (awardResult && awardResult.published) appendRevealAuthorCell(tr, row.workId);
          tr.appendChild(el("td", "rank-score-cell", Number(row.totalAvg).toFixed(2)));
          tr.appendChild(el("td", "rank-count-cell", String(row.ratingCount)));
          publicBody.appendChild(tr);
        });
        publicTable.appendChild(publicBody);
        sheet.appendChild(el("h2", "panel-title results-rank-title", "综合均分排名"));
        sheet.appendChild(publicTable);
      }
      renderSpecialAwardsSection(sheet, edition, awardResult);
      if (insight && insight.distributions) {
        var publicDistributionRows = el("div", "result-distribution-list");
        (insight.leaderboard || []).forEach(function (row) {
          var work = edition.works.filter(function (item) {
            return workId(edition.slug, item.slug) === row.workId;
          })[0];
          var data = insight.distributions[row.workId];
          var details = work && renderWorkDistribution(
            work,
            row.rank,
            row.totalAvg,
            row.ratingCount,
            data,
          );
          if (details) publicDistributionRows.appendChild(details);
        });
        if (publicDistributionRows.childElementCount) {
          sheet.appendChild(el("h2", "panel-title results-distribution-title", "作品评分分布"));
          sheet.appendChild(publicDistributionRows);
        }
      }
      refs.content.appendChild(sheet);
      window.scrollTo(0, 0);
      return;
    }

    var ranked = edition.works
      .map(function (work) {
        var id = workId(edition.slug, work.slug);
        var stats = averages(id);
        return {
          work: work,
          id: id,
          stats: stats,
          overall: stats.overall == null ? -1 : stats.overall,
        };
      })
      .sort(function (a, b) {
        if (b.overall !== a.overall) return b.overall - a.overall;
        return a.work.no - b.work.no;
      });
    var canonicalRanks = {};
    if (insight && insight.rankingsAvailable) {
      (insight.leaderboard || []).forEach(function (row) {
        canonicalRanks[row.workId] = Number(row.rank);
      });
      ranked.sort(function (a, b) {
        var aRank = canonicalRanks[a.id] || Infinity;
        var bRank = canonicalRanks[b.id] || Infinity;
        return aRank - bRank || (a.work.no - b.work.no);
      });
    }

    var table = el("table", "rank-table");
    var thead = el("thead");
    var hr = el("tr");
    var rankCols = ["名次", "编号", "标题", "传录", "档案", "综合"];
    if (awardResult && awardResult.published) rankCols.splice(3, 0, "作者");
    if (isAdmin()) rankCols.push("人数");
    rankCols.forEach(function (h) {
      hr.appendChild(el("th", null, h));
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = el("tbody");
    ranked.forEach(function (row, index) {
      var shownRank = String(
        canonicalRanks[row.id] || (insight && insight.rankingsAvailable ? "—" : index + 1),
      );
      var rankNumber = Number(shownRank);
      var tr = el(
        "tr",
        officialResults && rankNumber >= 1 && rankNumber <= 3
          ? "rank-table-row rank-table-row-top rank-table-row-top-" + rankNumber
          : "rank-table-row",
      );
      tr.dataset.workId = row.id;
      appendRankCell(tr, shownRank);
      tr.appendChild(el("td", "rank-work-number", String(row.work.no).padStart(2, "0")));
      var titleCell = el("td", "rank-title-cell");
      var titleContent = el("div", "rank-title-content");
      var link = el("button", "linkish", row.work.title);
      link.classList.add("rank-title-link");
      link.type = "button";
      link.addEventListener("click", function () {
        location.hash =
          "#/" + edition.slug + "/" + encodeURIComponent(row.work.slug);
      });
      titleContent.appendChild(link);
      titleContent.appendChild(el("span", "rank-title-leader"));
      appendAwardMark(titleContent, row.id);
      titleCell.appendChild(titleContent);
      tr.appendChild(titleCell);
      if (awardResult && awardResult.published) {
        appendRevealAuthorCell(tr, row.id);
      }
      DIMENSIONS.forEach(function (dim) {
        var v = row.stats[dim.key];
        tr.appendChild(el("td", "rank-score-cell", v == null ? "—" : v.toFixed(2)));
      });
      if (isAdmin()) tr.appendChild(el("td", "rank-count-cell", String(row.stats.count)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    sheet.appendChild(el("h2", "panel-title results-rank-title", "综合均分排名"));
    sheet.appendChild(table);
    renderSpecialAwardsSection(sheet, edition, awardResult);

    var distributionList = el("div", "result-distribution-list");
    ranked.forEach(function (row, index) {
      if (row.stats.count <= 0) return;
      var distributions = {};
      DIMENSIONS.forEach(function (dim) {
        distributions[dim.key] = scoreDistribution(row.id, dim.key);
      });
      var details = renderWorkDistribution(
        row.work,
        canonicalRanks[row.id] || index + 1,
        row.stats.overall,
        row.stats.count,
        distributions,
      );
      if (details) distributionList.appendChild(details);
    });
    if (distributionList.childElementCount) {
      sheet.appendChild(el("h2", "panel-title results-distribution-title", "作品评分分布"));
      sheet.appendChild(distributionList);
    }

    refs.content.appendChild(sheet);
    window.scrollTo(0, 0);
  }

  function renderSpecialAwardsSection(parent, edition, result) {
    if (!result || !result.published || !Array.isArray(result.specialAwards)) return;
    var awards = result.specialAwards.filter(function (award) {
      return award && award.name && award.workId;
    });
    if (!awards.length) return;
    parent.appendChild(el("h2", "panel-title special-awards-title", "评委特别奖"));
    parent.appendChild(
      el("p", "rate-hint special-awards-intro", "由评委提名的独立奖项 · 作品与评语于本届公示阶段开放"),
    );
    var list = el("div", "special-awards-list");
    awards.forEach(function (award) {
      var work = (edition.works || []).filter(function (item) {
        return workId(edition.slug, item.slug) === award.workId;
      })[0];
      if (!work) return;
      var card = el("article", "special-award-item");
      card.appendChild(el("p", "special-award-name", award.name));
      var workLink = el("button", "linkish special-award-work", work.title);
      workLink.type = "button";
      workLink.addEventListener("click", function () {
        location.hash = "#/" + edition.slug + "/" + encodeURIComponent(work.slug);
      });
      card.appendChild(workLink);
      var author = (result.authorReveals || {})[award.workId] || "匿名";
      card.appendChild(el("p", "special-award-author", author));
      if (award.excerpt) {
        var excerpt = el("blockquote", "special-award-excerpt");
        excerpt.textContent = String(award.excerpt);
        card.appendChild(excerpt);
      }
      if (award.review) {
        var details = el("details", "special-award-review");
        details.appendChild(el("summary", null, "阅读评委评语"));
        var review = el("div", "special-award-review-body");
        String(award.review)
          .split(/\n\s*\n/)
          .map(function (paragraph) { return paragraph.trim(); })
          .filter(Boolean)
          .forEach(function (paragraph) {
            review.appendChild(el("p", null, paragraph));
          });
        details.appendChild(review);
        card.appendChild(details);
      } else {
        card.appendChild(el("p", "special-award-review-pending", "评委评语整理中。"));
      }
      list.appendChild(card);
    });
    if (list.childElementCount) parent.appendChild(list);
  }

  function renderPieBlock(label, bins) {
    var wrap = el("div", "pie-block");
    wrap.appendChild(el("div", "pie-label", label));
    var pie = el("div", "pie");
    pie.style.background = conicGradient(bins);
    wrap.appendChild(pie);
    var legend = el("ul", "pie-legend");
    var total = bins.reduce(function (a, b) {
      return a + b;
    }, 0);
    bins.forEach(function (count, index) {
      var li = el("li");
      var swatch = el("span", "pie-swatch");
      swatch.style.background = PIE_COLORS[index];
      li.appendChild(swatch);
      var pct = total ? Math.round((count / total) * 100) : 0;
      li.appendChild(
        document.createTextNode(
          isAdmin()
            ? index + 1 + " 分 · " + count + " 票（" + pct + "%）"
            : index + 1 + " 分（" + pct + "%）",
        ),
      );
      legend.appendChild(li);
    });
    wrap.appendChild(legend);
    return wrap;
  }

  function renderDistributionBlock(label, bins) {
    var block = el("div", "distribution-block");
    var total = bins.reduce(function (sum, count) {
      return sum + count;
    }, 0);
    var head = el("div", "distribution-head");
    head.appendChild(el("span", "distribution-label", label));
    head.appendChild(el("span", "distribution-total", total + " 票"));
    block.appendChild(head);

    var bar = el("div", "distribution-bar");
    bar.setAttribute("role", "img");
    bar.setAttribute(
      "aria-label",
      label + "评分分布：" +
        bins.map(function (count, index) { return index + 1 + "分 " + count + "票"; }).join("，"),
    );
    bins.forEach(function (count, index) {
      var segment = el("span", "distribution-segment");
      segment.style.width = total ? (count / total) * 100 + "%" : "0%";
      segment.style.backgroundColor = PIE_COLORS[index];
      segment.setAttribute("aria-hidden", "true");
      bar.appendChild(segment);
    });
    block.appendChild(bar);

    var legend = el("div", "distribution-legend");
    bins.forEach(function (count, index) {
      var item = el("div", "distribution-item");
      var swatch = el("span", "distribution-swatch");
      swatch.style.backgroundColor = PIE_COLORS[index];
      swatch.setAttribute("aria-hidden", "true");
      item.appendChild(swatch);
      item.appendChild(el("span", "distribution-score", index + 1 + " 分"));
      var percent = total ? Math.round((count / total) * 100) : 0;
      item.appendChild(
        el(
          "span",
          "distribution-value",
          isAdmin() ? count + " 票 · " + percent + "%" : percent + "%",
        ),
      );
      legend.appendChild(item);
    });
    block.appendChild(legend);
    return block;
  }

  /* ---------- 作者的话 ---------- */

  function renderAuthorNotePanel(id, work) {
    var note = authorNoteOf(id);
    var text = note && note.body ? note.body : "";
    var canEdit = isWorkAuthor(id, work);
    var boundQQ = effectiveAuthorQQ(id, work);

    if (!text && !canEdit) return null;

    var panel = el("section", "panel author-note-panel");
    panel.appendChild(el("h2", "panel-title", "作者的话"));

    if (text && !canEdit) {
      var body = el("div", "author-note-body");
      body.textContent = text;
      panel.appendChild(body);
      if (note && note.updatedAt) {
        panel.appendChild(
          el("p", "author-note-meta", "更新于 " + formatTime(note.updatedAt)),
        );
      }
      return panel;
    }

    if (!canEdit) return null;

    var hint = el(
      "p",
      "rate-hint",
      boundQQ
        ? "仅作者本人（QQ " + boundQQ + "）可编辑。内容显示在正文末尾、评分之前。"
        : "当前账号已识别为作者，可编辑本段。",
    );
    panel.appendChild(hint);

    var view = el("div", "author-note-view");
    if (text) {
      var shown = el("div", "author-note-body");
      shown.textContent = text;
      view.appendChild(shown);
      if (note && note.updatedAt) {
        view.appendChild(
          el("p", "author-note-meta", "更新于 " + formatTime(note.updatedAt)),
        );
      }
    } else {
      view.appendChild(el("p", "comment-empty", "尚未填写作者的话。"));
    }

    var editBtn = el("button", "btn-ghost", text ? "编辑作者的话" : "撰写作者的话");
    editBtn.type = "button";
    view.appendChild(editBtn);
    panel.appendChild(view);

    var editor = el("div", "author-note-editor");
    editor.hidden = true;
    var textarea = el("textarea", "comment-input author-note-input");
    textarea.maxLength = AUTHOR_NOTE_MAX;
    textarea.placeholder = "写给读者的话…（纯文本，最多 " + AUTHOR_NOTE_MAX + " 字）";
    textarea.value = text;
    var tools = el("div", "comment-tools");
    var counter = el("span", "counter", text.length + "/" + AUTHOR_NOTE_MAX);
    var save = el("button", "btn", "保存");
    save.type = "button";
    var cancel = el("button", "btn-ghost", "取消");
    cancel.type = "button";
    var clearBtn = el("button", "btn-ghost", "清空");
    clearBtn.type = "button";
    tools.appendChild(counter);
    tools.appendChild(save);
    tools.appendChild(cancel);
    tools.appendChild(clearBtn);
    editor.appendChild(textarea);
    editor.appendChild(tools);
    panel.appendChild(editor);

    function refreshCounter() {
      counter.textContent = textarea.value.length + "/" + AUTHOR_NOTE_MAX;
    }
    textarea.addEventListener("input", refreshCounter);

    editBtn.addEventListener("click", function () {
      view.hidden = true;
      editor.hidden = false;
      textarea.focus();
    });
    cancel.addEventListener("click", function () {
      textarea.value = text;
      refreshCounter();
      editor.hidden = true;
      view.hidden = false;
    });
    save.addEventListener("click", function () {
      if (!isWorkAuthor(id, work)) return;
      Promise.resolve(saveAuthorNote(id, textarea.value)).then(function () {
        var parent = panel.parentNode;
        if (!parent) return;
        var next = renderAuthorNotePanel(id, work);
        if (next) parent.replaceChild(next, panel);
        else parent.removeChild(panel);
      }).catch(function (e) {
        alert(e.message || String(e));
      });
    });
    clearBtn.addEventListener("click", function () {
      if (!isWorkAuthor(id, work)) return;
      if (!window.confirm("确定清空「作者的话」？")) return;
      Promise.resolve(saveAuthorNote(id, "")).then(function () {
        var parent = panel.parentNode;
        if (!parent) return;
        var next = renderAuthorNotePanel(id, work);
        if (next) parent.replaceChild(next, panel);
        else parent.removeChild(panel);
      }).catch(function (e) {
        alert(e.message || String(e));
      });
    });

    return panel;
  }

  /* ---------- 主区域 ---------- */

  function setSiteNavActive(view) {
    if (!refs.siteNav) return;
    var active =
      view === "home"
        ? "spotlight"
        : view === "edition" || view === "reader"
          ? "catalogue"
          : view === "results"
            ? "results"
            : "";
    refs.siteNav.querySelectorAll("[data-nav]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.nav === active);
    });
  }

  function setLayoutMode(view) {
    var homeLike = view === "home" || view === "edition";
    refs.layout.classList.toggle("home-active", homeLike);
    refs.layout.classList.toggle("reader-active", view === "reader" || view === "results");
    document.body.dataset.view = view;
    setSiteNavActive(view);
    if (homeLike) applySidebarCollapsed(true);
  }

  // 小女巫只消费当前站点状态，不维护第二套路由或作品数据副本。
  function getWitchContext() {
    var edition = findEdition(state.editionSlug) || editions[0] || null;
    var work = edition && state.workSlug ? findWork(edition, state.workSlug) : null;
    var pageType = state.view === "reader" ? "article" : state.view;
    return {
      pageType: pageType === "article" || pageType === "edition" || pageType === "results" || pageType === "home"
        ? pageType
        : "home",
      editionSlug: edition ? edition.slug : "",
      editionYear: edition ? edition.year : "",
      editionName: edition ? edition.shortName || edition.name || "" : "",
      workId: work && edition ? workId(edition.slug, work.slug) : null,
      workTitle: work ? work.title || null : null,
      phase: edition ? phaseOf(edition.slug) : null,
      isNightMode: document.documentElement.dataset.theme === "dark",
      sidebarCollapsed: !!(refs.layout && refs.layout.classList.contains("sidebar-collapsed")),
      isMobile: isMobileLayout(),
    };
  }

  function updateWitchRatingProgress(edition, progress) {
    if (!window.MythosWitch || !window.MythosWitch.setRatingProgress) return;
    if (
      !ratingProgressAvailable(edition) ||
      !progress ||
      progress.status !== "loaded" ||
      Number(progress.eligibleWorkCount) <= 0
    ) {
      if (!progress || progress.status !== "error") {
        window.MythosWitch.setRatingProgress(null);
      }
      return;
    }
    var total = Number(progress.eligibleWorkCount) || edition.works.length;
    var count = Math.min(Number(progress.ratedCount) || 0, total);
    var achievements = Array.isArray(progress.achievements) ? progress.achievements : [];
    var nextAchievement = progress.nextAchievement || achievements.find(function (item) { return !item.unlocked; }) || null;
    window.MythosWitch.setRatingProgress({
      status: "loaded",
      editionSlug: edition.slug,
      ratedCount: count,
      eligibleWorkCount: total,
      achievements: achievements,
      nextAchievement: nextAchievement,
      percent: ratingPercent(progress, total),
      complete: count >= total,
    });
  }

  function updateWitchContext() {
    if (window.MythosWitch && window.MythosWitch.update) {
      window.MythosWitch.update(getWitchContext());
    }
    var edition = findEdition(state.editionSlug) || editions[0] || null;
    var progress = edition && ratingProgressAvailable(edition)
      ? ratingProgressData(edition)
      : null;
    updateWitchRatingProgress(edition, progress);
  }

  function notifyWitch(eventName) {
    if (window.MythosWitch && window.MythosWitch.notify) {
      window.MythosWitch.notify(eventName);
    }
  }

  function whiteShipPrefersReducedMotion() {
    return !!(
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function pickWhiteShipDestination() {
    var featured = findEdition(WHITE_SHIP_EDITION_SLUG) || editions[0] || null;
    var featuredWorks = featured && Array.isArray(featured.works)
      ? featured.works.filter(Boolean)
      : [];
    var otherEditions = editions.filter(function (edition) {
      return (
        edition &&
        edition !== featured &&
        Array.isArray(edition.works) &&
        edition.works.some(Boolean)
      );
    });
    if (!featuredWorks.length && !otherEditions.length) return null;

    var roll = Math.floor(Math.random() * 100) + 1;
    var targetEdition;
    if (featuredWorks.length && (roll <= 50 || !otherEditions.length)) {
      targetEdition = featured;
    } else if (otherEditions.length) {
      targetEdition = otherEditions[
        Math.floor(Math.random() * otherEditions.length)
      ];
    } else {
      targetEdition = featured;
    }

    var works = targetEdition.works.filter(Boolean);
    if (
      works.length > 1 &&
      targetEdition.slug === state.editionSlug &&
      state.workSlug
    ) {
      var withoutCurrent = works.filter(function (work) {
        return work.slug !== state.workSlug;
      });
      if (withoutCurrent.length) works = withoutCurrent;
    }
    if (!works.length) return null;
    return {
      edition: targetEdition,
      work: works[Math.floor(Math.random() * works.length)],
      roll: roll,
    };
  }

  function travelByWhiteShip() {
    if (whiteShipBusy) return;
    if (!isLoggedIn()) {
      showAuthGate();
      return;
    }
    var destination = pickWhiteShipDestination();
    if (!destination) {
      showToast("白船暂时没有可抵达的档案。");
      return;
    }

    whiteShipBusy = true;
    var reduced = whiteShipPrefersReducedMotion();
    var rollLabel = String(destination.roll).padStart(2, "0");
    var message =
      "白船靠岸了。下一站是《" + destination.work.title + "》。";
    var combinedMessage = "1D100 = " + rollLabel + " · " + message;
    var desktopMotion = !reduced && !isMobileLayout();
    if (
      desktopMotion &&
      window.MythosWitch &&
      window.MythosWitch.startWhiteShipRoll
    ) {
      window.MythosWitch.startWhiteShipRoll(destination.roll, reduced);
    }
    if (desktopMotion) {
      window.setTimeout(function () {
        document.body.classList.add("is-white-ship-departing");
        if (
          window.MythosWitch &&
          window.MythosWitch.showWhiteShipDeparture
        ) {
          window.MythosWitch.showWhiteShipDeparture();
        } else if (window.MythosWitch && window.MythosWitch.setState) {
          window.MythosWitch.setState("departing");
        }
      }, WHITE_SHIP_DEPARTURE_START_MS);
    }
    var delay = reduced ? 0 : WHITE_SHIP_ROUTE_DELAY_MS;
    window.setTimeout(function () {
      location.hash =
        "#/" +
        destination.edition.slug +
        "/" +
        encodeURIComponent(destination.work.slug);
      window.setTimeout(function () {
        document.body.classList.remove("is-white-ship-departing");
        whiteShipBusy = false;
        if (window.MythosWitch && window.MythosWitch.finishWhiteShipRoll) {
          window.MythosWitch.finishWhiteShipRoll();
        }
        if (
          desktopMotion &&
          window.MythosWitch &&
          window.MythosWitch.speakText
        ) {
          window.MythosWitch.speakText(combinedMessage);
        } else {
          if (window.MythosWitch && window.MythosWitch.setState) {
            window.MythosWitch.setState("idle");
          }
          showToast(combinedMessage, WHITE_SHIP_MESSAGE_MS);
        }
      }, reduced ? 0 : 100);
    }, delay);
  }

  function openVisitorAccountModal() {
    var body = el("div", "modal-body");
    body.appendChild(el("p", "modal-meta", "当前以访客身份阅读，仅可查看正文。"));
    var logout = el("button", "btn", "退出访客并登录");
    logout.type = "button";
    logout.addEventListener("click", function () {
      function done() {
        store.session = null;
        clearCloudCaches();
        persist();
        closeModal();
        showAuthGate();
      }
      if (USE_CLOUD) {
        window.MythosAPI.logout().then(done).catch(done);
      } else {
        done();
      }
    });
    body.appendChild(logout);
    openModal("调查员入口", body);
  }

  function openGuideModal() {
    var edition = findEdition(state.editionSlug) || editions[0];
    var body = el("div", "modal-body");
    body.appendChild(
      el(
        "p",
        "modal-meta",
        "每篇作品都按「传录、档案、综合」三个维度参与评议。评分期只显示自己的评分，统计或公示阶段再开放相应的汇总数据。",
      ),
    );
    if (edition) {
      body.appendChild(
        el(
          "p",
          "modal-meta",
          edition.shortName + " 当前阶段：" + phaseLabel(phaseOf(edition.slug)) + "。访客可以阅读，登录调查员账号后才可评分、评论和收藏。",
        ),
      );
    }
    var close = el("button", "btn-ghost", "知道了");
    close.type = "button";
    close.addEventListener("click", closeModal);
    body.appendChild(close);
    openModal("评议说明", body);
  }

  function legacyCopyText(text) {
    return new Promise(function (resolve, reject) {
      var input = el("textarea");
      input.value = text;
      input.setAttribute("readonly", "true");
      input.style.position = "fixed";
      input.style.left = "-9999px";
      document.body.appendChild(input);
      input.select();
      var copied = false;
      try {
        copied = document.execCommand("copy");
      } catch (err) {
        copied = false;
      }
      document.body.removeChild(input);
      if (copied) resolve();
      else reject(new Error("当前浏览器不允许复制链接"));
    });
  }

  function copyText(text) {
    if (!(navigator.clipboard && window.isSecureContext)) {
      return legacyCopyText(text);
    }
    return new Promise(function (resolve, reject) {
      var settled = false;
      var fallback = function () {
        if (settled) return;
        settled = true;
        legacyCopyText(text).then(resolve, reject);
      };
      var timer = window.setTimeout(fallback, 700);
      navigator.clipboard.writeText(text).then(function () {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      }).catch(fallback);
    });
  }

  function shareWork(edition, work) {
    var url = new URL(shareCardUrl(edition, work));
    var id = workId(edition.slug, work.slug);
    var override = cloudContent[id];
    var excerpt = trimShareText(
      override ? excerptFromHtml(override.html) : work.excerpt,
      150,
    );
    var author = work.author || "未见署名";
    var message = [
      "幻梦境档案馆 · " + edition.shortName,
      "【" + displayWorkNo(work) + "】" + work.title,
      "作者：" + author,
      excerpt ? "首段：" + excerpt : "",
      "阅读链接：" + url.toString(),
    ].filter(Boolean).join("\n");

    var body = el("div", "modal-body share-modal-body");
    body.appendChild(
      el("p", "modal-meta", "下面这段可以直接发到群里；链接会打开这篇档案的短地址。"),
    );
    var textarea = el("textarea", "share-textarea");
    textarea.value = message;
    textarea.readOnly = true;
    textarea.rows = 9;
    textarea.setAttribute("aria-label", "分享文案");
    textarea.setAttribute("spellcheck", "false");
    body.appendChild(textarea);

    var actions = el("div", "share-actions");
    var copyButton = el("button", "btn", "复制分享文案");
    copyButton.type = "button";
    copyButton.addEventListener("click", function () {
      copyText(message).then(function () {
        showToast("分享文案已复制");
      }).catch(function (err) {
        showToast(err.message || "分享文案复制失败");
      });
    });
    actions.appendChild(copyButton);

    var copyLink = el("button", "btn-ghost", "只复制阅读链接");
    copyLink.type = "button";
    copyLink.addEventListener("click", function () {
      copyText(url.toString()).then(function () {
        showToast("阅读链接已复制");
      }).catch(function (err) {
        showToast(err.message || "链接复制失败");
      });
    });
    actions.appendChild(copyLink);

    if (typeof navigator.share === "function") {
      var systemShare = el("button", "btn-ghost", "系统分享");
      systemShare.type = "button";
      systemShare.addEventListener("click", function () {
        navigator.share({
          title: edition.year + " · " + displayWorkNo(work) + " " + work.title,
          text: message,
          url: url.toString(),
        }).then(function () {
          showToast("已打开系统分享");
        }).catch(function (err) {
          if (err && err.name !== "AbortError") {
            showToast(err.message || "系统分享不可用");
          }
        });
      });
      actions.appendChild(systemShare);
    }
    body.appendChild(actions);
    openModal("分享档案", body);
  }

  function shareCardUrl(edition, work) {
    var origin = String(window.ARCHIVE_PUBLIC_ORIGIN || "").replace(/\/+$/, "");
    var localPreview = window.location.protocol === "file:" ||
      /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i.test(window.location.hostname);
    if (!origin) origin = localPreview ? "https://dreamland.l.cd" : window.location.origin;
    var path = "/" + encodeURIComponent(edition.slug) +
      (work ? "/" + displayWorkNo(work) : "");
    return new URL(path, origin).toString();
  }

  function shareCardPalette(edition) {
    var rootStyle = window.getComputedStyle(document.documentElement);
    var probe = document.createElement("span");
    probe.dataset.vol = String(edition.year);
    probe.style.position = "fixed";
    probe.style.left = "-10000px";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    var volume = window.getComputedStyle(probe).getPropertyValue("--vol").trim();
    probe.remove();
    function cssValue(name, fallback) {
      return rootStyle.getPropertyValue(name).trim() || fallback;
    }
    return {
      background: cssValue("--bg", "#f5f4ef"),
      panel: cssValue("--panel", "#fbfaf6"),
      text: cssValue("--text", "#1e1c19"),
      muted: cssValue("--muted", "#6e6960"),
      line: cssValue("--line-strong", "#b5aea1"),
      accent: cssValue("--accent", "#9c3f33"),
      volume: volume || cssValue("--accent", "#9c3f33"),
      serif: cssValue("--article-font", "serif"),
      sans: cssValue("--sans", "sans-serif"),
    };
  }

  function shareCardEmblem(year, color) {
    var source = document.getElementById("em-" + year);
    if (!source) return Promise.resolve(null);
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("xmlns", SVG_NS);
    svg.setAttribute("viewBox", source.getAttribute("viewBox") || "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", color);
    svg.setAttribute("stroke-width", "1.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    Array.prototype.forEach.call(source.childNodes, function (node) {
      svg.appendChild(node.cloneNode(true));
    });
    var image = new Image();
    var sourceUrl = "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(new XMLSerializer().serializeToString(svg));
    return new Promise(function (resolve) {
      image.onload = function () { resolve(image); };
      image.onerror = function () { resolve(null); };
      image.src = sourceUrl;
    });
  }

  function wrapShareText(context, text, maxWidth, maxLines) {
    var lines = [];
    var line = "";
    var chars = Array.from(String(text || ""));
    var truncated = false;
    for (var i = 0; i < chars.length; i += 1) {
      var char = chars[i];
      if (char === "\n") {
        lines.push(line);
        line = "";
      } else if (line && context.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line += char;
      }
      if (lines.length >= maxLines) {
        truncated = i < chars.length - 1 || !!line;
        break;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    else if (line) truncated = true;
    if (truncated && lines.length) {
      var last = lines[lines.length - 1].replace(/\s+$/, "");
      while (last && context.measureText(last + "…").width > maxWidth) {
        last = Array.from(last).slice(0, -1).join("");
      }
      lines[lines.length - 1] = last + "…";
    }
    return lines;
  }

  function drawShareText(context, text, x, baseline, maxWidth, maxLines, lineHeight) {
    var lines = wrapShareText(context, text, maxWidth, maxLines);
    lines.forEach(function (line, index) {
      context.fillText(line, x, baseline + index * lineHeight);
    });
    return lines.length * lineHeight;
  }

  function drawShareCard(canvas, edition, work, quote) {
    canvas.width = 1200;
    canvas.height = 630;
    var context = canvas.getContext("2d");
    var palette = shareCardPalette(edition);
    var info = volumeInfo(edition);
    var roman = info.roman || String(edition.year);
    var issueNo = work ? "No. " + edition.year + " / " + String(work.no).padStart(3, "0") : "VOLUME " + roman;
    var editionUrl = shareCardUrl(edition, work);
    var urlLabel = editionUrl.replace(/^https?:\/\//, "");

    return Promise.resolve(document.fonts && document.fonts.ready)
      .then(function () { return shareCardEmblem(edition.year, palette.volume); })
      .then(function (emblem) {
        context.fillStyle = palette.background;
        context.fillRect(0, 0, 1200, 630);
        context.fillStyle = palette.panel;
        context.fillRect(36, 36, 1128, 558);
        context.strokeStyle = palette.line;
        context.lineWidth = 1;
        context.strokeRect(36.5, 36.5, 1127, 557);
        context.fillStyle = palette.volume;
        context.fillRect(36, 36, 6, 558);

        context.textBaseline = "alphabetic";
        context.textAlign = "left";
        context.fillStyle = palette.text;
        context.font = "600 21px " + palette.serif;
        context.fillText("幻梦境档案馆", 78, 82);
        context.fillStyle = palette.muted;
        context.font = "12px " + palette.sans;
        context.fillText("ARCANUS DREAMLANDS ARCHIVE", 78, 105);
        context.textAlign = "right";
        context.fillStyle = palette.volume;
        context.font = "600 17px " + palette.serif;
        context.fillText(issueNo, 1120, 86);
        context.strokeStyle = palette.line;
        context.beginPath();
        context.moveTo(78, 126);
        context.lineTo(1120, 126);
        context.stroke();

        if (work) {
          context.textAlign = "left";
          context.fillStyle = palette.volume;
          context.font = "600 15px " + palette.sans;
          context.fillText("摘句 · 第" + (info.chinese || roman) + "卷", 88, 174);
          if (emblem) {
            context.strokeStyle = palette.line;
            context.beginPath();
            context.arc(1080, 170, 30, 0, Math.PI * 2);
            context.stroke();
            context.drawImage(emblem, 1062, 152, 36, 36);
          }
          context.font = "30px " + palette.serif;
          var quoteLines = wrapShareText(context, quote, 920, 5);
          var quoteLineHeight = 43;
          var quoteBaseline = 320 - (Math.max(1, quoteLines.length) - 1) * quoteLineHeight / 2;
          context.fillStyle = palette.volume;
          context.font = "84px " + palette.serif;
          context.fillText("“", 88, quoteBaseline + 34);
          context.fillStyle = palette.text;
          context.font = "30px " + palette.serif;
          quoteLines.forEach(function (line, index) {
            context.fillText(line, 188, quoteBaseline + index * quoteLineHeight);
          });
          context.strokeStyle = palette.line;
          context.beginPath();
          context.moveTo(82, 470);
          context.lineTo(1118, 470);
          context.stroke();
          context.fillStyle = palette.text;
          context.font = "600 24px " + palette.serif;
          context.fillText(work.title, 84, 520, 720);
          context.fillStyle = palette.muted;
          context.font = "14px " + palette.sans;
          context.fillText("幻梦境档案馆 · " + edition.year + " / " + String(work.no).padStart(3, "0"), 84, 552);
          context.textAlign = "right";
          context.fillText(urlLabel, 1118, 552);
          return;
        }

        context.textAlign = "center";
        context.strokeStyle = palette.line;
        context.beginPath();
        context.arc(204, 278, 84, 0, Math.PI * 2);
        context.stroke();
        if (emblem) context.drawImage(emblem, 154, 228, 100, 100);
        context.fillStyle = palette.volume;
        context.font = "112px " + palette.serif;
        context.fillText(roman, 204, 472);

        context.textAlign = "left";
        context.fillStyle = palette.volume;
        context.font = "600 15px " + palette.sans;
        context.fillText("第" + (info.chinese || roman) + "卷 · " + edition.year + " 秋季号", 370, 187);
        context.fillStyle = palette.text;
        context.font = "600 47px " + palette.serif;
        var titleHeight = drawShareText(context, edition.name || edition.shortName, 370, 258, 710, 2, 62);
        context.fillStyle = palette.muted;
        context.font = "23px " + palette.serif;
        var intro = String(edition.intro || edition.note || "幻梦境档案馆年度作品集").trim();
        drawShareText(context, intro, 372, 292 + titleHeight, 700, 2, 34);
        context.strokeStyle = palette.line;
        context.beginPath();
        context.moveTo(370, 492);
        context.lineTo(1118, 492);
        context.stroke();
        context.fillStyle = palette.text;
        context.font = "600 17px " + palette.serif;
        context.fillText("收录 " + edition.works.length + " 篇 · " + editionStatusLabel(edition), 372, 532);
        context.fillStyle = palette.muted;
        context.font = "14px " + palette.sans;
        context.fillText(urlLabel, 372, 559);
        context.textAlign = "right";
        context.fillStyle = palette.volume;
        context.font = "14px " + palette.sans;
        context.fillText("幻梦境档案馆", 1118, 559);
      });
  }

  function openShareCardModal(edition, work, quote) {
    var body = el("div", "modal-body share-card-modal");
    body.appendChild(
      el(
        "p",
        "modal-meta",
        work ? "卡片只包含你选中的摘句、档号和作品名；评分期间不显示作者。" : "按本卷卷色与原有卷徽生成 1200 × 630 分享图。",
      ),
    );
    var canvas = document.createElement("canvas");
    canvas.className = "share-card-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", work ? "作品摘句分享卡片预览" : "本卷分享卡片预览");
    body.appendChild(canvas);
    var status = el("p", "share-card-status", "正在生成分享图…");
    status.setAttribute("aria-live", "polite");
    body.appendChild(status);

    var actions = el("div", "share-actions");
    var download = el("button", "btn", "下载 PNG");
    download.type = "button";
    download.disabled = true;
    download.addEventListener("click", function () {
      canvas.toBlob(function (blob) {
        if (!blob) {
          showToast("分享图导出失败，请重试");
          return;
        }
        var objectUrl = URL.createObjectURL(blob);
        var link = document.createElement("a");
        var suffix = work
          ? edition.year + "-" + displayWorkNo(work) + "-摘句"
          : edition.year + "-档案卷";
        link.href = objectUrl;
        link.download = suffix + ".png";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1000);
        showToast("分享图已下载");
      }, "image/png");
    });
    actions.appendChild(download);
    var copyLink = el("button", "btn-ghost", "复制阅读链接");
    copyLink.type = "button";
    copyLink.addEventListener("click", function () {
      copyText(shareCardUrl(edition, work)).then(function () {
        showToast("阅读链接已复制");
      }).catch(function (err) {
        showToast(err.message || "链接复制失败");
      });
    });
    actions.appendChild(copyLink);
    body.appendChild(actions);

    openModal(work ? "生成摘句卡片" : "分享本卷", body);
    var dialog = refs.modalRoot.querySelector(".modal-dialog");
    if (dialog) dialog.classList.add("share-card-dialog");
    drawShareCard(canvas, edition, work, quote).then(function () {
      download.disabled = false;
      status.textContent = "分享图已就绪 · PNG 1200 × 630";
    }).catch(function (err) {
      console.error(err);
      status.textContent = "分享图生成失败，请关闭后重试。";
    });
  }

  var quoteSelectionContext = null;
  var quoteSelectionButton = null;
  var quoteSelectionText = "";

  function hideQuoteSelectionButton() {
    quoteSelectionText = "";
    if (quoteSelectionButton) quoteSelectionButton.hidden = true;
  }

  function setQuoteSelectionContext(edition, work, body) {
    quoteSelectionContext = edition && work && body ? {
      edition: edition,
      work: work,
      body: body,
    } : null;
    hideQuoteSelectionButton();
  }

  function updateQuoteSelectionButton() {
    var context = quoteSelectionContext;
    var selection = window.getSelection();
    if (!quoteSelectionButton || !context || !context.body.isConnected || !selection || selection.isCollapsed || !selection.rangeCount) {
      hideQuoteSelectionButton();
      return;
    }
    if (!context.body.contains(selection.anchorNode) || !context.body.contains(selection.focusNode)) {
      hideQuoteSelectionButton();
      return;
    }
    var text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) {
      hideQuoteSelectionButton();
      return;
    }
    quoteSelectionText = text;
    var rect = selection.getRangeAt(0).getBoundingClientRect();
    quoteSelectionButton.hidden = false;
    var width = quoteSelectionButton.offsetWidth || 148;
    var height = quoteSelectionButton.offsetHeight || 36;
    var left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2));
    var top = rect.top - height - 10;
    if (top < 8) top = rect.bottom + 10;
    top = Math.max(8, Math.min(window.innerHeight - height - 8, top));
    quoteSelectionButton.style.left = left + "px";
    quoteSelectionButton.style.top = top + "px";
  }

  function initQuoteSelectionAction() {
    quoteSelectionButton = el("button", "quote-selection-action", "做成摘句卡");
    quoteSelectionButton.type = "button";
    quoteSelectionButton.hidden = true;
    quoteSelectionButton.setAttribute("aria-label", "将选中的正文生成摘句卡片");
    quoteSelectionButton.addEventListener("pointerdown", function (event) {
      event.preventDefault();
    });
    quoteSelectionButton.addEventListener("click", function () {
      var context = quoteSelectionContext;
      var quote = quoteSelectionText;
      hideQuoteSelectionButton();
      if (!context || !quote) return;
      if (Array.from(quote).length > 150) {
        showToast("摘句请控制在 150 字以内，再生成分享卡片。");
        return;
      }
      openShareCardModal(context.edition, context.work, quote);
    });
    document.body.appendChild(quoteSelectionButton);
    document.addEventListener("selectionchange", updateQuoteSelectionButton);
    window.addEventListener("scroll", hideQuoteSelectionButton, true);
    window.addEventListener("resize", hideQuoteSelectionButton);
  }

  function parseGlobalSearchQuery(query) {
    var raw = String(query || "").trim();
    var match = raw.match(/^(标题|作者|编号|届别|阶段)\s*[:：]\s*(.*)$/);
    var scopeMap = {
      标题: "title",
      作者: "author",
      编号: "number",
      届别: "edition",
      阶段: "phase",
    };
    if (!match) return { scope: "all", needle: raw.toLowerCase() };
    return {
      scope: scopeMap[match[1]] || "all",
      needle: String(match[2] || "").trim().toLowerCase(),
    };
  }

  function globalSearchFields(edition, work, phase) {
    return {
      title: String((work && work.title) || "").toLowerCase(),
      author: String((work && work.author) || "").toLowerCase(),
      number: workNumberTokens(work).join(" ").toLowerCase(),
      edition: [edition.year, edition.name, edition.shortName, edition.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      phase: String(phase || "").toLowerCase(),
      all: [
        edition.year,
        edition.name,
        edition.shortName,
        edition.slug,
        phase,
      ]
        .concat(workSearchText(work))
        .join(" ")
        .toLowerCase(),
    };
  }

  function globalSearchResults(query) {
    var parsed = parseGlobalSearchQuery(query);
    if (!parsed.needle) return [];
    var results = [];
    editions.forEach(function (edition) {
      var phase = isArchivedEdition(edition) ? "已封存" : phaseLabel(phaseOf(edition.slug));
      edition.works.forEach(function (work) {
        var fields = globalSearchFields(edition, work, phase);
        var haystack = fields[parsed.scope] || fields.all;
        if (haystack.indexOf(parsed.needle) !== -1) {
          results.push({ edition: edition, work: work, phase: phase });
        }
      });
    });
    return results;
  }

  function globalSearchLooseResults(query) {
    var parsed = parseGlobalSearchQuery(query);
    var tokens = parsed.needle.split(/[\s,，、]+/).filter(Boolean);
    if (tokens.length < 2) return [];
    var matches = [];
    editions.forEach(function (edition) {
      var phase = isArchivedEdition(edition) ? "已封存" : phaseLabel(phaseOf(edition.slug));
      edition.works.forEach(function (work) {
        var fields = globalSearchFields(edition, work, phase);
        var haystack = fields[parsed.scope] || fields.all;
        var score = tokens.reduce(function (total, token) {
          return total + (haystack.indexOf(token) !== -1 ? 1 : 0);
        }, 0);
        if (score) matches.push({ edition: edition, work: work, phase: phase, score: score });
      });
    });
    return matches
      .sort(function (a, b) {
        return b.score - a.score || String(a.work.title).localeCompare(String(b.work.title), "zh-CN");
      })
      .slice(0, 3);
  }

  var globalSearchBuilt = false;
  var searchRecommendationCache = { at: 0, rows: null };
  var searchRecommendationInflight = null;
  var refreshSearchDiscovery = null;

  function loadSearchRecommendations() {
    // 一分钟内复用上次结果，避免每次聚焦都打接口。
    if (searchRecommendationCache.rows && Date.now() - searchRecommendationCache.at < 60000) {
      return Promise.resolve(searchRecommendationCache.rows);
    }
    if (searchRecommendationInflight) return searchRecommendationInflight;
    searchRecommendationInflight = window.MythosAPI.call("getSearchRecommendations")
      .then(function (data) {
        var rows = (data && data.works) || [];
        searchRecommendationCache = { at: Date.now(), rows: rows };
        searchRecommendationInflight = null;
        return rows;
      })
      .catch(function () {
        searchRecommendationInflight = null;
        return searchRecommendationCache.rows || [];
      });
    return searchRecommendationInflight;
  }

  function closeGlobalSearchPanel() {
    if (!refs.siteSearchPanel) return;
    refs.siteSearchPanel.hidden = true;
    if (refs.siteSearch) refs.siteSearch.classList.remove("is-open");
  }

  function openGlobalSearchPanel() {
    if (!refs.siteSearchPanel || !refs.siteSearchInput) return;
    buildGlobalSearchPanel();
    refs.siteSearchPanel.hidden = false;
    if (refs.siteSearch) refs.siteSearch.classList.add("is-open");
    if (refreshSearchDiscovery) refreshSearchDiscovery();
    refs.siteSearchInput.focus();
    var caret = refs.siteSearchInput.value.length;
    refs.siteSearchInput.setSelectionRange(caret, caret);
  }

  function buildGlobalSearchPanel() {
    if (globalSearchBuilt) return;
    globalSearchBuilt = true;
    var panel = refs.siteSearchPanel;
    var input = refs.siteSearchInput;
    var hint = el("p", "global-search-hint", "输入关键词，搜索所有届次的标题、作者、编号与阶段。");
    panel.appendChild(hint);
    var suggestionsNode = el("div", "global-search-suggestions");
    suggestionsNode.setAttribute("aria-label", "搜索范围快捷项");
    panel.appendChild(suggestionsNode);
    var discoveryNode = el("div", "global-search-discovery");
    panel.appendChild(discoveryNode);
    var resultsNode = el("div", "global-search-results");
    resultsNode.setAttribute("role", "list");
    panel.appendChild(resultsNode);
    var emptySearchTimer = null;
    var emptySearchAnnounced = false;

    function paintDiscovery(rows, loading) {
      clear(discoveryNode);
      if (loading) {
        discoveryNode.appendChild(el("p", "global-search-hint", "正在翻阅馆内热议…"));
        return;
      }
      var valid = (rows || []).map(function (row) {
        for (var i = 0; i < editions.length; i += 1) {
          var edition = editions[i];
          var work = (edition.works || []).find(function (item) {
            return workId(edition.slug, item.slug) === row.workId;
          });
          if (work) return { edition: edition, work: work, stats: row };
        }
        return null;
      }).filter(Boolean);
      if (!valid.length) {
        discoveryNode.appendChild(el("p", "global-search-hint", "暂无馆内热议，直接输入关键词搜索。"));
        return;
      }
      discoveryNode.appendChild(el("h3", "global-search-discovery-title", "馆内热议"));
      var list = el("div", "global-search-hot-list");
      valid.forEach(function (item) {
        var link = el("a", "global-search-hot-item");
        link.href = "#/" + item.edition.slug + "/" + encodeURIComponent(item.work.slug);
        link.appendChild(el("strong", null, item.work.title));
        link.appendChild(el("span", null,
          item.edition.year + " · " + item.stats.commentCount + " 评议 · " +
          item.stats.ratingCount + " 票"));
        link.addEventListener("click", closeGlobalSearchPanel);
        list.appendChild(link);
      });
      discoveryNode.appendChild(list);
    }

    refreshSearchDiscovery = function () {
      var cached = searchRecommendationCache.rows;
      paintDiscovery(cached || [], !cached);
      loadSearchRecommendations().then(function (rows) {
        if (!discoveryNode.isConnected) return;
        paintDiscovery(rows, false);
      });
    };
    refreshSearchDiscovery();

    function paintSearchScopes(activeScope, recoveryResults) {
      clear(suggestionsNode);
      suggestionsNode.appendChild(el("span", "global-search-suggestion-label", "快捷筛选"));
      [
        ["标题", "title"],
        ["作者", "author"],
        ["编号", "number"],
        ["届别", "edition"],
        ["阶段", "phase"],
      ].forEach(function (item) {
        var button = el("button", "global-search-suggestion", item[0]);
        button.type = "button";
        button.setAttribute("aria-pressed", activeScope === item[1] ? "true" : "false");
        button.addEventListener("click", function () {
          input.value = item[0] + "：";
          paint();
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        });
        suggestionsNode.appendChild(button);
      });
      if (!recoveryResults || !recoveryResults.length) return;
      suggestionsNode.appendChild(el("span", "global-search-suggestion-label", "可能想找"));
      recoveryResults.forEach(function (result) {
        var button = el("button", "global-search-suggestion global-search-recovery", result.work.title);
        button.type = "button";
        button.title = result.work.author + " · " + result.edition.year;
        button.addEventListener("click", function () {
          input.value = result.work.title;
          paint();
          input.focus();
        });
        suggestionsNode.appendChild(button);
      });
    }

    function scheduleEmptySearchNotice(query) {
      if (emptySearchTimer) window.clearTimeout(emptySearchTimer);
      emptySearchTimer = null;
      var parsed = parseGlobalSearchQuery(query);
      if (!parsed.needle || emptySearchAnnounced || globalSearchResults(query).length) return;
      emptySearchTimer = window.setTimeout(function () {
        emptySearchTimer = null;
        if (refs.siteSearchPanel.hidden) return;
        var latestQuery = input.value.trim();
        if (!latestQuery || latestQuery.toLowerCase() !== query.toLowerCase()) return;
        if (!parseGlobalSearchQuery(latestQuery).needle || globalSearchResults(latestQuery).length) return;
        emptySearchAnnounced = true;
        notifyWitch("search-empty");
      }, 650);
    }

    function paint() {
      clear(resultsNode);
      var parsed = parseGlobalSearchQuery(input.value);
      discoveryNode.hidden = !!parsed.needle;
      var results = globalSearchResults(input.value);
      var recoveryResults = results.length ? [] : globalSearchLooseResults(input.value);
      paintSearchScopes(parsed.scope, parsed.needle ? recoveryResults : []);
      if (!parsed.needle) {
        if (emptySearchTimer) window.clearTimeout(emptySearchTimer);
        emptySearchTimer = null;
        hint.textContent = parsed.scope === "all"
          ? "输入关键词，搜索所有届次的标题、作者、编号与阶段。"
          : "已选择按" + input.value.replace(/[：:]\s*$/, "") + "筛选，继续输入关键词。";
        return;
      }
      var scopeHint = parsed.scope === "all"
        ? ""
        : "（按" + input.value.split(/[：:]/)[0] + "）";
      hint.textContent = results.length
        ? "找到 " + results.length + " 篇相关档案" + scopeHint
        : "没有找到匹配的档案。" + (recoveryResults.length ? "可先看看相近结果。" : "");
      if (!results.length) {
        resultsNode.appendChild(el("p", "global-search-empty", "换个标题、作者或档号试试。"));
        scheduleEmptySearchNotice(input.value.trim());
        return;
      }
      if (emptySearchTimer) window.clearTimeout(emptySearchTimer);
      emptySearchTimer = null;
      var currentEdition = "";
      results.forEach(function (result) {
        if (result.edition.slug !== currentEdition) {
          currentEdition = result.edition.slug;
          resultsNode.appendChild(
            el("div", "global-search-group-title", result.edition.year + " · " + result.edition.shortName),
          );
        }
        var link = el("a", "global-search-item");
        link.href = "#/" + result.edition.slug + "/" + encodeURIComponent(result.work.slug);
        link.setAttribute("role", "listitem");
        link.appendChild(el("span", "global-search-no", String(result.work.no).padStart(3, "0")));
        var main = el("span", "global-search-main");
        main.appendChild(el("strong", "global-search-title", result.work.title));
        main.appendChild(
          el("span", "global-search-meta", result.work.author + " · " + result.phase),
        );
        link.appendChild(main);
        link.addEventListener("click", function () {
          closeGlobalSearchPanel();
        });
        resultsNode.appendChild(link);
      });
    }

    input.addEventListener("input", paint);
    paint();
  }

  function initGlobalSearchShortcuts() {
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && refs.siteSearchPanel && !refs.siteSearchPanel.hidden) {
        closeGlobalSearchPanel();
        if (refs.siteSearchInput) refs.siteSearchInput.blur();
        return;
      }
      var target = event.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || (target && target.isContentEditable)) return;
      var key = String(event.key || "").toLowerCase();
      if (key === "/" || (key === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        openGlobalSearchPanel();
      }
    });
  }

  function initSiteNav() {
    if (refs.siteBrand) {
      refs.siteBrand.addEventListener("click", function () {
        location.hash = "#/";
      });
    }
    if (refs.siteNav) {
      refs.siteNav.querySelectorAll("[data-nav]").forEach(function (button) {
        button.addEventListener("click", function () {
          var nav = button.dataset.nav;
          if (nav === "catalogue") {
            location.hash = "#/" + state.editionSlug;
            return;
          }
          if (nav === "results") {
            navigateToPublicResults();
            return;
          }
          if (nav === "guide") {
            openGuideModal();
            return;
          }
          if (nav === "search") {
            openGlobalSearchPanel();
            return;
          }
          location.hash = "#/";
          window.setTimeout(function () {
            smoothScrollToId(nav === "archive" ? "home-archive" : "home-spotlight");
          }, 0);
        });
      });
    }
    if (refs.siteSearchInput) {
      refs.siteSearchInput.addEventListener("focus", openGlobalSearchPanel);
    }
    var siteSearchIcon = refs.siteSearch && refs.siteSearch.querySelector(".site-search-icon");
    if (siteSearchIcon) {
      siteSearchIcon.removeAttribute("aria-hidden");
      siteSearchIcon.setAttribute("role", "button");
      siteSearchIcon.setAttribute("tabindex", "0");
      siteSearchIcon.setAttribute("aria-label", "打开全馆搜索");
      siteSearchIcon.addEventListener("click", openGlobalSearchPanel);
      siteSearchIcon.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openGlobalSearchPanel();
        }
      });
    }
    if (refs.siteSearch) {
      document.addEventListener("click", function (event) {
        if (refs.siteSearch.contains(event.target)) return;
        if (refs.siteSearchPanel && refs.siteSearchPanel.hidden) return;
        closeGlobalSearchPanel();
      });
    }
    if (refs.topResults) {
      refs.topResults.addEventListener("click", navigateToPublicResults);
    }
    if (refs.siteAccountLink) {
      refs.siteAccountLink.addEventListener("click", function () {
        if (!isLoggedIn()) {
          showAuthGate();
        } else if (isVisitor()) {
          openVisitorAccountModal();
        } else {
          openAccountModal();
        }
      });
    }
  }

  function renderSiteBar() {
    var publicEdition = getPublicResultsEdition();
    var resultsEntry = refs.siteNav && refs.siteNav.querySelector('[data-nav="results"]');
    if (resultsEntry) resultsEntry.hidden = !publicEdition;
    if (refs.topResults) refs.topResults.hidden = !publicEdition;
    if (!refs.siteAccountLink) return;
    if (!isLoggedIn()) {
      refs.siteAccountLink.textContent = "调查员入口";
      refs.siteAccountLink.title = "登录或注册";
      return;
    }
    refs.siteAccountLink.textContent = isVisitor()
      ? "访客入口"
      : displayName(currentUser());
    refs.siteAccountLink.title = isVisitor() ? "访客账号" : "打开账号管理";
  }

  function getPublicResultsEdition() {
    var edition = editions.filter(function (item) {
      return item.works && item.works.length;
    })[0] || editions[0];
    return edition && isPublicPhase(edition.slug) ? edition : null;
  }

  function navigateToPublicResults() {
    var edition = getPublicResultsEdition();
    if (!edition) return;
    location.hash = "#/" + edition.slug + "/__results";
  }

  function renderHomeCataloguePreview(edition) {
    var section = el("section", "home-section catalogue-section");
    section.id = "home-catalogue";
    var intro = el("div", "catalogue-intro");
    intro.appendChild(el("div", "home-eyebrow", "VOLUME " + (volumeInfo(edition).roman || edition.year) + " · CATALOGUE"));
    intro.appendChild(el("h2", "home-section-title", "本届目录"));
    intro.appendChild(
      el(
        "p",
        "home-section-note catalogue-note",
        "按档号入册，依次翻阅。无论是寻找某件遗物，还是从头听完这一卷的低语，都可以从这里开始。",
      ),
    );
    var all = el("a", "text-link home-text-link", "查看全部 " + edition.works.length + " 篇");
    all.href = "#/" + edition.slug;
    all.appendChild(el("span", null, "→"));
    intro.appendChild(all);
    section.appendChild(intro);

    var list = el("div", "catalogue-preview-list");
    edition.works.slice(0, 6).forEach(function (work) {
      var row = el("a", "catalogue-preview-row");
      row.href = "#/" + edition.slug + "/" + encodeURIComponent(work.slug);
      row.appendChild(el("span", "catalogue-preview-no", String(work.no).padStart(3, "0")));
      row.appendChild(el("span", "catalogue-preview-title", work.title));
      row.appendChild(el("span", "catalogue-preview-leader"));
      row.appendChild(el("span", "catalogue-preview-author", work.author));
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function renderArchiveVolumes() {
    var section = el("section", "home-section archive-section");
    section.id = "home-archive";
    var header = el("div", "archive-section-head");
    header.appendChild(el("span", "home-eyebrow", "05"));
    header.appendChild(el("h2", "home-section-title", "历届档案 · 书架"));
    section.appendChild(header);
    var list = el("div", "archive-volume-list");
    editions.forEach(function (edition) {
      var info = volumeInfo(edition);
      var row = el("a", "archive-volume-row");
      row.href = "#/" + edition.slug;
      row.dataset.vol = String(edition.year);
      row.appendChild(el("span", "archive-volume-year", String(edition.year)));
      var main = el("span", "archive-volume-main");
      var volumeLabel = info.roman ? "VOL. " + info.roman : edition.year === 2021 ? "序卷乙" : "序卷甲";
      main.appendChild(el("small", "archive-volume-number", volumeLabel + " · " + edition.works.length + " 篇"));
      var emblem = el("span", "archive-volume-emblem");
      emblem.setAttribute("aria-hidden", "true");
      emblem.appendChild(svgUse("em-" + edition.year, "icon"));
      main.appendChild(emblem);
      main.appendChild(el("strong", null, (edition.shortName || edition.name || "").replace(/^\d{4}\s*/, "")));
      var status = isArchivedEdition(edition)
        ? "档案封存"
        : edition.works.length
          ? phaseLabel(phaseOf(edition.slug))
          : "待补充";
      if (isArchivedEdition(edition)) {
        if (historicalResultsOf(edition)) {
          main.appendChild(el("small", "archive-volume-publication", "结果已公示"));
        }
        var seal = el("span", "archive-volume-status archive-volume-seal");
        seal.setAttribute("aria-label", status);
        seal.appendChild(createInkSeal(status));
        main.appendChild(seal);
      } else {
        main.appendChild(el("small", "archive-volume-status", status));
      }
      row.appendChild(main);
      list.appendChild(row);
    });
    section.appendChild(list);
    var caption = el("div", "archive-volume-caption");
    var totalWorks = editions.reduce(function (total, edition) { return total + edition.works.length; }, 0);
    caption.appendChild(el("span", null, "共 " + editions.length + " 卷 · " + totalWorks + " 篇"));
    section.appendChild(caption);
    return section;
  }

  function renderResumeLink() {
    var entry = recentReadingEntries().filter(function (item) {
      return item.progress > 0.01 && item.progress < 0.98;
    })[0];
    if (!entry) return null;
    var percent = Math.round(entry.progress * 100);
    var link = el("a", "home-resume-link");
    link.href = "#/" + entry.edition.slug + "/" + encodeURIComponent(entry.work.slug);
    link.appendChild(el("span", null, "继续阅读"));
    link.appendChild(el("span", "home-resume-title", entry.work.title));
    link.appendChild(el("span", "home-resume-meta", "已读约 " + percent + "% →"));
    return link;
  }

  function renderHome() {
    stopReadingTracking();
    setQuoteSelectionContext(null);
    state.refreshEditionList = null;
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    setLayoutMode("home");
    hideHud();
    clear(refs.content);
    var edition = editions.filter(function (item) {
      return item.works && item.works.length;
    })[0] || editions[0];
    if (!edition) {
      refs.content.appendChild(el("p", "toc-empty", "没有可显示的内容。"));
      return;
    }
    state.editionSlug = edition.slug;
    state.workSlug = "";
    refs.editionSelect.value = edition.slug;
    var info = volumeInfo(edition);
    var st = editionState(edition.slug);
    var shell = el("div", "home-shell");
    shell.dataset.vol = String(edition.year);

    var masthead = el("header", "home-masthead");
    var mastheadBrand = el("div", "home-masthead-brand");
    var mastheadLogo = document.createElement("img");
    mastheadLogo.src = BRAND_ASSET_URL;
    mastheadLogo.alt = "";
    mastheadLogo.setAttribute("aria-hidden", "true");
    mastheadLogo.decoding = "async";
    mastheadBrand.appendChild(mastheadLogo);
    var mastheadName = el("div");
    mastheadName.appendChild(el("strong", null, "幻梦境档案馆"));
    mastheadName.appendChild(el("small", null, "Arcanus Dreamlands Archive"));
    mastheadBrand.appendChild(mastheadName);
    masthead.appendChild(mastheadBrand);
    var mastheadIssue = el("div", "home-masthead-issue");
    mastheadIssue.appendChild(el("span", null, "VOLUME " + (info.roman || edition.year) + " · AUTUMN " + edition.year));
    mastheadIssue.appendChild(el("span", null, "第" + (info.chinese || "") + "卷 · 秋季号"));
    masthead.appendChild(mastheadIssue);
    shell.appendChild(masthead);
    shell.appendChild(el("div", "home-masthead-rule"));

    var hero = el("section", "home-hero");
    var heroBrand = document.createElement("img");
    heroBrand.className = "home-brand-watermark";
    heroBrand.src = BRAND_ASSET_URL;
    heroBrand.alt = "";
    heroBrand.setAttribute("aria-hidden", "true");
    heroBrand.decoding = "async";
    hero.appendChild(heroBrand);
    var heroMain = el("div", "home-hero-main");
    heroMain.appendChild(el("div", "home-eyebrow", "CURRENT VOLUME · " + edition.year));
    var mark = el("div", "home-volume-mark");
    mark.appendChild(el("strong", null, info.roman || "V"));
    mark.appendChild(el("span", null, info.chinese ? "第" + info.chinese + "卷" : ""));
    heroMain.appendChild(mark);
    heroMain.appendChild(el("h1", "home-title", edition.name || edition.shortName));
    heroMain.appendChild(el("p", "home-intro", edition.intro || edition.note || ""));

    var due = isArchivedEdition(edition) ? "" : phaseDeadlineOf(edition.slug, st.phase);
    var colophon = el("dl", "home-colophon");
    function addColophon(label, value, accent) {
      var cell = el("div", accent ? "is-countdown" : null);
      cell.appendChild(el("dt", null, label));
      cell.appendChild(el("dd", null, value));
      colophon.appendChild(cell);
    }
    addColophon("收录", edition.works.length + " 篇");
    addColophon("截止", due ? formatShortDate(due) : "阶段进行中");
    var homeProgress = ratingProgressAvailable(edition) ? ratingProgressData(edition) : null;
    if (homeProgress && homeProgress.status === "loaded") {
      addColophon(
        "我的进度",
        "已评 " + homeProgress.ratedCount + " / " + homeProgress.eligibleWorkCount,
        true,
      );
    } else {
      addColophon("距截止", due ? formatCountdown(due) : "—", true);
    }
    heroMain.appendChild(colophon);
    hero.appendChild(heroMain);

    var spotlight = createSpotlightSection(edition);
    spotlight.classList.add("spotlight-rail");
    hero.appendChild(spotlight);
    shell.appendChild(hero);

    var heroState = el("section", "home-state");
    heroState.setAttribute("aria-label", "本卷进度与入口");
    var phaseLine = el("div", "home-phase-line");
    phaseLine.appendChild(el("span", null, "● " + editionStatusLabel(edition)));
    phaseLine.appendChild(el("span", null, due ? formatShortDate(due) + " 截止" : "阶段进行中"));
    heroState.appendChild(phaseLine);
    var timeline = renderPhaseTimeline(edition.slug);
    if (timeline) heroState.appendChild(timeline);
    var actions = el("div", "home-phase-actions");
    var shareVolume = el("button", "btn-ghost home-volume-share");
    shareVolume.type = "button";
    setIconLabel(shareVolume, "i-share", "分享本卷");
    shareVolume.addEventListener("click", function () {
      openShareCardModal(edition, null, "");
    });
    actions.appendChild(shareVolume);
    heroState.appendChild(actions);
    var resume = renderResumeLink();
    if (resume) heroState.appendChild(resume);
    shell.appendChild(heroState);
    shell.appendChild(renderHomeCataloguePreview(edition));
    shell.appendChild(renderArchiveVolumes());
    var footer = el("footer", "home-footer home-imprint");
    var imprintHead = el("div", "home-imprint-head");
    imprintHead.appendChild(el("p", "home-imprint-kicker", "ARCHIVE COLOPHON"));
    imprintHead.appendChild(el("strong", "home-imprint-name", "幻梦境档案馆"));
    footer.appendChild(imprintHead);
    var imprintGrid = el("div", "home-imprint-grid");
    [
      ["编辑与管理", "幻梦境档案馆"],
      ["本站说明", "持续收录、阅读与评议神话造物作品"],
      ["作品版权", "归原作者所有"],
    ].forEach(function (entry) {
      var item = el("div", "home-imprint-item");
      item.appendChild(el("span", "home-imprint-label", entry[0]));
      item.appendChild(el("span", "home-imprint-value", entry[1]));
      imprintGrid.appendChild(item);
    });
    footer.appendChild(imprintGrid);
    var imprintFoot = el("div", "home-imprint-foot");
    imprintFoot.appendChild(el("span", null, "作品内容用于展示与交流；版权归属不因收录而改变。"));
    var buildDate = String(window.ARCHIVE_BUILD_DATE || "").trim();
    imprintFoot.appendChild(
      el("span", null, buildDate ? "最近更新 · " + buildDate : "持续更新中"),
    );
    footer.appendChild(imprintFoot);
    shell.appendChild(footer);
    refs.content.appendChild(shell);

    loadSpotlight(edition.slug)
      .then(function (result) {
        if (state.view === "home" && state.editionSlug === edition.slug) {
          paintSpotlightSection(spotlight, edition, result, null, function () {});
        }
      })
      .catch(function (err) {
        console.error(err);
        if (state.view === "home" && state.editionSlug === edition.slug) {
          paintSpotlightSection(spotlight, edition, null, err, function () {
            loadSpotlight(edition.slug, true)
              .then(function (result) {
                paintSpotlightSection(spotlight, edition, result, null, function () {});
              })
              .catch(function (retryErr) {
                console.error(retryErr);
                paintSpotlightSection(spotlight, edition, null, retryErr, function () {});
              });
          });
        }
      });
  }

  function renderEditionOverview(edition) {
    stopReadingTracking();
    setQuoteSelectionContext(null);
    state.refreshEditionList = null;
    state.onlyUnrated = false;
    state.catalogueSort = "number";
    state.catalogueLength = "all";
    if (!edition) {
      renderHome();
      return;
    }
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    setLayoutMode("edition");
    hideHud();
    clear(refs.content);
    var shell = el("div", "home-shell edition-shell");
    shell.dataset.vol = String(edition.year);
    var anonymousAuthors = !isArchivedEdition(edition) && !isPublicPhase(edition.slug);
    shell.classList.toggle("is-anonymous-phase", anonymousAuthors);
    var head = el("section", "edition-overview-head");
    var info = volumeInfo(edition);
    head.appendChild(el("div", "home-eyebrow", "VOLUME " + (info.roman || edition.year) + " · CATALOGUE"));
    head.appendChild(el("h1", "home-title", edition.name || edition.shortName));
    if (edition.intro) {
      var editionIntro = el(
        "p",
        "home-intro edition-intro" + (String(edition.intro).length > 36 ? " is-collapsible" : ""),
        edition.intro,
      );
      head.appendChild(editionIntro);
      if (editionIntro.classList.contains("is-collapsible")) {
        var introToggle = el("button", "edition-intro-toggle", "展开简介");
        introToggle.type = "button";
        introToggle.setAttribute("aria-expanded", "false");
        introToggle.setAttribute("aria-controls", "edition-intro-" + edition.slug);
        editionIntro.id = "edition-intro-" + edition.slug;
        introToggle.addEventListener("click", function () {
          var expanded = editionIntro.classList.toggle("is-expanded");
          introToggle.textContent = expanded ? "收起简介" : "展开简介";
          introToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        });
        head.appendChild(introToggle);
      }
    }
    if (anonymousAuthors) {
      head.appendChild(
        el("p", "edition-anonymous-note", "评分期间作者匿名，结果公示时按获奖范围解封"),
      );
    }
    var timeline = renderPhaseTimeline(edition.slug);
    if (timeline) head.appendChild(timeline);
    var headTools = el("div", "edition-head-tools");
    headTools.appendChild(renderPhaseChip(edition.slug));
    if (historicalResultsOf(edition)) {
      var publication = el("a", "btn edition-publication-link", "查看本届公示");
      publication.href = "#/" + edition.slug + "/__results";
      headTools.appendChild(publication);
    }
    var shareVolume = el("button", "btn-ghost edition-share-volume", "分享本卷");
    shareVolume.type = "button";
    shareVolume.addEventListener("click", function () {
      openShareCardModal(edition, null, "");
    });
    headTools.appendChild(shareVolume);
    var back = el("a", "btn-ghost", "返回首页");
    back.href = "#/";
    headTools.appendChild(back);
    head.appendChild(headTools);
    shell.appendChild(head);
    var ratingProgress = renderRatingProgress(edition, false);
    if (ratingProgress) shell.appendChild(ratingProgress);

    var controls = el("div", "edition-controls");
    var searchWrap = el("div", "edition-search-wrap");
    searchWrap.appendChild(svgUse("i-search", "icon"));
    var search = el("input", "edition-search");
    search.type = "search";
    search.placeholder = "搜索标题或编号";
    search.value = state.keyword;
    search.setAttribute("aria-label", "搜索本届作品");
    searchWrap.appendChild(search);
    controls.appendChild(searchWrap);
    var filterRow = el("div", "edition-filter-row");
    var choiceButtons = [];
    function addChoiceGroup(label, key, options) {
      var group = el("div", "edition-choice-group");
      group.setAttribute("role", "group");
      group.setAttribute("aria-label", label);
      group.appendChild(el("span", "edition-choice-label", label));
      var choices = el("div", "edition-choice-options");
      options.forEach(function (optionData) {
        var button = el("button", "edition-choice", optionData[1]);
        button.type = "button";
        button.setAttribute("aria-label", optionData[2] || optionData[1]);
        button.addEventListener("click", function () {
          state[key] = optionData[0];
          paint();
        });
        choiceButtons.push({ button: button, key: key, value: optionData[0] });
        choices.appendChild(button);
      });
      group.appendChild(choices);
      filterRow.appendChild(group);
    }
    addChoiceGroup("排序", "catalogueSort", [
      ["number", "档号", "按档号排序"],
      ["length-asc", "短→长", "按篇幅从短到长排序"],
      ["length-desc", "长→短", "按篇幅从长到短排序"],
      ["random", "随机", "随机探索作品"],
    ]);
    addChoiceGroup("篇幅", "catalogueLength", [
      ["all", "全部", "显示全部篇幅"],
      ["short", "短篇", "只看短篇，少于 2000 字"],
      ["medium", "中篇", "只看中篇，2000 到 4000 字"],
      ["long", "长篇", "只看长篇，多于 4000 字"],
    ]);
    controls.appendChild(filterRow);
    var resultTools = el("div", "edition-result-tools");
    var hint = el("span", "edition-count-hint");
    resultTools.appendChild(hint);
    var filterUnrated = null;
    if (ratingProgressAvailable(edition)) {
      filterUnrated = el("button", "btn-ghost btn-tiny edition-unrated-filter", "只看未评");
      filterUnrated.type = "button";
      filterUnrated.disabled = !canInteract();
      filterUnrated.setAttribute("aria-pressed", "false");
      resultTools.appendChild(filterUnrated);
    }
    controls.appendChild(resultTools);
    shell.appendChild(controls);

    var list = el("div", "edition-index");
    shell.appendChild(list);
    var randomOrder = edition.works.slice().sort(function () {
      return Math.random() - 0.5;
    });
    var randomRank = {};
    randomOrder.forEach(function (work, index) {
      randomRank[work.slug] = index;
    });
    function paint() {
      clear(list);
      choiceButtons.forEach(function (choice) {
        var active = state[choice.key] === choice.value;
        choice.button.classList.toggle("is-active", active);
        choice.button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      var needle = state.keyword.trim().toLowerCase();
      var progress = ratingProgressAvailable(edition)
        ? (USE_CLOUD ? cloudRatingProgress[edition.slug] : localRatingProgress(edition))
        : null;
      var ratedIds = progress && progress.status === "loaded"
        ? progress.ratedWorkIds
        : [];
      var shown = edition.works.filter(function (work) {
        var id = workId(edition.slug, work.slug);
        if (state.onlyUnrated && ratedIds.indexOf(id) !== -1) return false;
        var chars = Number(work.chars) || 0;
        if (state.catalogueLength === "short" && !(chars > 0 && chars < 2000)) return false;
        if (state.catalogueLength === "medium" && !(chars >= 2000 && chars <= 4000)) return false;
        if (state.catalogueLength === "long" && !(chars > 4000)) return false;
        return !needle || workSearchText(work).indexOf(needle) !== -1;
      });
      shown.sort(function (a, b) {
        if (state.catalogueSort === "random") return randomRank[a.slug] - randomRank[b.slug];
        if (state.catalogueSort === "length-asc" || state.catalogueSort === "length-desc") {
          var aChars = Number(a.chars) || 0;
          var bChars = Number(b.chars) || 0;
          var delta = state.catalogueSort === "length-asc" ? aChars - bChars : bChars - aChars;
          return delta || Number(a.no) - Number(b.no);
        }
        return Number(a.no) - Number(b.no);
      });
      var lengthHint = state.catalogueLength === "short"
        ? "短篇"
        : state.catalogueLength === "medium"
          ? "中篇"
          : state.catalogueLength === "long"
            ? "长篇"
            : "";
      hint.textContent =
        (state.onlyUnrated ? "只看未评 · " : "显示 ") +
        shown.length +
        " / " +
        edition.works.length +
        " 篇" +
        (lengthHint ? " · " + lengthHint : "");
      if (filterUnrated) {
        filterUnrated.disabled = !progress || progress.status !== "loaded";
        filterUnrated.classList.toggle("is-active", state.onlyUnrated);
        filterUnrated.textContent = state.onlyUnrated ? "显示全部作品" : "只看未评";
        filterUnrated.setAttribute("aria-pressed", state.onlyUnrated ? "true" : "false");
      }
      if (!shown.length) {
        list.appendChild(el("p", "spotlight-empty", "没有匹配的作品。"));
        return;
      }
      shown.forEach(function (work) {
        var row = el("div", "edition-index-row");
        var starred = isStarred(edition.slug, work.slug);
        var star = el("button", "edition-index-star");
        star.type = "button";
        star.setAttribute("aria-pressed", starred ? "true" : "false");
        star.setAttribute("aria-label", starred ? "取消置顶" : "标星置顶");
        star.appendChild(svgUse("i-star", "icon"));
        star.disabled = !canInteract();
        star.title = canInteract() ? "标星置顶" : "登录后可收藏";
        star.addEventListener("click", function () {
          toggleStar(edition.slug, work.slug);
          paint();
          renderToc();
        });
        row.appendChild(star);
        row.appendChild(el("span", "edition-index-no", String(work.no).padStart(3, "0")));
        var title = el("a", "edition-index-title");
        title.href = "#/" + edition.slug + "/" + encodeURIComponent(work.slug);
        title.appendChild(el("span", "edition-index-title-text", work.title));
        var spotlightInfo = spotlightForWork(spotlightCache[edition.slug], edition, work);
        if (spotlightInfo && spotlightInfo.date) {
          var spotlightBadge = el("span", "edition-index-spotlight", "聚光");
          spotlightBadge.title = "今日聚光 · " + formatShortDate(spotlightInfo.date);
          title.appendChild(spotlightBadge);
        }
        row.appendChild(title);
        row.appendChild(el("span", "edition-index-leader"));
        var chars = Number(work.chars) || 0;
        var minutes = chars ? Math.max(1, Math.ceil(chars / 400)) : 0;
        var meta = el("span", "edition-index-meta");
        var readEntry = readingEntryOf(workId(edition.slug, work.slug));
        var readProgress = readEntry ? clampReadingProgress(readEntry.progress) : 0;
        var readDot = el("span", "edition-index-read");
        readDot.style.setProperty("--read", Math.round(readProgress * 100) + "%");
        readDot.title = readProgress ? "已读约 " + Math.round(readProgress * 100) + "%" : "尚未开始阅读";
        readDot.setAttribute("aria-hidden", "true");
        meta.appendChild(readDot);
        meta.appendChild(
          document.createTextNode(
            chars ? chars + " 字 · " + minutes + " 分钟" : "字数待补",
          ),
        );
        row.appendChild(meta);
        var isRated = ratedIds.indexOf(workId(edition.slug, work.slug)) !== -1;
        if (isRated) {
          var ratedSeal = el("span", "edition-index-rated");
          ratedSeal.setAttribute("aria-label", "已评");
          ratedSeal.appendChild(createRatedSeal("seal-tilt-r"));
          row.appendChild(ratedSeal);
        }
        row.dataset.workId = workId(edition.slug, work.slug);
        if (!anonymousAuthors) {
          row.appendChild(el("span", "edition-index-author", work.author));
        }
        list.appendChild(row);
      });
    }
    if (filterUnrated) {
      filterUnrated.addEventListener("click", function () {
        if (filterUnrated.disabled) return;
        state.onlyUnrated = !state.onlyUnrated;
        paint();
      });
    }
    search.addEventListener("input", function () {
      state.keyword = search.value;
      paint();
    });
    paint();
    state.refreshEditionList = paint;
    refs.content.appendChild(shell);
    loadSpotlight(edition.slug)
      .then(function () {
        if (state.view === "edition" && state.editionSlug === edition.slug) paint();
      })
      .catch(function () {
        /* 聚光标记读取失败不影响目录浏览。 */
      });
  }

  function renderIntro() {
    renderEditionOverview(findEdition(state.editionSlug));
  }

  function renderWorkPublicStats(id, work) {
    var panel = el("section", "panel public-stats");
    panel.appendChild(el("h2", "panel-title", "公示数据"));
    var stats = averages(id);
    var grid = el("div", "public-stats-grid");
    DIMENSIONS.forEach(function (dim) {
      var cell = el("div", "public-stat-cell");
      cell.appendChild(el("div", "score-label", dim.label + "均分"));
      cell.appendChild(
        el(
          "div",
          "score-value",
          stats[dim.key] == null ? "—" : stats[dim.key].toFixed(2),
        ),
      );
      grid.appendChild(cell);
    });
    panel.appendChild(grid);

    var pieRow = el("div", "pie-grid");
    DIMENSIONS.forEach(function (dim) {
      pieRow.appendChild(
        renderPieBlock(dim.label, scoreDistribution(id, dim.key)),
      );
    });
    panel.appendChild(pieRow);
    panel.appendChild(
      el(
        "p",
        "rate-hint",
        "完整排名与全局统计可在本届「查看公示」页打开。评委评价仅在投票统计期产生，并于统计/公示期置顶。",
      ),
    );
    return panel;
  }

  function renderWorkEndMark(edition, work, contentOverride) {
    var mark = el("div", "work-end-mark");
    mark.setAttribute("role", "separator");
    var ornament = el("div", "work-end-ornament");
    ["left", "center", "right"].forEach(function (position) {
      var star = svgUse("star4", "work-end-star work-end-star-" + position);
      star.setAttribute("aria-hidden", "true");
      ornament.appendChild(star);
    });
    mark.appendChild(ornament);
    mark.appendChild(el("div", "work-end-title", "本篇完"));
    var chars = contentOverride ? charsFromHtml(contentOverride.html) : work.chars;
    mark.appendChild(
      el(
        "p",
        "work-end-meta",
        edition.shortName +
          " · 档号 " +
          String(work.no).padStart(3, "0") +
          " · " +
          (chars || 0) +
          " 字",
      ),
    );
    mark.appendChild(
      el(
        "p",
        "work-end-prompt",
        votingOpen(edition.slug)
          ? "读完了？在下方留下你的评议 ↓"
          : "读完了？在下方留下你的评论 ↓",
      ),
    );
    return mark;
  }

  function renderRatingSectionDivider() {
    var divider = el("div", "rating-section-divider");
    divider.setAttribute("role", "separator");
    ["left", "center", "right"].forEach(function (position) {
      var star = svgUse("star4", "work-end-star work-end-star-" + position);
      star.setAttribute("aria-hidden", "true");
      divider.appendChild(star);
    });
    return divider;
  }

  function renderWork(edition, work) {
    clear(refs.content);
    state.refreshEditionList = null;
    var id = workId(edition.slug, work.slug);
    recordReadingOpen(edition, work);
    if (window.MythosWitch && window.MythosWitch.recordArticleOpen) {
      window.MythosWitch.recordArticleOpen(id);
    }
    var pendingPanelJump = "";
    var paintedContent = null;

    var jumpPanelId = votingOpen(edition.slug) ? "score-panel" : "comments-panel";

    function jumpToPanel(sheet) {
      pendingPanelJump = jumpPanelId;
      var target = sheet.querySelector("#" + jumpPanelId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    function paint(preserveScroll) {
      // 在线正文是异步到达的：每次重绘都必须重新取一遍，
      // 否则闭包里会一直是进入本页时的空快照，导致一直显示构建版正文。
      var contentOverride = cloudContent[id];
      var sections = contentOverride
        ? sectionsFromHtml(contentOverride.html)
        : work.sections || [];
      var savedScrollY = preserveScroll ? window.scrollY : 0;
      var frame = el("div", "reader-frame");
      var sheet = el("div", "sheet");

      var head = el("header", "work-head");

      var backLinks = el("nav", "work-backlinks");
      backLinks.setAttribute("aria-label", "文章位置");
      var backHome = el("a", null, "返回首页");
      backHome.href = "#/";
      var backEdition = el("a", null, "返回本卷");
      backEdition.href = "#/" + edition.slug;
      backLinks.appendChild(backHome);
      backLinks.appendChild(el("span", null, "·"));
      backLinks.appendChild(backEdition);
      head.appendChild(backLinks);

      var card = el("div", "work-card");
      var cardTop = el("div", "work-card-top");
      cardTop.appendChild(el("span", "work-card-label", "幻梦境档案馆 · 馆藏卡"));
      cardTop.appendChild(
        el(
          "span",
          "work-card-number",
          "No. " + edition.year + " / " + String(work.no).padStart(3, "0"),
        ),
      );
      card.appendChild(cardTop);
      var cardBody = el("div", "work-card-body");
      card.appendChild(cardBody);
      head.appendChild(card);

      // 馆藏卡内的卷次与主题：编号在卡头，卷次在卡面
      var fileNo = el("p", "work-fileno");
      var volume = volumeInfo(edition);
      var category = String(edition.shortName || edition.name || "")
        .replace(/^\d+\s*/, "")
        .replace(/设计大赛$/, "");
      fileNo.appendChild(
        el(
          "span",
          "work-fileno-vol",
          volume.chinese ? "第" + volume.chinese + "卷" : edition.year + " 卷",
        ),
      );
      fileNo.appendChild(el("span", "work-fileno-slash", "/"));
      fileNo.querySelector(".work-fileno-slash").textContent = "·";
      fileNo.appendChild(el("span", "work-fileno-no", category));
      cardBody.appendChild(fileNo);

      var compactBar = el("div", "reader-compact-bar");
      compactBar.setAttribute("aria-label", "阅读快捷信息");
      var compactInfo = el("div", "reader-compact-info");
      compactInfo.appendChild(
        el(
          "span",
          "reader-compact-kicker",
          (volume.chinese ? "第" + volume.chinese + "卷" : edition.year + " 卷") +
            " · " +
            edition.year +
            " / " +
            String(work.no).padStart(3, "0"),
        ),
      );
      compactInfo.appendChild(el("strong", "reader-compact-title", work.title));
      var compactText = el("span", "reader-compact-progress", "开始阅读");
      compactInfo.appendChild(compactText);
      compactBar.appendChild(compactInfo);
      var compactTrack = el("div", "reader-compact-progress-track");
      compactTrack.setAttribute("aria-hidden", "true");
      var compactFill = el("span", "reader-compact-progress-fill");
      var compactTrain = svgUse("i-train", "reader-compact-train");
      compactTrain.setAttribute("aria-hidden", "true");
      compactTrack.appendChild(compactFill);
      compactTrack.appendChild(compactTrain);
      compactBar.appendChild(compactTrack);
      var compactActions = el("div", "reader-compact-actions");
      var compactAaButton = el("button", "reader-compact-btn");
      compactAaButton.type = "button";
      setIconLabel(compactAaButton, "i-aa", "");
      compactAaButton.setAttribute("aria-label", "打开阅读设置");
      compactAaButton.setAttribute("aria-haspopup", "dialog");
      compactActions.appendChild(compactAaButton);
      var compactTocButton = null;
      if (sections.length) {
        compactTocButton = el("button", "reader-compact-btn");
        compactTocButton.type = "button";
        setIconLabel(compactTocButton, "i-toc", "");
        compactTocButton.setAttribute("aria-label", "打开本文目录");
        compactActions.appendChild(compactTocButton);
      }
      compactBar.appendChild(compactActions);

      cardBody.appendChild(el("h1", "work-title", work.title));

      var revealedAuthor = revealedAuthorName(edition.slug, id);
      var anonymous = isAnonymousAuthor(work) && !revealedAuthor;
      var cardFields = el("div", "work-card-fields");
      var cardChars = contentOverride ? charsFromHtml(contentOverride.html) : work.chars;
      var cardMinutes = cardChars ? Math.max(1, Math.ceil(cardChars / 400)) : 0;
      var due = isArchivedEdition(edition)
        ? ""
        : phaseDeadlineOf(edition.slug, phaseOf(edition.slug));
      function addCardField(label, value, extraClass) {
        var field = el("div", "work-card-field" + (extraClass ? " " + extraClass : ""));
        field.appendChild(el("span", "work-card-field-label", label));
        field.appendChild(el("strong", "work-card-field-value", value));
        cardFields.appendChild(field);
      }
      addCardField(
        "篇幅",
        (cardChars || 0) + " 字" + (cardMinutes ? " · 约 " + cardMinutes + " 分钟" : ""),
      );
      addCardField(
        "阶段",
        editionStatusLabel(edition) + (due ? " · " + formatShortDate(due) + " 截止" : ""),
      );
      addCardField(
        "作者",
        revealedAuthor || (anonymous ? "匿名" : work.author || "未见署名"),
        anonymous ? "is-anonymous" : "",
      );
      addCardField(
        "章节",
        sections.length ? sections.length + " 节" : "正文",
      );
      cardBody.appendChild(cardFields);

      if (anonymous) {
        var publicAwards = editionAwardsData(edition.slug);
        var wasAwarded =
          publicAwards &&
          publicAwards.published &&
          Array.isArray(publicAwards.awardedWorkIds) &&
          publicAwards.awardedWorkIds.indexOf(id) !== -1;
        cardBody.appendChild(
          el(
            "p",
            "work-anon-note",
            isArchivedEdition(edition)
              ? "历史资料未载明作者，按原件封存"
              : isPublicPhase(edition.slug)
                ? wasAwarded
                  ? "本作已获奖，作者信息待补充"
                  : "未获奖励的作品将匿名封存"
                : "作者身份将在结果公示时按获奖范围解封",
          ),
        );
      }

      var spotlightInfo = spotlightForWork(spotlightCache[edition.slug], edition, work);
      var spotlightNote = el("p", "work-spotlight-note");
      if (spotlightInfo && spotlightInfo.date) {
        card.classList.add("has-spotlight");
        spotlightNote.textContent = "今日聚光 · " + formatShortDate(spotlightInfo.date);
        var spotlightSeal = createSpotlightSeal(formatShortDate(spotlightInfo.date));
        spotlightSeal.classList.add("work-spotlight-seal");
        card.appendChild(spotlightSeal);
      } else {
        spotlightNote.hidden = true;
      }
      cardBody.appendChild(spotlightNote);
      var readingProgress = el("div", "reading-progress");
      var readingTrack = el("div", "reading-progress-track");
      readingTrack.setAttribute("role", "progressbar");
      readingTrack.setAttribute("aria-label", "正文阅读进度");
      readingTrack.setAttribute("aria-valuemin", "0");
      readingTrack.setAttribute("aria-valuemax", "100");
      var readingBar = el("span", "reading-progress-bar");
      var readingText = el("span", "reading-progress-text", "开始阅读");
      readingTrack.appendChild(readingBar);
      readingProgress.appendChild(readingTrack);
      readingProgress.appendChild(readingText);
      cardBody.appendChild(readingProgress);
      var jumpRow = el("div", "work-jump-row");
      var shareButton = el("button", "btn-ghost work-jump-btn");
      shareButton.type = "button";
      setIconLabel(shareButton, "i-share", "分享档案");
      shareButton.setAttribute("aria-label", "分享当前档案");
      shareButton.addEventListener("click", function () {
        shareWork(edition, work);
      });
      jumpRow.appendChild(shareButton);
      var jumpButton = el(
        "button",
        "btn-ghost work-jump-btn jump-to-score",
      );
      jumpButton.type = "button";
      setIconLabel(jumpButton, "i-down", votingOpen(edition.slug) ? "跳到评分区" : "跳到评论区");
      jumpButton.setAttribute(
        "aria-label",
        votingOpen(edition.slug) ? "跳到文章底部评分区" : "跳到文章底部评论区",
      );
      jumpButton.addEventListener("click", function () {
        jumpToPanel(sheet);
      });
      jumpRow.appendChild(jumpButton);
      var aaButton = el("button", "btn-ghost work-jump-btn");
      aaButton.type = "button";
      setIconLabel(aaButton, "i-aa", "");
      aaButton.setAttribute("aria-label", "打开阅读设置");
      aaButton.setAttribute("aria-haspopup", "dialog");
      jumpRow.appendChild(aaButton);
      var bookmarkButton = el("button", "btn-ghost work-jump-btn work-bookmark-btn");
      bookmarkButton.type = "button";
      bookmarkButton.setAttribute("aria-label", "收藏当前档案");
      function refreshBookmark() {
        var starred = isStarred(edition.slug, work.slug);
        setIconLabel(bookmarkButton, "i-bookmark", "");
        bookmarkButton.setAttribute("aria-pressed", starred ? "true" : "false");
        bookmarkButton.setAttribute("aria-label", starred ? "取消收藏当前档案" : "收藏当前档案");
        bookmarkButton.title = canInteract() ? (starred ? "取消收藏" : "收藏档案") : "登录调查员账号后可收藏";
        bookmarkButton.disabled = !canInteract();
        bookmarkButton.classList.toggle("is-active", starred);
      }
      refreshBookmark();
      bookmarkButton.addEventListener("click", function () {
        if (!canInteract()) return;
        toggleStar(edition.slug, work.slug);
        refreshBookmark();
        renderToc();
      });
      jumpRow.appendChild(bookmarkButton);
      if (isAdmin() && USE_CLOUD) {
        var editBody = el("button", "btn-ghost work-jump-btn", "编辑正文");
        editBody.type = "button";
        editBody.setAttribute("aria-label", "管理员编辑这篇正文");
        editBody.addEventListener("click", function () {
          openWorkEditor(id, work);
        });
        jumpRow.appendChild(editBody);
      }
      cardBody.appendChild(jumpRow);

      var body = el("div", "work-body" + (id === "2026/34-沃多在哪里？" ? " work-no-indent" : ""));
      if (contentOverride && contentOverride.html) {
        body.innerHTML = contentOverride.html;
      } else if (USE_CLOUD) {
        body.appendChild(
          el("p", "work-body-loading", "正在从档案库调取正文…"),
        );
      } else {
        body.innerHTML = work.html || "";
      }
      var readerSettings = loadReadingSettings();
      var settingsPanel = el("div", "modal-body reading-settings-modal");
      var settingButtons = [];
      function addSettingGroup(key, label, options) {
        var group = el("div", "reading-settings-group");
        group.appendChild(el("span", "reading-settings-label", label));
        var optionRow = el("div", "reading-settings-options");
        options.forEach(function (option) {
          var optionButton = el("button", "reading-settings-option", option[1]);
          optionButton.type = "button";
          optionButton.dataset.key = key;
          optionButton.dataset.value = String(option[0]);
          optionButton.addEventListener("click", function () {
            readerSettings[key] = option[0];
            saveReadingSettings(readerSettings);
            applyReaderSettings();
            refreshSettingButtons();
          });
          settingButtons.push({ button: optionButton, key: key, value: option[0] });
          optionRow.appendChild(optionButton);
        });
        group.appendChild(optionRow);
        settingsPanel.appendChild(group);
      }
      function applyReaderSettings() {
        body.style.fontSize = Number(readerSettings.fontSize) + "px";
        body.style.lineHeight = String(readerSettings.lineHeight);
        frame.style.setProperty("--reader-sheet-width", Number(readerSettings.width) + "px");
      }
      function refreshSettingButtons() {
        settingButtons.forEach(function (entry) {
          var active = Number(readerSettings[entry.key]) === Number(entry.value);
          entry.button.classList.toggle("is-active", active);
          entry.button.setAttribute("aria-pressed", active ? "true" : "false");
        });
      }
      addSettingGroup("fontSize", "字号", [[16, "小"], [18, "标准"], [20, "大"], [22, "特大"]]);
      addSettingGroup("lineHeight", "行距", [[1.75, "紧凑"], [1.95, "标准"], [2.15, "宽松"]]);
      addSettingGroup("width", "版心", [[640, "窄"], [720, "标准"], [820, "宽"]]);
      refreshSettingButtons();
      applyReaderSettings();
      aaButton.addEventListener("click", function () {
        refreshSettingButtons();
        openModal("阅读设置", settingsPanel);
      });
      compactAaButton.addEventListener("click", function () {
        aaButton.click();
      });
      card.appendChild(el("span", "work-card-hole"));
      frame.appendChild(compactBar);
      sheet.appendChild(head);
      sheet.appendChild(body);
      sheet.appendChild(renderWorkEndMark(edition, work, contentOverride));
      var historicalReviews = renderHistoricalWorkReviews(edition, work);
      if (historicalReviews) sheet.appendChild(historicalReviews);
      var authorNote = renderAuthorNotePanel(id, work);
      if (authorNote) sheet.appendChild(authorNote);
      sheet.appendChild(renderRatingSectionDivider());
      sheet.appendChild(renderScorePanel(id));
      if (isPublicPhase(edition.slug)) {
        sheet.appendChild(renderWorkPublicStats(id, work));
      }
      sheet.appendChild(renderCommentPanel(id));
      frame.appendChild(sheet);

      var sectionNav = renderSectionNav(sections);
      if (sectionNav) frame.appendChild(sectionNav);

      if (sectionNav && compactTocButton) {
        compactTocButton.addEventListener("click", function () {
          var toggle = sectionNav.querySelector(".section-nav-toggle");
          if (toggle && !sectionNav.classList.contains("is-open")) toggle.click();
          sectionNav.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }

      clear(refs.content);
      refs.content.appendChild(frame);
      setQuoteSelectionContext(edition, work, body);
      paintedContent = contentOverride || null;
      updateHud(edition, work);
      window.scrollTo(0, savedScrollY);
      startReadingTracking(
        edition,
        work,
        {
          track: readingTrack,
          bar: readingBar,
          text: readingText,
          compactText: compactText,
          compactTrack: compactTrack,
          compactFill: compactFill,
          compactTrain: compactTrain,
          totalChars: cardChars,
          getValue: null,
        },
        !preserveScroll,
      );
      if (pendingPanelJump) {
        window.requestAnimationFrame(function () {
          var target = sheet.querySelector("#" + pendingPanelJump);
          if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
      bindSectionSpy(sections);
    }

    if (!USE_CLOUD) {
      paint();
      return;
    }

    // 首屏只带目录元数据；正文按需调取，评分/评论后台同步后局部刷新。
    paint();
    var stillHere = function () {
      return (
        state.editionSlug === edition.slug && state.workSlug === work.slug
      );
    };
    if (isPublicPhase(edition.slug) && isAnonymousAuthor(work) && !cloudAwardsLoaded[edition.slug]) {
      loadCloudEditionAwards(edition.slug)
        .then(function () {
          if (stillHere()) paint(true);
        })
        .catch(function (e) {
          console.error(e);
        });
    }
    if (isArchivedEdition(edition) && !cloudContent[id]) {
      loadStaticWorkContent(id)
        .then(function (content) {
          if (cloudContent[id]) return;
          cloudContent[id] = content;
          if (stillHere()) paint(true);
        })
        .catch(function () {
          // 作品接口稍后会再次尝试静态正文；预取失败不提前打断阅读页。
        });
    }
    var spotlightPromise = loadSpotlight(edition.slug)
      .then(function () {
        if (stillHere()) updateWorkSpotlightNote();
      })
      .catch(function (e) {
        // 阅读页只保留轻量推荐来源；聚光接口失败不影响正文。
        console.error(e);
      });
    var needStars = !cloudStarsLoaded[edition.slug];
    var needBundle = !cloudBundleLoaded[id];
    if (!needStars && !needBundle) {
      return;
    }
    // 正文和标星是独立数据：不能因为标星请求偶发失败，就让已恢复的在线正文
    // 一直停留在构建包的旧版本。正文一到便立即重绘；标星随后到达再补一次互动状态。
    var bundlePromise = loadCloudWorkBundle(id)
      .then(function () {
        if (stillHere()) {
          if ((cloudContent[id] || null) !== paintedContent) paint(true);
          scheduleArchivedAdjacentPrefetch(edition, work);
        }
      })
      .catch(function (e) {
        console.error(e);
        if (!stillHere()) return;
        if (cloudContent[id]) return;
        var showBundleError = function () {
          if (!stillHere() || cloudContent[id]) return;
          var loading = refs.content.querySelector(".work-body-loading");
          if (loading) {
            loading.textContent = "正文同步失败，请稍后重试。";
          }
          var tip = el(
            "p",
            "toc-empty",
            "正文同步失败：" + (e.message || String(e)),
          );
          tip.style.marginTop = "12px";
          refs.content.appendChild(tip);
        };
        var staticPending = isArchivedEdition(edition) && staticContentInflight[id];
        if (staticPending) {
          staticPending.then(showBundleError, showBundleError);
          return;
        }
        showBundleError();
      });

    var starsPromise = loadCloudStars(edition.slug)
      .then(function () {
        if (!stillHere()) return;
        if (needStars) renderToc();
      })
      .catch(function (e) {
        // 星标失败不影响正文、评论和评分的展示；保留日志以便后续排查。
        console.error(e);
      });

    Promise.all([bundlePromise, starsPromise, spotlightPromise]).catch(function () {
      /* 各请求已经分别处理错误；这里仅避免未处理的 Promise rejection。 */
    });
  }

  function hideHud() {
    refs.hud.hidden = true;
    refs.hudPrev.disabled = true;
    refs.hudNext.disabled = true;
    refs.hudPrev.onclick = null;
    refs.hudNext.onclick = null;
    bindPrefetchIntent(refs.hudPrev, null, null);
    bindPrefetchIntent(refs.hudNext, null, null);
    clear(refs.hudPrev);
    clear(refs.hudNext);
    // 首页没有上下篇，但底部栏要留着——「☰ 目录」是手机端唯一的目录入口
    setMobilePager(null, null, null);
  }

  function fillHudButton(button, symbolId, title) {
    clear(button);
    var arrow = el("span", "hud-arrow");
    arrow.appendChild(svgUse(symbolId, "icon"));
    button.appendChild(arrow);
    if (title) {
      var label = el("span", "hud-label", title);
      if (title.length > 18) label.classList.add("is-long");
      if (title.length > 28) label.classList.add("is-xlong");
      button.appendChild(label);
    }
  }

  function updateHud(edition, work) {
    var index = -1;
    for (var i = 0; i < edition.works.length; i++) {
      if (edition.works[i].slug === work.slug) {
        index = i;
        break;
      }
    }
    var prev = index > 0 ? edition.works[index - 1] : null;
    var next =
      index >= 0 && index < edition.works.length - 1
        ? edition.works[index + 1]
        : null;
    refs.hud.hidden = false;
    refs.hudPrev.disabled = !prev;
    refs.hudPrev.title = prev ? "上一篇：" + prev.title : "";
    fillHudButton(refs.hudPrev, "i-prev", prev ? prev.title : "");
    refs.hudPrev.onclick = prev
      ? function () {
          location.hash =
            "#/" + edition.slug + "/" + encodeURIComponent(prev.slug);
        }
      : null;
    bindPrefetchIntent(refs.hudPrev, edition, prev);
    refs.hudNext.disabled = !next;
    refs.hudNext.title = next ? "下一篇：" + next.title : "";
    fillHudButton(refs.hudNext, "i-next", next ? next.title : "");
    refs.hudNext.onclick = next
      ? function () {
          location.hash =
            "#/" + edition.slug + "/" + encodeURIComponent(next.slug);
        }
      : null;
    bindPrefetchIntent(refs.hudNext, edition, next);
    setMobilePager(edition, prev, next);
  }

  /* ---------- 路由 ---------- */

  function setDocumentTitle(parts) {
    var title = parts.filter(Boolean).join(" · ");
    document.title = title ? title + " | 幻梦境档案馆" : "幻梦境档案馆";
  }

  function route() {
    if (!isLoggedIn()) {
      showAuthGate();
      return;
    }
    state.refreshEditionList = null;
    refreshChrome();
    setTopMenuOpen(false);

    var hash = location.hash.replace(/^#\/?/, "");
    if (!hash && window.ARCHIVE_INITIAL_ROUTE) {
      hash = String(window.ARCHIVE_INITIAL_ROUTE).replace(/^#\/?/, "");
    }
    var parts = hash ? hash.split("/") : [];
    var editionSlug = parts[0] ? decodeURIComponent(parts[0]) : "";
    var workSlug = parts[1] ? decodeURIComponent(parts[1]) : "";

    if (!editionSlug) {
      state.workSlug = "";
      state.view = "home";
      window.scrollTo(0, 0);
      setDocumentTitle([]);
      renderHome();
      updateWitchContext();
      return;
    }

    var edition =
      findEdition(editionSlug) || findEdition(state.editionSlug) || editions[0];
    if (!edition) {
      clear(refs.content);
      refs.content.appendChild(el("p", "toc-empty", "没有可显示的内容。"));
      updateWitchContext();
      return;
    }

    state.editionSlug = edition.slug;
    refs.editionSelect.value = edition.slug;

    if (workSlug === "__results") {
      state.workSlug = "";
      if (state.view !== "results") applySidebarCollapsed(true);
      state.view = "results";
      setDocumentTitle([historicalResultsOf(edition) ? "结果公报" : "投票公示", edition.shortName]);
      setLayoutMode("results");
      renderToc();
      renderResults(edition);
      updateWitchContext();
      return;
    }

    var work = findWork(edition, workSlug);
    state.workSlug = work ? work.slug : "";
    if (work) {
      if (state.view !== "reader") applySidebarCollapsed(true);
      state.view = "reader";
      setDocumentTitle([work.title, edition.shortName]);
      setLayoutMode("reader");
      renderToc();
      renderWork(edition, work);
      updateWitchContext();
    } else {
      state.view = "edition";
      window.scrollTo(0, 0);
      setDocumentTitle([edition.shortName]);
      renderEditionOverview(edition);
      updateWitchContext();
    }
  }

  /* ---------- 启动 ---------- */

  ensureDesignSprite();
  initQuoteSelectionAction();
  decorateStaticControls();
  buildEditionSelect();
  initThemeToggle();
  initSidebarToggle();
  initMobileBar();
  initTopMenu();
  initSiteNav();
  initGlobalSearchShortcuts();

  window.addEventListener("beforeunload", function () {
    stopReadingTracking();
  });

  refs.editionSelect.addEventListener("change", function () {
    state.editionSlug = refs.editionSelect.value;
    state.workSlug = "";
    location.hash = "#/" + state.editionSlug;
  });

  refs.search.addEventListener("input", function () {
    state.keyword = refs.search.value;
    renderToc();
  });

  window.addEventListener("hashchange", route);
  window.addEventListener("mythos:white-ship", travelByWhiteShip);

  /* ---------- 启动失败与重试 ---------- */

  function bootErrorMessage(error) {
    var message = error && error.message ? error.message : String(error || "未知错误");
    if (message.indexOf("请求超时") === 0) return message;
    if (message.indexOf("无法连接到服务器") === 0) return message;
    return "启动时发生问题：" + message;
  }

  function closeBootError() {
    var panel = document.getElementById("boot-error");
    if (panel) panel.hidden = true;
  }

  function showBootError(error) {
    // 只有确实被启动遮罩挡住的主入口才弹全屏失败面板；
    // 深链接的 prerender 页面正文是静态内容，不需要接口也能读，保持原兜底路径。
    var wasBooting = document.body.classList.contains("is-booting");
    if (window.DreamGate && window.DreamGate.hide) window.DreamGate.hide("error");
    finishBoot();
    var panel = document.getElementById("boot-error");
    if (!panel || !wasBooting) {
      // 旧版页面没有失败面板时保留原有兜底：给出提示并回到登录门。
      clear(refs.content);
      refs.content.appendChild(
        el(
          "p",
          "toc-empty",
          "初始化失败：" + (error && error.message ? error.message : String(error)),
        ),
      );
      showAuthGate();
      return;
    }
    var copy = document.getElementById("boot-error-copy");
    if (copy) copy.textContent = bootErrorMessage(error);
    var retry = document.getElementById("boot-error-retry");
    if (retry) {
      retry.disabled = false;
      retry.textContent = "重试";
    }
    panel.hidden = false;
    if (retry) {
      try {
        retry.focus({ preventScroll: true });
      } catch (focusError) {
        /* 聚焦失败不影响错误提示 */
      }
    }
  }

  function bootApp() {
    closeBootError();
    return ensureAdminSeed()
      .then(function () {
        if (USE_CLOUD) return cloudBootstrap();
        return null;
      })
      .then(function () {
        if (!isLoggedIn()) showAuthGate();
        else hideAuthGate();
      });
  }

  var bootRetrying = false;
  var bootRetryButton = document.getElementById("boot-error-retry");
  var bootGateButton = document.getElementById("boot-error-gate");
  if (bootRetryButton) {
    bootRetryButton.addEventListener("click", function () {
      if (bootRetrying) return;
      bootRetrying = true;
      bootRetryButton.disabled = true;
      bootRetryButton.textContent = "正在重试…";
      bootApp()
        .then(function () {
          bootRetrying = false;
        })
        .catch(function (err) {
          bootRetrying = false;
          console.error(err);
          showBootError(err);
        });
    });
  }
  if (bootGateButton) {
    bootGateButton.addEventListener("click", function () {
      closeBootError();
      showAuthGate();
    });
  }

  bootApp().catch(function (err) {
    console.error(err);
    showBootError(err);
  });
})();
