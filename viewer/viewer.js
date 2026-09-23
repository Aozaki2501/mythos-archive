/* 幻梦境档案馆 · 离线单文件版
   账号 / 评分 / 评论 / 标星存于本机 localStorage（演示用，非真正共享）。 */
(function () {
  "use strict";

  var DATA = window.ARCHIVE_DATA || { editions: [] };
  var STORE_KEY = "mythos.archive.v5";
  var USE_CLOUD =
    typeof window.MythosCloud !== "undefined" &&
    window.MythosCloud.enabled &&
    window.MythosCloud.enabled();
  var BODY_MAX = 2000;
  var AUTHOR_NOTE_MAX = 2000;
  var NAME_MAX = 20;
  var SIDEBAR_KEY = "mythos.sidebar.collapsed";
  var THEME_KEY = "mythos.theme";
  var READING_KEY = "mythos.reading.v1";
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
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
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
      likes: {},
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
    base.likes = raw.likes || {};
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
    return window.MythosCloud.bootstrap().then(function (data) {
      applyCloudAuthData(data);
      if (data && data.session && data.session.token) {
        window.MythosCloud.setToken(data.session.token);
      }
      return window.MythosCloud.call("adminGetUsers");
    }).then(function (data) {
      mergeCloudUsers(data && data.users);
      return data;
    });
  }

  function cloudBootstrap() {
    return window.MythosCloud.bootstrap().then(function (data) {
      applyCloudAuthData(data);
      if (data && data.session && data.session.token) {
        window.MythosCloud.setToken(data.session.token);
      }
      return data;
    });
  }

  function pushCloudSettings() {
    if (!USE_CLOUD || !isAdmin()) return Promise.resolve();
    return window.MythosCloud.call("adminSaveSettings", {
      settings: {
        allowVisitor: store.settings.allowVisitor,
        allowMemberLogin: store.settings.allowMemberLogin,
        registrationOpen: store.settings.registrationOpen,
        memberDirectory: store.settings.memberDirectory || [],
        adminDirectory: store.settings.adminDirectory || [],
        editions: store.settings.editions || {},
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

  function likesOpen(slug) {
    if (isArchivedEdition(slug)) return false;
    var p = phaseOf(slug);
    return p === "统计" || p === "公示";
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
      return window.MythosCloud.call("saveAuthorNote", {
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
      window.MythosCloud.call("setStars", {
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
    store.likes[id] = data.likes || {};
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
    var info = edition && spotlightForWork(spotlightCache[edition.slug], edition);
    if (info && info.date) {
      note.textContent = "今日聚光 · " + formatShortDate(info.date);
      note.hidden = false;
    } else {
      note.hidden = true;
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
    cloudBundleInflight[id] = window.MythosCloud.call("getWorkBundle", {
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
    cloudStarsInflight[editionSlug] = window.MythosCloud.call("getStars", {
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
    cloudInsightsInflight[editionSlug] = window.MythosCloud
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
    cloudAwardsInflight[editionSlug] = window.MythosCloud
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

  function spotlightForWork(result, edition) {
    if (!result || !Array.isArray(result.items) || !edition) return null;
    for (var i = 0; i < result.items.length; i++) {
      var item = result.items[i];
      if (item && item.workId && item.workId.indexOf(edition.slug + "/") === 0) {
        var slug = item.workId.slice(edition.slug.length + 1);
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
    spotlightInflight[editionSlug] = window.MythosCloud.call("getSpotlight", {
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
    cloudRatingProgressInflight[editionSlug] = window.MythosCloud.call(
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
    cloudRatingAchievementClaimInflight[editionSlug] = window.MythosCloud.call(
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
    title.appendChild(el("strong", null, "已评 " + count + " / " + total + " 篇"));
    head.appendChild(title);
    head.appendChild(el("strong", "rating-progress-percent", percentText + "%"));
    slot.appendChild(head);

    var track = el("div", "rating-progress-track");
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", "沉入幻梦境评分进度");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", String(total));
    track.setAttribute("aria-valuenow", String(count));
    track.setAttribute("aria-valuetext", "已评 " + count + " / " + total + " 篇，" + percentText + "%");
    var fill = el("span", "rating-progress-fill");
    fill.style.width = percent + "%";
    track.appendChild(fill);
    achievements.forEach(function (achievement) {
      var isFinalMilestone = achievement.threshold === total;
      var marker = el(
        "span",
        "rating-progress-milestone" +
          (achievement.unlocked ? " is-unlocked" : "") +
          (isFinalMilestone ? " is-final" : ""),
        isFinalMilestone ? null : "✦",
      );
      if (isFinalMilestone) {
        var crown = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        crown.setAttribute("class", "rating-progress-crown");
        crown.setAttribute("viewBox", "0 0 24 24");
        crown.setAttribute("aria-hidden", "true");
        var crownShape = document.createElementNS("http://www.w3.org/2000/svg", "path");
        crownShape.setAttribute("d", "M2 6l5.3 4.2L12 3l4.7 7.2L22 6l-1.6 12H3.6L2 6zm2.4 14h15.2v2H4.4v-2z");
        crown.appendChild(crownShape);
        marker.appendChild(crown);
      }
      marker.style.left = (achievement.threshold / total * 100) + "%";
      marker.title = "评满 " + achievement.threshold + " 篇解锁「" + achievement.title + "」";
      marker.setAttribute("aria-hidden", "true");
      track.appendChild(marker);
    });
    slot.appendChild(track);

    var foot = el("div", "rating-progress-foot");
    if (latestUnlocked) {
      var badge = el("button", "rating-progress-achievement-link", "✦ 已解锁 " + unlockedAchievements.length + " 项 · " + latestUnlocked.title);
      badge.type = "button";
      badge.addEventListener("click", function () { showRatingAchievementModal(edition.slug, latestUnlocked); });
      foot.appendChild(badge);
    }
    if (count >= total) {
      foot.appendChild(el("span", null, "本届评议完成 · 幻梦全录已解锁"));
    } else if (nextAchievement) {
      foot.appendChild(el("span", null, "再评 " + (nextAchievement.threshold - count) + " 篇解锁「" + nextAchievement.title + "」"));
    }
    var next = votingOpen(edition.slug) ? firstUnratedWork(edition, progress) : null;
    if (next) {
      var continueLink = el("a", "rating-progress-next", "继续下潜 →");
      continueLink.href = "#/" + edition.slug + "/" + encodeURIComponent(next.slug);
      foot.appendChild(continueLink);
    }
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

  function likesOf(id) {
    return store.likes[id] || {};
  }

  function likeCount(id) {
    return Object.keys(likesOf(id)).length;
  }

  function hasLiked(id) {
    var user = currentUser();
    if (!user) return false;
    return !!likesOf(id)[user.qq];
  }

  function toggleLike(id) {
    if (!canInteract()) return;
    if (USE_CLOUD) {
      return window.MythosCloud.call("toggleLike", { workId: id }).then(
        function () {
          return loadCloudWorkBundle(id, true);
        },
      );
    }
    var bag = Object.assign({}, likesOf(id));
    var user = currentUser();
    if (bag[user.qq]) delete bag[user.qq];
    else bag[user.qq] = true;
    store.likes[id] = bag;
    persist();
    return Promise.resolve();
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
    refreshEditionList: null,
  };

  var refs = {
    layout: document.getElementById("layout"),
    siteBar: document.getElementById("site-bar"),
    siteBrand: document.getElementById("site-brand"),
    siteNav: document.getElementById("site-nav"),
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
    topJump: document.getElementById("top-jump"),
    topGlobalSearch: document.getElementById("top-global-search"),
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
      parts.bar.style.width = percent + "%";
      parts.text.textContent = percent ? "已读约 " + percent + "%" : "开始阅读";
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
    if (refs.themeToggle) {
      refs.themeToggle.textContent = dark ? "☀ 日间" : "☾ 黑夜";
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
      refs.sidebarToggle.textContent = collapsed ? "目录" : "收起";
    } else {
      refs.sidebarToggle.textContent = collapsed ? "目录页" : "‹";
    }
    refs.sidebarToggle.title = collapsed ? "展开目录" : "收起目录";
    if (refs.mobileBarToc) {
      // 手机端目录入口在底部栏里，文案要跟着抽屉状态走
      refs.mobileBarToc.textContent = collapsed ? "☰ 目录" : "✕ 收起";
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

  // 窄屏把「投票区 / 账号 / 主题」收进一个「⋯」下拉菜单，宽屏这些按钮直接平铺
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
    // 向下读时整条收起、向上滚或到顶/到底立刻回来。
    // 这里只切 class，真正的位移交给 780px 媒体查询，桌面端完全不受影响。
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
      var mobile = isMobileLayout();
      var bottom = document.documentElement.scrollHeight - window.innerHeight;
      var retract;
      if (!mobile || y < 80 || y >= bottom - 32) {
        // 到顶、到底、非窄屏：控件必须可见
        retract = false;
      } else if (acc > 24) {
        retract = true;
      } else if (acc < -12) {
        retract = false;
      } else {
        retract = refs.mobileBar.classList.contains("is-hidden");
      }
      refs.mobileBar.classList.toggle("is-hidden", retract);
      if (refs.topTools) refs.topTools.classList.toggle("is-hidden", retract);
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
    // 从手机宽度切回桌面时把状态清干净
    window.addEventListener("resize", function () {
      if (isMobileLayout()) return;
      refs.mobileBar.classList.remove("is-hidden");
      if (refs.topTools) refs.topTools.classList.remove("is-hidden");
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
            window.MythosCloud.logout().then(done).catch(done);
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
  }

  function showAuthGate() {
    if (window.MythosWitch && window.MythosWitch.hideForModal) {
      window.MythosWitch.hideForModal();
    }
    refs.authGate.hidden = false;
    refs.layout.setAttribute("aria-hidden", "true");
    document.body.classList.add("is-authing");
    setTopMenuOpen(false);
    if (refs.topJump) {
      refs.topJump.hidden = true;
      refs.topJump.onclick = null;
    }
    finishBoot();
    renderAuthGate();
  }

  function hideAuthGate() {
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
    card.appendChild(el("h1", "auth-title", "幻梦境档案馆"));
    card.appendChild(
      el(
        "p",
        "auth-sub",
        USE_CLOUD
          ? "已有账号直接登录；第一次使用请注册。访客无需账号。"
          : "离线演示版：账号数据仅保存在本机浏览器。",
      ),
    );
    card.appendChild(
      el(
        "p",
        "auth-security-note",
        "安全提醒：请为本站单独设置密码，不要使用你的 QQ 密码。",
      ),
    );

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

    function appendAuthField(form, labelText, input, id) {
      var field = el("label", "auth-field");
      field.htmlFor = id;
      field.appendChild(el("span", "field-label", labelText));
      input.id = id;
      field.appendChild(input);
      form.appendChild(field);
    }

    function showLogin() {
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
          window.MythosCloud.login(id, pass.value)
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
          window.MythosCloud.sendRegisterCode(id)
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
          window.MythosCloud.sendRegisterCode(state.qq)
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
          window.MythosCloud.register(state.qq, pass.value, nickname, codeValue)
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
          window.MythosCloud.visitor()
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
        window.MythosCloud.call("updateProfile", { nickname: nextNick })
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
        window.MythosCloud.call("updateProfile", { newPass: next })
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
        window.MythosCloud.logout().then(done).catch(done);
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
    if (USE_CLOUD) pushCloudSettings().catch(function (e) { console.error(e); });
  }

  function clearPhaseConfirm(slug) {
    var st = editionState(slug);
    st.phaseAdvance = null;
    store.settings.editions[slug] = st;
    persist();
    if (USE_CLOUD) pushCloudSettings().catch(function (e) { console.error(e); });
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
        togglePhaseConfirm(slug, next);
        openAdminModal();
        route();
      });
      var clearBtn = el("button", "btn-ghost", "清空确认计数");
      clearBtn.type = "button";
      clearBtn.addEventListener("click", function () {
        clearPhaseConfirm(slug);
        openAdminModal();
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
      ? window.MythosCloud.call("adminGetEditionAwardsConfig", {
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
          ? window.MythosCloud.call("adminSaveEditionAwardsConfig", {
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
    window.MythosCloud.call("adminGetReport").then(function (report) {
      var body = el("div", "modal-body");
      var summary = report.summary || {};
      body.appendChild(el("p", "modal-meta", "账号 " + (summary.users || 0) + "（启用 " + (summary.enabledUsers || 0) + "） · 评分 " + (summary.ratings || 0) + " · 评论 " + (summary.comments || 0) + " · 点赞 " + (summary.likes || 0)));
      body.appendChild(el("h3", "modal-sub", "作品评分与热度"));
      var table = el("table", "rank-table");
      var head = el("tr");
      ["作品", "评分", "综合均分", "评论", "点赞"].forEach(function (label) { head.appendChild(el("th", null, label)); });
      var thead = el("thead"); thead.appendChild(head); table.appendChild(thead);
      var tbody = el("tbody");
      (report.workStats || []).slice().sort(function (a, b) { return (b.commentCount + b.likeCount) - (a.commentCount + a.likeCount); }).forEach(function (row) {
        var tr = el("tr");
        [row.workId, row.ratingCount, row.totalAvg == null ? "—" : Number(row.totalAvg).toFixed(2), row.commentCount, row.likeCount].forEach(function (value) { tr.appendChild(el("td", null, String(value))); });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody); body.appendChild(table);
      var tools = el("div", "admin-row");
      function addExport(label, filename, headers, rows) {
        var button = el("button", "btn-ghost", label); button.type = "button";
        button.addEventListener("click", function () { downloadCsv(filename, headers, rows); }); tools.appendChild(button);
      }
      addExport("导出评分明细", "幻梦境-评分明细.csv", ["作品", "评分者QQ", "传录", "档案", "综合", "评分时间"], (report.ratings || []).map(function (r) { return [r.workId, r.qq, r.chuanlu, r.dangan, r.overall, r.t]; }));
      addExport("导出评分汇总", "幻梦境-评分汇总.csv", ["作品", "评分人数", "传录均分", "档案均分", "综合均分", "总平均分", "评论数", "点赞数"], (report.workStats || []).map(function (r) { return [r.workId, r.ratingCount, r.chuanluAvg, r.danganAvg, r.overallAvg, r.totalAvg, r.commentCount, r.likeCount]; }));
      addExport("导出评论明细", "幻梦境-评论明细.csv", ["作品", "QQ", "昵称", "匿名", "评委", "评论", "发表时间", "编辑时间"], (report.comments || []).map(function (r) { return [r.workId, r.qq, r.name, r.anonymous ? "是" : "否", r.judge ? "是" : "否", r.body, r.t, r.editedAt]; }));
      body.appendChild(tools);
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
    window.MythosCloud.call("adminGetSpotlightConfig", {
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
        window.MythosCloud.call("adminSaveSpotlightConfig", {
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
              window.MythosCloud.call("adminSetUserEnabled", {
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
      window.MythosCloud.call("adminGetUsers")
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
      window.MythosCloud.call("adminCreateUser", {
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

    window.MythosCloud.call("getWorkContent", { workId: id })
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
      var preview = el("div", "editor-preview work-body");
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
            window.MythosCloud.call("restoreWorkContent", {
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
        window.MythosCloud.call("saveWorkContent", { workId: id, html: html })
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
        window.MythosCloud.call("resetWorkContent", { workId: id })
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
      var star = el("button", "toc-star", starred ? "★" : "☆");
      star.type = "button";
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
    var list = el("ul", "section-nav-list");
    sections.forEach(function (section) {
      var li = el("li", "section-nav-item level-" + section.level);
      var link = el("button", "section-nav-link", section.title);
      link.type = "button";
      link.dataset.target = section.id;
      link.addEventListener("click", function () {
        smoothScrollToId(section.id);
      });
      li.appendChild(link);
      list.appendChild(li);
    });
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
    var panel = el("section", "panel");
    panel.id = "score-panel";
    panel.appendChild(el("h2", "panel-title", "评分"));
    panel.appendChild(renderPhaseChip(state.editionSlug));

    var edition = findEdition(state.editionSlug);
    if (isArchivedEdition(edition)) {
      panel.appendChild(
        el(
          "p",
          "rate-hint",
          "历史档案已封存，仅供阅读；原届评分与评议数据未随资料迁入。",
        ),
      );
      var archivedProgress = renderRatingProgress(edition, true, id);
      if (archivedProgress) panel.appendChild(archivedProgress);
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
      panel.appendChild(summary);
    } else {
      panel.appendChild(el("p", "rate-hint", "作品均分将在大众评分结束后开放查看。"));
    }

    if (!canInteract()) {
      panel.appendChild(
        el("p", "rate-hint", "访客仅可观看。请使用调查员账号登录后参与。"),
      );
      return panel;
    }

    var ratingProgress = renderRatingProgress(edition, true, id);
    if (ratingProgress) panel.appendChild(ratingProgress);

    if (phase === "征文") {
      var dueHint = phaseDeadlineOf(state.editionSlug, "征文");
      panel.appendChild(
        el(
          "p",
          "rate-hint",
          "当前为创作征文阶段，尚未开放大众评分。" +
            (dueHint ? "征文截止：" + formatTime(dueHint) + "。" : ""),
        ),
      );
    } else if (votingOpen()) {
      panel.appendChild(renderRateForm(id, panel));
    } else if (likesOpen()) {
      panel.appendChild(
        el(
          "p",
          "rate-hint",
          phase === "统计"
            ? "大众评分已结束，进入投票统计。调查员可点赞；管理员可发表评委评论。"
            : "结果公示中。评分通道已关闭，调查员仍可点赞。",
        ),
      );
      panel.appendChild(renderLikeRow(id, panel));
    } else {
      panel.appendChild(el("p", "rate-hint", "当前阶段不可评分。"));
    }
    return panel;
  }

  function renderLikeRow(id, panel) {
    var row = el("div", "like-row");
    var liked = hasLiked(id);
    var btn = el("button", "btn" + (liked ? "" : " btn-ghost"), liked ? "已点赞" : "点赞");
    btn.type = "button";
    btn.addEventListener("click", function () {
      Promise.resolve(toggleLike(id)).then(function () {
        panel.parentNode.replaceChild(renderScorePanel(id), panel);
      });
    });
    row.appendChild(btn);
    row.appendChild(el("span", "rate-hint", likeCount(id) + " 人点赞"));
    return row;
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

    DIMENSIONS.forEach(function (dim) {
      var row = el("div", "rate-row");
      row.appendChild(el("span", "rate-name", dim.label));
      var scale = el("div", "rate-scale");
      scale.setAttribute("role", "group");
      scale.setAttribute("aria-label", dim.label + "评分，1 到 5 星");
      buttons[dim.key] = [];

      function refreshScale(visibleValue) {
        buttons[dim.key].forEach(function (node, index) {
          var value = index + 1;
          node.dataset.filled = value <= visibleValue ? "true" : "false";
          node.setAttribute("aria-pressed", draft[dim.key] === value ? "true" : "false");
        });
      }

      for (var score = 1; score <= 5; score++) {
        (function (value) {
          var star = el("button", "rate-star", "★");
          star.type = "button";
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
      wrap.appendChild(row);
    });

    function isComplete() {
      return DIMENSIONS.every(function (dim) {
        return draft[dim.key] >= 1;
      });
    }
    function hintText() {
      if (!isComplete()) return "三项都选好后即可提交。";
      return existing ? "你已评过分，提交将覆盖上次结果。" : "";
    }

    var actions = el("div", "rate-actions");
    var submit = el("button", "btn", existing ? "更新我的评分" : "提交评分");
    submit.type = "button";
    submit.disabled = !isComplete();
    var hint = el("span", "rate-hint", hintText());
    submit.addEventListener("click", function () {
      if (!isComplete() || !canInteract() || !votingOpen()) return;
      var user = currentUser();
      if (USE_CLOUD) {
        var ratingSubmitted = false;
        submit.disabled = true;
        window.MythosCloud.call("submitRating", {
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
      judgeComments.forEach(function (comment) {
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

    if (!showList.length && !(showJudgeBox() && judgeComments.length)) {
      panel.appendChild(el("p", "comment-empty", "还没有评论。"));
    } else if (showList.length) {
      var ul = el("ul", "comment-list");
      showList.forEach(function (comment) {
        ul.appendChild(renderCommentItem(comment, id, panel, false));
      });
      panel.appendChild(ul);
    }
    return panel;
  }

  function renderCommentItem(comment, id, panel, inJudgeBox) {
    var li = el(
      inJudgeBox ? "div" : "li",
      inJudgeBox ? "judge-item" : "comment-item",
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
    var canEdit = isAdmin() || (user && comment.qq && comment.qq === user.qq);
    var bodyNode = el("p", "comment-body", comment.body);

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
          window.MythosCloud.call("updateComment", { id: comment.id, body: next })
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
          window.MythosCloud.call("deleteComment", { id: comment.id })
            .then(afterCommentChange)
            .catch(function (e) {
              alert(e.message || String(e));
            });
          return;
        }
        store.comments[id] = commentsOf(id).filter(function (item) {
          return item.id !== comment.id;
        });
        persist();
        panel.parentNode.replaceChild(renderCommentPanel(id), panel);
      });
      head.appendChild(del);
    }
    li.appendChild(head);
    li.appendChild(bodyNode);
    return li;
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
        window.MythosCloud.call("addComment", {
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

  function renderResults(edition) {
    stopReadingTracking();
    if (sectionObserver) {
      sectionObserver.disconnect();
      sectionObserver = null;
    }
    hideHud();
    clear(refs.content);
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
    sheet.appendChild(el("h1", "intro-title", "投票公示 · " + edition.shortName));
    sheet.appendChild(renderPhaseChip(edition.slug));
    var resultIntro = isPublicPhase(edition.slug)
      ? "结果公示。下列为综合均分排名与分数分布。"
      : "本届尚未进入结果公示。管理员可在管理面板双人确认推进阶段；下列为当前实时数据预览。";
    if (awardResult && awardResult.published && isPublicPhase(edition.slug)) {
      resultIntro += awardResult.authorRevealRankLimit
        ? "前 " + awardResult.authorRevealRankLimit + " 名及特别奖作品公开作者，其余作品匿名。"
        : "特别奖作品公开作者，其余作品匿名。";
    }
    sheet.appendChild(
      el("p", "intro-text", resultIntro),
    );

    var insight = cloudInsights[edition.slug] || null;
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
          var tr = el("tr");
          var values = [row.rank, String(work.no).padStart(2, "0"), work.title];
          if (awardResult && awardResult.published) {
            values.push((awardResult.authorReveals || {})[row.workId] || "匿名");
          }
          values.push(Number(row.totalAvg).toFixed(2), row.ratingCount);
          values.forEach(function (value) { tr.appendChild(el("td", null, String(value))); });
          publicBody.appendChild(tr);
        });
        publicTable.appendChild(publicBody); sheet.appendChild(publicTable);
      }
      renderSpecialAwardsSection(sheet, edition, awardResult);
      var heat = (insight && insight.heat) || [];
      if (heat.length) {
        sheet.appendChild(el("h2", "panel-title", "作品热度"));
        sheet.appendChild(el("p", "rate-hint", heat.slice().sort(function (a, b) { return (b.commentCount + b.likeCount) - (a.commentCount + a.likeCount); }).slice(0, 5).map(function (row) {
          var work = edition.works.filter(function (item) { return workId(edition.slug, item.slug) === row.workId; })[0];
          return (work ? work.title : row.workId) + "：" + row.commentCount + " 条评论，" + row.likeCount + " 个点赞";
        }).join("；")));
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
      var tr = el("tr");
      tr.appendChild(el("td", null, String(canonicalRanks[row.id] || (insight && insight.rankingsAvailable ? "—" : index + 1))));
      tr.appendChild(el("td", null, String(row.work.no).padStart(2, "0")));
      var titleCell = el("td");
      var link = el("button", "linkish", row.work.title);
      link.type = "button";
      link.addEventListener("click", function () {
        location.hash =
          "#/" + edition.slug + "/" + encodeURIComponent(row.work.slug);
      });
      titleCell.appendChild(link);
      tr.appendChild(titleCell);
      if (awardResult && awardResult.published) {
        tr.appendChild(
          el("td", null, (awardResult.authorReveals || {})[row.id] || "匿名"),
        );
      }
      DIMENSIONS.forEach(function (dim) {
        var v = row.stats[dim.key];
        tr.appendChild(el("td", null, v == null ? "—" : v.toFixed(2)));
      });
      if (isAdmin()) tr.appendChild(el("td", null, String(row.stats.count)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    sheet.appendChild(table);
    renderSpecialAwardsSection(sheet, edition, awardResult);

    sheet.appendChild(el("h2", "panel-title", "综合分分布（全作品合计）"));
    var globalBins = [0, 0, 0, 0, 0];
    ranked.forEach(function (row) {
      var bins = scoreDistribution(row.id, "overall");
      for (var i = 0; i < 5; i++) globalBins[i] += bins[i];
    });
    sheet.appendChild(renderPieBlock("综合", globalBins));

    sheet.appendChild(el("h2", "panel-title", "分项分布（按作品展开前三名）"));
    ranked.slice(0, 3).forEach(function (row) {
      var block = el("div", "result-work");
      block.appendChild(
        el(
          "h3",
          "modal-sub",
          String(row.work.no).padStart(2, "0") + " " + row.work.title,
        ),
      );
      var grid = el("div", "pie-grid");
      DIMENSIONS.forEach(function (dim) {
        grid.appendChild(
          renderPieBlock(dim.label, scoreDistribution(row.id, dim.key)),
        );
      });
      block.appendChild(grid);
      sheet.appendChild(block);
    });

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
        window.MythosCloud.logout().then(done).catch(done);
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
    var url = new URL(window.location.href);
    url.pathname = "/" + encodeURIComponent(edition.slug) + "/" + displayWorkNo(work);
    url.search = "";
    url.hash = "";
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

  function openGlobalSearchModal() {
    var body = el("div", "modal-body global-search-body");
    var form = el("form", "global-search-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });
    var input = el("input", "global-search-input");
    input.type = "search";
    input.placeholder = "搜索标题、作者、编号或届别";
    input.setAttribute("aria-label", "全馆搜索");
    input.autocomplete = "off";
    form.appendChild(input);
    body.appendChild(form);
    var hint = el("p", "global-search-hint", "输入关键词，搜索所有届次的标题、作者、编号与阶段。");
    body.appendChild(hint);
    var suggestionsNode = el("div", "global-search-suggestions");
    suggestionsNode.setAttribute("aria-label", "搜索范围快捷项");
    body.appendChild(suggestionsNode);
    var resultsNode = el("div", "global-search-results");
    resultsNode.setAttribute("role", "list");
    body.appendChild(resultsNode);
    var emptySearchTimer = null;
    var emptySearchAnnounced = false;

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
        if (refs.modalRoot.hidden) return;
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
          closeModal();
        });
        resultsNode.appendChild(link);
      });
    }

    input.addEventListener("input", paint);
    paint();
    openModal("全馆搜索", body);
    window.requestAnimationFrame(function () {
      input.focus();
    });
  }

  function initGlobalSearchShortcuts() {
    document.addEventListener("keydown", function (event) {
      var target = event.target;
      var tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || (target && target.isContentEditable)) return;
      var key = String(event.key || "").toLowerCase();
      if (key === "/" || (key === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        openGlobalSearchModal();
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
            openGlobalSearchModal();
            return;
          }
          location.hash = "#/";
          window.setTimeout(function () {
            smoothScrollToId(nav === "archive" ? "home-archive" : "home-spotlight");
          }, 0);
        });
      });
    }
    if (refs.topGlobalSearch) {
      refs.topGlobalSearch.addEventListener("click", function () {
        openGlobalSearchModal();
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
      row.appendChild(el("span", "catalogue-preview-author", work.author));
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function renderArchiveVolumes() {
    var section = el("section", "home-section archive-section");
    section.id = "home-archive";
    section.appendChild(el("div", "home-eyebrow", "PERMANENT ARCHIVE"));
    section.appendChild(el("h2", "home-section-title", "历届档案"));
    var list = el("div", "archive-volume-list");
    editions.forEach(function (edition) {
      var info = volumeInfo(edition);
      var row = el("a", "archive-volume-row");
      row.href = "#/" + edition.slug;
      row.appendChild(el("span", "archive-volume-year", String(edition.year)));
      var main = el("span", "archive-volume-main");
      main.appendChild(el("strong", null, edition.name || edition.shortName));
      var status = isArchivedEdition(edition)
        ? "已封存 · " + edition.works.length + " 篇"
        : edition.works.length
          ? phaseLabel(phaseOf(edition.slug)) + " · " + edition.works.length + " 篇"
          : "已封存 · 待补充";
      main.appendChild(el("small", null, (info.roman ? "VOLUME " + info.roman + " · " : "") + status));
      row.appendChild(main);
      list.appendChild(row);
    });
    section.appendChild(list);
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
    hero.appendChild(heroMain);

    var heroState = el("aside", "home-state");
    var phaseLine = el("div", "home-phase-line");
    phaseLine.appendChild(el("span", null, "● " + editionStatusLabel(edition)));
    var due = isArchivedEdition(edition) ? "" : phaseDeadlineOf(edition.slug, st.phase);
    phaseLine.appendChild(el("span", null, due ? formatShortDate(due) + " 截止" : "阶段进行中"));
    heroState.appendChild(phaseLine);
    var timeline = renderPhaseTimeline(edition.slug);
    if (timeline) heroState.appendChild(timeline);
    var ratingProgress = renderRatingProgress(edition, false);
    if (ratingProgress) heroState.appendChild(ratingProgress);
    var stats = el("dl", "home-stats");
    var countCell = el("div");
    countCell.appendChild(el("dt", null, "收录"));
    countCell.appendChild(el("dd", null, edition.works.length + " 篇"));
    var phaseCell = el("div");
    phaseCell.appendChild(el("dt", null, "当前阶段"));
    phaseCell.appendChild(el("dd", null, editionStatusLabel(edition)));
    stats.appendChild(countCell);
    stats.appendChild(phaseCell);
    heroState.appendChild(stats);
    var enter = el("a", "text-link home-text-link", "进入本届目录");
    enter.href = "#/" + edition.slug;
    enter.appendChild(el("span", null, "→"));
    heroState.appendChild(enter);
    var resume = renderResumeLink();
    if (resume) heroState.appendChild(resume);
    hero.appendChild(heroState);
    shell.appendChild(hero);

    var spotlight = createSpotlightSection(edition);
    shell.appendChild(spotlight);
    shell.appendChild(renderHomeCataloguePreview(edition));
    shell.appendChild(renderArchiveVolumes());
    var footer = el("footer", "home-footer");
    footer.appendChild(el("span", null, "幻梦境档案馆 · 持续收录、评议与封存"));
    footer.appendChild(el("span", null, "档案首页"));
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
    state.refreshEditionList = null;
    state.onlyUnrated = false;
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
    var head = el("section", "edition-overview-head");
    var info = volumeInfo(edition);
    head.appendChild(el("div", "home-eyebrow", "VOLUME " + (info.roman || edition.year) + " · CATALOGUE"));
    head.appendChild(el("h1", "home-title", edition.name || edition.shortName));
    if (edition.intro) head.appendChild(el("p", "home-intro edition-intro", edition.intro));
    var timeline = renderPhaseTimeline(edition.slug);
    if (timeline) head.appendChild(timeline);
    var headTools = el("div", "edition-head-tools");
    headTools.appendChild(renderPhaseChip(edition.slug));
    var back = el("a", "btn-ghost", "返回首页");
    back.href = "#/";
    headTools.appendChild(back);
    head.appendChild(headTools);
    shell.appendChild(head);
    var ratingProgress = renderRatingProgress(edition, false);
    if (ratingProgress) shell.appendChild(ratingProgress);

    var controls = el("div", "edition-controls");
    var search = el("input", "edition-search");
    search.type = "search";
    search.placeholder = "搜索标题或编号";
    search.value = state.keyword;
    search.setAttribute("aria-label", "搜索本届作品");
    controls.appendChild(search);
    var hint = el("span", "edition-count-hint");
    controls.appendChild(hint);
    var filterUnrated = null;
    if (ratingProgressAvailable(edition)) {
      filterUnrated = el("button", "btn-ghost btn-tiny edition-unrated-filter", "只看未评");
      filterUnrated.type = "button";
      filterUnrated.disabled = !canInteract();
      filterUnrated.setAttribute("aria-pressed", "false");
      controls.appendChild(filterUnrated);
    }
    shell.appendChild(controls);

    var list = el("div", "edition-index");
    shell.appendChild(list);
    function paint() {
      clear(list);
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
        return !needle || workSearchText(work).indexOf(needle) !== -1;
      });
      hint.textContent = (state.onlyUnrated ? "只看未评 · " : "显示 ") + shown.length + " / " + edition.works.length + " 篇";
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
        var star = el("button", "edition-index-star", isStarred(edition.slug, work.slug) ? "★" : "☆");
        star.type = "button";
        star.disabled = !canInteract();
        star.title = canInteract() ? "标星置顶" : "登录后可收藏";
        star.addEventListener("click", function () {
          toggleStar(edition.slug, work.slug);
          paint();
          renderToc();
        });
        row.appendChild(star);
        row.appendChild(el("span", "edition-index-no", String(work.no).padStart(3, "0")));
        var title = el("button", "edition-index-title", work.title);
        title.type = "button";
        title.addEventListener("click", function () {
          location.hash = "#/" + edition.slug + "/" + encodeURIComponent(work.slug);
        });
        row.appendChild(title);
        var isRated = ratedIds.indexOf(workId(edition.slug, work.slug)) !== -1;
        if (isRated) row.appendChild(el("span", "edition-index-rated", "已评"));
        row.dataset.workId = workId(edition.slug, work.slug);
        row.appendChild(el("span", "edition-index-author", work.author));
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
    var likeCell = el("div", "public-stat-cell");
    likeCell.appendChild(el("div", "score-label", "点赞"));
    likeCell.appendChild(el("div", "score-value", String(likeCount(id))));
    grid.appendChild(likeCell);
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

  function renderWork(edition, work) {
    clear(refs.content);
    state.refreshEditionList = null;
    var id = workId(edition.slug, work.slug);
    recordReadingOpen(edition, work);
    if (window.MythosWitch && window.MythosWitch.recordArticleOpen) {
      window.MythosWitch.recordArticleOpen(id);
    }
    var pendingScoreJump = false;
    var paintedContent = null;

    function jumpToScore(sheet) {
      pendingScoreJump = true;
      var target = sheet.querySelector("#score-panel");
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

      // 档案编号：编号本身就是视觉资产，单独成行
      var fileNo = el("p", "work-fileno");
      fileNo.appendChild(el("span", "work-fileno-vol", edition.year + " 卷"));
      fileNo.appendChild(el("span", "work-fileno-slash", "/"));
      fileNo.appendChild(
        el("span", "work-fileno-no", String(work.no).padStart(3, "0")),
      );
      head.appendChild(fileNo);

      head.appendChild(el("h1", "work-title", work.title));

      var revealedAuthor = revealedAuthorName(edition.slug, id);
      var anonymous = isAnonymousAuthor(work) && !revealedAuthor;
      var meta = el("p", "work-meta");
      meta.appendChild(el("span", "work-meta-author", revealedAuthor || work.author || "未见署名"));
      meta.appendChild(el("span", "work-meta-sep", "·"));
      meta.appendChild(
        el(
          "span",
          "work-meta-chars",
          "约 " +
            (contentOverride
              ? charsFromHtml(contentOverride.html)
              : work.chars) +
            " 字",
        ),
      );
      if (effectiveAuthorQQ(id, work)) {
        meta.appendChild(el("span", "work-meta-sep", "·"));
        meta.appendChild(el("span", "work-meta-qq", "作者 QQ 已绑定"));
      }
      head.appendChild(meta);

      if (anonymous) {
        var publicAwards = editionAwardsData(edition.slug);
        var wasAwarded =
          publicAwards &&
          publicAwards.published &&
          Array.isArray(publicAwards.awardedWorkIds) &&
          publicAwards.awardedWorkIds.indexOf(id) !== -1;
        head.appendChild(
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

      head.appendChild(renderProvenance(edition));
      var spotlightInfo = spotlightForWork(spotlightCache[edition.slug], edition);
      var spotlightNote = el("p", "work-spotlight-note");
      if (spotlightInfo && spotlightInfo.date) {
        spotlightNote.textContent = "今日聚光 · " + formatShortDate(spotlightInfo.date);
      } else {
        spotlightNote.hidden = true;
      }
      head.appendChild(spotlightNote);
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
      head.appendChild(readingProgress);
      var jumpRow = el("div", "work-jump-row");
      var shareButton = el("button", "btn-ghost work-jump-btn", "分享档案");
      shareButton.type = "button";
      shareButton.setAttribute("aria-label", "分享当前档案");
      shareButton.addEventListener("click", function () {
        shareWork(edition, work);
      });
      jumpRow.appendChild(shareButton);
      var jumpButton = el(
        "button",
        "btn-ghost work-jump-btn jump-to-score",
        "↓ 跳到投票区",
      );
      jumpButton.type = "button";
      jumpButton.setAttribute("aria-label", "跳到文章底部评分区");
      jumpButton.addEventListener("click", function () {
        jumpToScore(sheet);
      });
      jumpRow.appendChild(jumpButton);
      if (isAdmin() && USE_CLOUD) {
        var editBody = el("button", "btn-ghost work-jump-btn", "编辑正文");
        editBody.type = "button";
        editBody.setAttribute("aria-label", "管理员编辑这篇正文");
        editBody.addEventListener("click", function () {
          openWorkEditor(id, work);
        });
        jumpRow.appendChild(editBody);
      }
      head.appendChild(jumpRow);
      sheet.appendChild(head);

      var body = el("div", "work-body");
      if (contentOverride && contentOverride.html) {
        body.innerHTML = contentOverride.html;
      } else if (USE_CLOUD) {
        body.appendChild(
          el("p", "work-body-loading", "正在从档案库调取正文…"),
        );
      } else {
        body.innerHTML = work.html || "";
      }
      sheet.appendChild(body);
      var authorNote = renderAuthorNotePanel(id, work);
      if (authorNote) sheet.appendChild(authorNote);
      sheet.appendChild(renderScorePanel(id));
      if (isPublicPhase(edition.slug)) {
        sheet.appendChild(renderWorkPublicStats(id, work));
      }
      sheet.appendChild(renderCommentPanel(id));
      frame.appendChild(sheet);

      var sectionNav = renderSectionNav(sections);
      if (sectionNav) frame.appendChild(sectionNav);

      clear(refs.content);
      refs.content.appendChild(frame);
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
          getValue: null,
        },
        !preserveScroll,
      );
      if (pendingScoreJump) {
        window.requestAnimationFrame(function () {
          var target = sheet.querySelector("#score-panel");
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

  function fillHudButton(button, arrow, title) {
    clear(button);
    button.appendChild(el("span", "hud-arrow", arrow));
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
    fillHudButton(refs.hudPrev, "‹", prev ? prev.title : "");
    refs.hudPrev.onclick = prev
      ? function () {
          location.hash =
            "#/" + edition.slug + "/" + encodeURIComponent(prev.slug);
        }
      : null;
    bindPrefetchIntent(refs.hudPrev, edition, prev);
    refs.hudNext.disabled = !next;
    refs.hudNext.title = next ? "下一篇：" + next.title : "";
    fillHudButton(refs.hudNext, "›", next ? next.title : "");
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

  function route() {
    if (!isLoggedIn()) {
      showAuthGate();
      return;
    }
    state.refreshEditionList = null;
    refreshChrome();
    setTopMenuOpen(false);
    // 「跳到投票区」只在作品页有意义：先收起来，由 renderWork 重新点亮
    if (refs.topJump) {
      refs.topJump.hidden = true;
      refs.topJump.onclick = null;
    }

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
      state.view = "results";
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
      setLayoutMode("reader");
      renderToc();
      renderWork(edition, work);
      updateWitchContext();
    } else {
      state.view = "edition";
      renderEditionOverview(edition);
      updateWitchContext();
    }
  }

  /* ---------- 启动 ---------- */

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

  ensureAdminSeed()
    .then(function () {
      if (USE_CLOUD) return cloudBootstrap();
      return null;
    })
    .then(function () {
      if (!isLoggedIn()) showAuthGate();
      else hideAuthGate();
    })
    .catch(function (err) {
      console.error(err);
      finishBoot();
      clear(refs.content);
      refs.content.appendChild(
        el(
          "p",
          "toc-empty",
          "初始化失败：" + (err && err.message ? err.message : String(err)),
        ),
      );
      showAuthGate();
    });
})();
