/**
 * 幻梦境档案馆 · 自托管 Node.js + SQLite API 服务
 * 兼容原 CloudBase HTTP API 动作契约
 */
const http = require("node:http");
const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const dns = require("node:dns");

// 本机解析 smtp.qq.com 会优先拿到 IPv6，而该链路 TLS 握手成功却不返回任何数据，
// 会把发信请求挂死。统一改成 IPv4 优先。
try {
  dns.setDefaultResultOrder("ipv4first");
} catch (e) {
  /* 旧版本 Node 不支持时忽略 */
}

// 原生内置 SQLite（Node 24+ 标准库）
const { DatabaseSync } = require("node:sqlite");
class SQLiteAdapter {
  constructor(dbPath) {
    this.sync = new DatabaseSync(dbPath);
  }
  exec(sql) {
    return this.sync.exec(sql);
  }
  prepare(sql) {
    const stmt = this.sync.prepare(sql);
    return {
      run: (...args) => stmt.run(...args),
      get: (...args) => stmt.get(...args),
      all: (...args) => stmt.all(...args),
    };
  }
  close() {
    return this.sync.close();
  }
}
const DatabaseConstructor = SQLiteAdapter;

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = "127.0.0.1";
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "dreamland.db");
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const BODY_MAX = 2000;
const AUTHOR_NOTE_MAX = 2000;
const NAME_MAX = 20;

// 注册验证码参数
const CODE_TTL_MS = Math.max(1, parseInt(process.env.CODE_TTL_MINUTES || "10", 10)) * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_RESEND_COOLDOWN_MS = Math.max(1, parseInt(process.env.CODE_RESEND_SECONDS || "60", 10)) * 1000;
const CODE_SEND_PER_QQ_HOUR = 5;
const CODE_SEND_PER_IP_MINUTE = 5;
const CODE_SEND_PER_IP_HOUR = 30;
const CODE_SEND_GLOBAL_DAILY = Math.max(1, parseInt(process.env.SMTP_DAILY_LIMIT || "200", 10));
const VERIFY_RETENTION_MS = 24 * 3600 * 1000;

// 正文在线编辑
const WORK_BODY_MAX = 300000;
const WORK_HISTORY_KEEP = 5;

// 首页聚光：推荐结果只落在当天记录表里，前台永远只读公开字段。
const SPOTLIGHT_MODES = ["hybrid", "manual", "automatic"];
const SPOTLIGHT_LABELS = ["今日选读", "待更多评议", "今日聚光"];
const SPOTLIGHT_MIN_COUNT = 1;
const SPOTLIGHT_DEFAULT_COUNT = 3;
const SPOTLIGHT_MAX_COUNT = 5;
const SPOTLIGHT_DEFAULT_TIMEZONE = "Asia/Hong_Kong";
const CATALOGUE_MANIFEST_PATH = path.join(__dirname, "catalogue.json");

// SMTP 配置只读环境变量：授权码绝不写入源码、日志或仓库
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || "smtp.qq.com",
  port: parseInt(process.env.SMTP_PORT || "465", 10),
  secure: String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false",
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  fromName: process.env.SMTP_FROM_NAME || "幻梦境档案馆",
};

function getInitialAdminQQs() {
  const env = process.env.ADMIN_QQ || "";
  const list = env
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length
    ? list
    : ["3376909263", "346274695", "2113155803", "550475568"];
}

// 确保目录存在
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseConstructor(DB_PATH);

// 初始化表结构
db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    qq TEXT PRIMARY KEY,
    pass TEXT NOT NULL,
    nickname TEXT NOT NULL,
    role TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    qq TEXT NOT NULL,
    role TEXT NOT NULL,
    exp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY,
    workId TEXT NOT NULL,
    qq TEXT NOT NULL,
    chuanlu INTEGER NOT NULL,
    dangan INTEGER NOT NULL,
    overall INTEGER NOT NULL,
    t TEXT NOT NULL,
    UNIQUE(workId, qq)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    workId TEXT NOT NULL,
    qq TEXT NOT NULL,
    name TEXT NOT NULL,
    anonymous INTEGER NOT NULL DEFAULT 0,
    judge INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL,
    t TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stars (
    id TEXT PRIMARY KEY,
    qq TEXT NOT NULL,
    editionSlug TEXT NOT NULL,
    slugs TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    workId TEXT NOT NULL,
    qq TEXT NOT NULL,
    t TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS author_notes (
    workId TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    qq TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    id TEXT PRIMARY KEY,
    qq TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    verify_attempts INTEGER NOT NULL DEFAULT 0,
    request_ip TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_email_verifications_qq
    ON email_verifications(qq);

  CREATE INDEX IF NOT EXISTS idx_email_verifications_created
    ON email_verifications(created_at);

  CREATE TABLE IF NOT EXISTS work_content (
    workId TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    qq TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS work_content_history (
    id TEXT PRIMARY KEY,
    workId TEXT NOT NULL,
    body TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    qq TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_work_content_history_work
    ON work_content_history(workId);

  -- 聚合报表与届别洞察按作品前缀筛选；这些索引避免每次都扫完整表。
  CREATE INDEX IF NOT EXISTS idx_ratings_work_aggregate
    ON ratings(workId);

  CREATE INDEX IF NOT EXISTS idx_comments_work_aggregate
    ON comments(workId, t);

  CREATE INDEX IF NOT EXISTS idx_likes_work_aggregate
    ON likes(workId, t);

  CREATE TABLE IF NOT EXISTS spotlight_daily (
    editionSlug TEXT NOT NULL,
    date TEXT NOT NULL,
    position INTEGER NOT NULL,
    workId TEXT NOT NULL,
    source TEXT NOT NULL,
    publicLabel TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (editionSlug, date, position),
    UNIQUE (editionSlug, date, workId)
  );

  CREATE INDEX IF NOT EXISTS idx_spotlight_daily_work
    ON spotlight_daily(editionSlug, workId, date);
`);

// 旧库补列：评论的编辑时间（用于显示"已编辑"）
(function migrateCommentEditedAt() {
  const cols = db.prepare("PRAGMA table_info(comments)").all();
  const hasEdited = cols.some(function (c) {
    return c.name === "editedAt";
  });
  if (!hasEdited) db.exec("ALTER TABLE comments ADD COLUMN editedAt TEXT");
})();

// 密码加密（使用标准 scrypt）
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const key = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(hash, "hex");
  if (key.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(key, keyBuf);
}

// 6 位验证码用裸哈希可被瞬间穷举，这里同样加盐 scrypt
function hashCode(code) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(code), salt, 32).toString("hex");
  return salt + ":" + hash;
}

function verifyCode(code, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const parts = stored.split(":");
  const salt = parts[0];
  const key = crypto.scryptSync(String(code), salt, 32);
  const keyBuf = Buffer.from(parts[1], "hex");
  if (key.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(key, keyBuf);
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

function defaultSettings() {
  return {
    allowVisitor: true,
    allowMemberLogin: true,
    registrationOpen: true,
    memberDirectory: [],
    adminDirectory: getInitialAdminQQs(),
    editions: {},
    authorBindings: {},
    spotlight: { editions: {} },
  };
}

function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("main");
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (!Array.isArray(parsed.adminDirectory)) parsed.adminDirectory = [];
      if (!parsed.spotlight || typeof parsed.spotlight !== "object") {
        parsed.spotlight = { editions: {} };
      }
      if (!parsed.spotlight.editions || typeof parsed.spotlight.editions !== "object") {
        parsed.spotlight.editions = {};
      }
      const envAdmins = getInitialAdminQQs();
      for (const a of envAdmins) {
        if (!parsed.adminDirectory.includes(a)) {
          parsed.adminDirectory.push(a);
        }
      }
      return parsed;
    } catch (e) {
      /* fallthrough */
    }
  }
  const def = defaultSettings();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("main", JSON.stringify(def));
  return def;
}

function saveSettings(settings) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run("main", JSON.stringify(settings));
}

function resolveRole(settings, qq) {
  const admins = settings.adminDirectory || [];
  if (admins.indexOf(qq) !== -1) return "admin";
  return "member";
}

function isAllowedRegister(settings, qq) {
  const members = settings.memberDirectory || [];
  const admins = settings.adminDirectory || [];
  return members.indexOf(qq) !== -1 || admins.indexOf(qq) !== -1;
}

function getUser(qq) {
  const row = db.prepare("SELECT qq, pass, nickname, role, enabled, createdAt FROM users WHERE qq = ?").get(qq);
  if (!row) return null;
  return {
    qq: row.qq,
    pass: row.pass,
    nickname: row.nickname,
    role: row.role,
    enabled: !!row.enabled,
    createdAt: row.createdAt,
  };
}

function putUser(user) {
  db.prepare(`
    INSERT INTO users (qq, pass, nickname, role, enabled, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(qq) DO UPDATE SET
      pass = excluded.pass,
      nickname = excluded.nickname,
      role = excluded.role,
      enabled = excluded.enabled
  `).run(user.qq, user.pass, user.nickname, user.role, user.enabled ? 1 : 0, user.createdAt);
}

function publicUser(user) {
  if (!user) return null;
  return {
    qq: user.qq,
    nickname: user.nickname,
    role: user.role,
    enabled: !!user.enabled,
  };
}

function saveToken(token, qq, role) {
  const exp = Date.now() + TOKEN_TTL_MS;
  db.prepare("INSERT OR REPLACE INTO tokens (token, qq, role, exp) VALUES (?, ?, ?, ?)").run(token, qq, role, exp);
}

function authFromHeader(authHeader, settings) {
  const raw = String(authHeader || "").trim();
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { session: null, user: null, settings };
  if (token === "visitor") {
    return { session: { role: "visitor" }, user: null, settings };
  }
  const row = db.prepare("SELECT token, qq, role, exp FROM tokens WHERE token = ?").get(token);
  if (!row || row.exp < Date.now()) {
    if (row) db.prepare("DELETE FROM tokens WHERE token = ?").run(token);
    return { session: null, user: null, settings };
  }
  const user = getUser(row.qq);
  if (!user || !user.enabled) {
    return { session: null, user: null, settings };
  }
  const role = resolveRole(settings, user.qq);
  if (user.role !== role) {
    user.role = role;
    putUser(user);
  }
  return {
    session: { role, qq: user.qq, token },
    user,
    settings,
  };
}

function editionState(settings, slug) {
  if (!settings.editions) settings.editions = {};
  if (!settings.editions[slug]) {
    settings.editions[slug] = {
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
  const st = settings.editions[slug];
  if (!st.deadlines || typeof st.deadlines !== "object") st.deadlines = {};
  ["征文", "评分", "统计", "公示"].forEach(function (key) {
    if (st.deadlines[key] == null) st.deadlines[key] = "";
  });
  if (st.voteDeadline && !st.deadlines["评分"]) {
    st.deadlines["评分"] = st.voteDeadline;
  }
  return st;
}

/* ---------- 首页聚光灯 ---------- */

function readCatalogueManifest() {
  try {
    if (!fs.existsSync(CATALOGUE_MANIFEST_PATH)) return {};
    const raw = JSON.parse(fs.readFileSync(CATALOGUE_MANIFEST_PATH, "utf8"));
    return raw && raw.editions && typeof raw.editions === "object"
      ? raw.editions
      : raw && typeof raw === "object"
        ? raw
        : {};
  } catch (e) {
    console.error("[spotlight] 读取 catalogue.json 失败：" + (e.message || e));
    return {};
  }
}

function manifestCatalogueIds(editionSlug) {
  const manifest = readCatalogueManifest();
  const list = Array.isArray(manifest[editionSlug]) ? manifest[editionSlug] : [];
  return Array.from(
    new Set(
      list.filter(
        (id) =>
          typeof id === "string" &&
          id.indexOf(editionSlug + "/") === 0,
      ),
    ),
  );
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function dateKeyInTimezone(date, timezone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || SPOTLIGHT_DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  } catch (e) {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SPOTLIGHT_DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  }
  const map = {};
  parts.forEach((part) => {
    if (part.type !== "literal") map[part.type] = part.value;
  });
  return map.year + "-" + map.month + "-" + map.day;
}

function shiftDateKey(dateKey, days) {
  const date = new Date(String(dateKey) + "T00:00:00Z");
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function validSpotlightIds(editionSlug, supplied) {
  const manifestIds = manifestCatalogueIds(editionSlug);
  const source = Array.isArray(supplied)
    ? supplied
    : manifestIds;
  const manifestSet = new Set(manifestIds);
  const result = [];
  source.forEach((id) => {
    if (typeof id !== "string") return;
    if (id.indexOf(editionSlug + "/") !== 0) return;
    if (manifestIds.length && !manifestSet.has(id)) return;
    if (result.indexOf(id) === -1) result.push(id);
  });
  return result;
}

function normalizeSpotlightCount(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return SPOTLIGHT_DEFAULT_COUNT;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return SPOTLIGHT_DEFAULT_COUNT;
  return Math.max(
    SPOTLIGHT_MIN_COUNT,
    Math.min(SPOTLIGHT_MAX_COUNT, Math.floor(parsed)),
  );
}

function normalizeSpotlightSchedule(raw, editionSlug, catalogueIds) {
  const source = raw && typeof raw === "object" ? raw : {};
  const allowed = new Set(catalogueIds);
  const out = {};
  Object.keys(source).forEach((date) => {
    if (!validDateKey(date) || !Array.isArray(source[date])) return;
    const seen = new Set();
    const entries = [];
    source[date].slice(0, SPOTLIGHT_MAX_COUNT).forEach((item) => {
      const workId =
        item && typeof item === "object" ? String(item.workId || "") : String(item || "");
      if (!allowed.has(workId) || seen.has(workId)) return;
      seen.add(workId);
      const requestedLabel =
        item && typeof item === "object" ? String(item.publicLabel || "") : "";
      entries.push({
        workId,
        publicLabel: SPOTLIGHT_LABELS.indexOf(requestedLabel) !== -1
          ? requestedLabel
          : "今日选读",
        note:
          item && typeof item === "object"
            ? String(item.note || "").slice(0, 200)
            : "",
      });
    });
    if (entries.length) out[date] = entries;
  });
  return out;
}

function defaultSpotlightConfig(editionSlug, suppliedIds) {
  const catalogueWorkIds = validSpotlightIds(editionSlug, suppliedIds);
  return {
    enabled: true,
    mode: "hybrid",
    dailyCount: SPOTLIGHT_DEFAULT_COUNT,
    ratingThreshold: 5,
    cooldownDays: 7,
    timezone: SPOTLIGHT_DEFAULT_TIMEZONE,
    catalogueWorkIds,
    manualSchedule: {},
  };
}

function normalizeSpotlightConfig(raw, editionSlug, suppliedIds) {
  const source = raw && typeof raw === "object" ? raw : {};
  const ids = validSpotlightIds(
    editionSlug,
    suppliedIds !== undefined
      ? suppliedIds
      : Array.isArray(source.catalogueWorkIds)
        ? source.catalogueWorkIds
        : undefined,
  );
  let timezone = String(source.timezone || SPOTLIGHT_DEFAULT_TIMEZONE);
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format();
  } catch (e) {
    timezone = SPOTLIGHT_DEFAULT_TIMEZONE;
  }
  return {
    enabled: source.enabled !== false,
    mode: SPOTLIGHT_MODES.indexOf(source.mode) !== -1 ? source.mode : "hybrid",
    dailyCount: normalizeSpotlightCount(source.dailyCount),
    ratingThreshold: Math.max(
      1,
      Math.min(1000, Number(source.ratingThreshold) || 5),
    ),
    cooldownDays: Math.max(
      0,
      Math.min(365, Number(source.cooldownDays) || 7),
    ),
    timezone,
    catalogueWorkIds: ids,
    manualSchedule: normalizeSpotlightSchedule(
      source.manualSchedule,
      editionSlug,
      ids,
    ),
  };
}

function spotlightConfigOf(settings, editionSlug, suppliedIds) {
  if (!settings.spotlight || typeof settings.spotlight !== "object") {
    settings.spotlight = { editions: {} };
  }
  if (!settings.spotlight.editions || typeof settings.spotlight.editions !== "object") {
    settings.spotlight.editions = {};
  }
  const previous = settings.spotlight.editions[editionSlug];
  const config = normalizeSpotlightConfig(previous, editionSlug, suppliedIds);
  settings.spotlight.editions[editionSlug] = config;
  return config;
}

function todayForSpotlight(config) {
  return dateKeyInTimezone(new Date(), config.timezone);
}

function dailySpotlightRows(editionSlug, date) {
  return db
    .prepare(
      "SELECT editionSlug, date, position, workId, source, publicLabel, createdAt FROM spotlight_daily WHERE editionSlug = ? AND date = ? ORDER BY position ASC",
    )
    .all(editionSlug, date);
}

function recentSpotlightIds(editionSlug, date, cooldownDays) {
  const start = shiftDateKey(date, -Math.max(0, Number(cooldownDays) || 0));
  return new Set(
    db
      .prepare(
        "SELECT DISTINCT workId FROM spotlight_daily WHERE editionSlug = ? AND date >= ? AND date < ?",
      )
      .all(editionSlug, start, date)
      .map((row) => row.workId),
  );
}

function spotlightCandidateRows(config, editionSlug, date) {
  return config.catalogueWorkIds.map((workId) => {
    const ratingRow = db
      .prepare("SELECT COUNT(*) AS count FROM ratings WHERE workId = ?")
      .get(workId);
    const lastRow = db
      .prepare(
        "SELECT MAX(date) AS date FROM spotlight_daily WHERE editionSlug = ? AND workId = ? AND date < ?",
      )
      .get(editionSlug, workId, date);
    return {
      workId,
      ratingCount: Number(ratingRow && ratingRow.count) || 0,
      lastDate: (lastRow && lastRow.date) || "",
    };
  });
}

function sortSpotlightCandidates(a, b) {
  if (a.ratingCount !== b.ratingCount) return a.ratingCount - b.ratingCount;
  if (a.lastDate !== b.lastDate) {
    if (!a.lastDate) return -1;
    if (!b.lastDate) return 1;
    return a.lastDate.localeCompare(b.lastDate);
  }
  return a.workId.localeCompare(b.workId);
}

function chooseAutomaticSpotlight(config, editionSlug, date, selected, count) {
  if (count <= 0) return [];
  const recent = recentSpotlightIds(editionSlug, date, config.cooldownDays);
  const rows = spotlightCandidateRows(config, editionSlug, date);
  const available = (row) => !selected.has(row.workId);
  const notRecent = (row) => !recent.has(row.workId);
  const lowRating = (row) => row.ratingCount < config.ratingThreshold;
  const picked = [];

  function take(pool, source) {
    pool
      .filter(available)
      .sort(sortSpotlightCandidates)
      .slice(0, count - picked.length)
      .forEach((row) => {
        selected.add(row.workId);
        picked.push({
          workId: row.workId,
          source,
          publicLabel: source === "low_rating_count" ? "待更多评议" : "今日聚光",
          ratingCount: row.ratingCount,
        });
      });
  }

  take(rows.filter((row) => notRecent(row) && lowRating(row)), "low_rating_count");
  take(rows.filter((row) => notRecent(row)), "cooldown_fallback");
  // 候选全部在冷却期时仍尽量填满当天名额，但不改变公开文案的隐私边界。
  take(rows, "cooldown_fallback");
  return picked;
}

function generateSpotlightDaily(settings, editionSlug, date, rebuildToday) {
  const config = spotlightConfigOf(settings, editionSlug);
  if (!config.enabled) return [];
  if (!rebuildToday) {
    const existing = dailySpotlightRows(editionSlug, date);
    if (existing.length) return existing;
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    if (!rebuildToday) {
      const existing = dailySpotlightRows(editionSlug, date);
      if (existing.length) {
        db.exec("COMMIT");
        return existing;
      }
    }
    db.prepare("DELETE FROM spotlight_daily WHERE editionSlug = ? AND date = ?").run(
      editionSlug,
      date,
    );

    const entries = [];
    const selected = new Set();
    const manual =
      config.mode === "automatic"
        ? []
        : (config.manualSchedule[date] || []).slice(0, config.dailyCount);
    manual.forEach((item) => {
      if (selected.has(item.workId)) return;
      selected.add(item.workId);
      entries.push({
        workId: item.workId,
        source: "manual",
        publicLabel: item.publicLabel,
      });
    });

    if (config.mode !== "manual" && entries.length < config.dailyCount) {
      entries.push.apply(
        entries,
        chooseAutomaticSpotlight(
          config,
          editionSlug,
          date,
          selected,
          config.dailyCount - entries.length,
        ),
      );
    }

    const createdAt = new Date().toISOString();
    entries.slice(0, config.dailyCount).forEach((item, index) => {
      db.prepare(
        "INSERT INTO spotlight_daily (editionSlug, date, position, workId, source, publicLabel, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        editionSlug,
        date,
        index + 1,
        item.workId,
        item.source,
        SPOTLIGHT_LABELS.indexOf(item.publicLabel) !== -1
          ? item.publicLabel
          : "今日聚光",
        createdAt,
      );
    });
    db.exec("COMMIT");
    return dailySpotlightRows(editionSlug, date);
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (e) {
      /* ignore rollback failure */
    }
    throw err;
  }
}

function publicSpotlightResult(editionSlug, date, rows) {
  return {
    editionSlug,
    date,
    items: rows.map((row) => ({
      workId: row.workId,
      source: row.source,
      publicLabel: row.publicLabel,
      position: row.position,
    })),
  };
}

function adminSpotlightState(settings, editionSlug, suppliedIds) {
  const config = spotlightConfigOf(settings, editionSlug, suppliedIds);
  const date = todayForSpotlight(config);
  const todayRows = dailySpotlightRows(editionSlug, date);
  const recent = recentSpotlightIds(editionSlug, date, config.cooldownDays);
  const selected = new Set(todayRows.map((row) => row.workId));
  const candidates = spotlightCandidateRows(config, editionSlug, date).map((row) => ({
    workId: row.workId,
    ratingCount: row.ratingCount,
    lastSpotlightDate: row.lastDate || null,
    recent: recent.has(row.workId),
    selected: selected.has(row.workId),
  }));
  return {
    editionSlug,
    date,
    config,
    today: todayRows,
    candidates,
  };
}

/* ---------- 邮件发送（QQ 邮箱 SMTP） ---------- */

// 只允许管理员写入正文，这里仍做一层消毒，去掉脚本类内容
function sanitizeWorkHtml(input) {
  let html = String(input == null ? "" : input);
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea)\b[^>]*>/gi,
    "",
  );
  html = html.replace(/\son[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\ssrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
  return html;
}

// 保留最近几次正文改动，改错了可以一键还原
function pushWorkHistory(workId, body, updatedAt, qq) {
  if (!body) return;
  db.prepare(
    "INSERT INTO work_content_history (id, workId, body, updatedAt, qq) VALUES (?, ?, ?, ?, ?)",
  ).run(
    crypto.randomBytes(12).toString("hex"),
    workId,
    body,
    updatedAt || new Date().toISOString(),
    qq || "",
  );
  const rows = db
    .prepare("SELECT id FROM work_content_history WHERE workId = ? ORDER BY updatedAt DESC, rowid DESC")
    .all(workId);
  rows.slice(WORK_HISTORY_KEEP).forEach(function (row) {
    db.prepare("DELETE FROM work_content_history WHERE id = ?").run(row.id);
  });
}

let transporter = null;
let smtpEndpoint = { at: 0, host: SMTP_CONFIG.host };

function mailerConfigured() {
  return !!(SMTP_CONFIG.user && SMTP_CONFIG.pass);
}

// 显式解析 IPv4：本机 IPv6 到腾讯邮件网关会握手成功却永远不回数据
async function resolveSmtpHost() {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(SMTP_CONFIG.host)) return SMTP_CONFIG.host;
  const now = Date.now();
  if (smtpEndpoint.at && now - smtpEndpoint.at < 5 * 60 * 1000) return smtpEndpoint.host;
  try {
    const res = await dns.promises.lookup(SMTP_CONFIG.host, { family: 4 });
    smtpEndpoint = { at: now, host: res.address };
  } catch (e) {
    smtpEndpoint = { at: now, host: SMTP_CONFIG.host };
  }
  return smtpEndpoint.host;
}

async function getTransporter() {
  if (!mailerConfigured()) return null;
  if (transporter) return transporter;
  let nodemailer;
  try {
    nodemailer = require("nodemailer");
  } catch (e) {
    throw new Error("服务器尚未安装 nodemailer 依赖。");
  }
  const host = await resolveSmtpHost();
  transporter = nodemailer.createTransport({
    host: host,
    port: SMTP_CONFIG.port,
    secure: SMTP_CONFIG.secure,
    auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
    connectionTimeout: 15000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
    family: 4,
    tls: { servername: SMTP_CONFIG.host },
    // 复用连接：第二次之后发信不用重新走 DNS/TLS/登录，能省好几秒
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  });
  return transporter;
}

async function sendVerificationMail(qq, code) {
  const t = await getTransporter();
  if (!t) throw new Error("邮件服务尚未配置");
  const minutes = Math.round(CODE_TTL_MS / 60000);
  const text =
    "你的幻梦境档案馆注册验证码是：\n\n" +
    code +
    "\n\n" +
    minutes +
    " 分钟内有效。\n如果不是你本人操作，请忽略此邮件。\n";
  await t.sendMail({
    from: '"' + SMTP_CONFIG.fromName + '" <' + SMTP_CONFIG.user + ">",
    to: qq + "@qq.com",
    subject: "幻梦境档案馆注册验证码",
    text: text,
  });
}

// 清理过期验证码记录（保留一天便于排查）
function pruneVerifications() {
  try {
    db.prepare("DELETE FROM email_verifications WHERE created_at < ?").run(Date.now() - VERIFY_RETENTION_MS);
  } catch (e) {
    /* 清理失败不影响主流程 */
  }
}

function reportWorkStats(editionSlug) {
  const prefix = editionSlug + "/%";
  return db.prepare(`
    WITH works AS (
      SELECT workId FROM ratings WHERE workId LIKE ?
      UNION SELECT workId FROM comments WHERE workId LIKE ?
      UNION SELECT workId FROM likes WHERE workId LIKE ?
    ), ratings_by_work AS (
      SELECT workId, COUNT(*) AS ratingCount, AVG(chuanlu) AS chuanluAvg,
        AVG(dangan) AS danganAvg, AVG(overall) AS overallAvg,
        AVG((chuanlu + dangan + overall) / 3.0) AS totalAvg, MAX(t) AS lastRatingAt
      FROM ratings WHERE workId LIKE ? GROUP BY workId
    ), comments_by_work AS (
      SELECT workId, COUNT(*) AS commentCount, MAX(COALESCE(editedAt, t)) AS lastCommentAt
      FROM comments WHERE workId LIKE ? GROUP BY workId
    ), likes_by_work AS (
      SELECT workId, COUNT(*) AS likeCount, MAX(t) AS lastLikeAt
      FROM likes WHERE workId LIKE ? GROUP BY workId
    )
    SELECT works.workId, COALESCE(r.ratingCount, 0) AS ratingCount,
      r.chuanluAvg, r.danganAvg, r.overallAvg, r.totalAvg,
      COALESCE(c.commentCount, 0) AS commentCount, COALESCE(l.likeCount, 0) AS likeCount,
      MAX(COALESCE(r.lastRatingAt, ''), COALESCE(c.lastCommentAt, ''), COALESCE(l.lastLikeAt, '')) AS lastActivityAt
    FROM works
    LEFT JOIN ratings_by_work r ON r.workId = works.workId
    LEFT JOIN comments_by_work c ON c.workId = works.workId
    LEFT JOIN likes_by_work l ON l.workId = works.workId
    ORDER BY works.workId ASC
  `).all(prefix, prefix, prefix, prefix, prefix, prefix);
}

function reportSummary() {
  return {
    users: Number(db.prepare("SELECT COUNT(*) AS c FROM users").get().c),
    enabledUsers: Number(db.prepare("SELECT COUNT(*) AS c FROM users WHERE enabled = 1").get().c),
    ratings: Number(db.prepare("SELECT COUNT(*) AS c FROM ratings").get().c),
    comments: Number(db.prepare("SELECT COUNT(*) AS c FROM comments").get().c),
    likes: Number(db.prepare("SELECT COUNT(*) AS c FROM likes").get().c),
  };
}

async function handle(action, payload, auth, ctx) {
  const settings = auth.settings || getSettings();
  const session = auth.session;
  const user = auth.user;
  const clientIp = String((ctx && ctx.ip) || "unknown");

  switch (action) {
    case "ping":
      return { ok: true, time: new Date().toISOString() };

    case "bootstrap": {
      const visibleAuthorBindings = {};
      const allAuthorBindings = settings.authorBindings || {};
      if (session && session.role === "admin") {
        Object.assign(visibleAuthorBindings, allAuthorBindings);
      } else if (user) {
        Object.entries(allAuthorBindings).forEach(([workId, qq]) => {
          if (String(qq) === user.qq) visibleAuthorBindings[workId] = user.qq;
        });
      }
      const safeSettings = {
        allowVisitor: settings.allowVisitor,
        allowMemberLogin: settings.allowMemberLogin,
        registrationOpen: settings.registrationOpen,
        editions: settings.editions || {},
        authorBindings: visibleAuthorBindings,
      };
      if (session && session.role === "admin") {
        safeSettings.memberDirectory = settings.memberDirectory || [];
        safeSettings.adminDirectory = settings.adminDirectory || [];
      }
      return {
        settings: safeSettings,
        session: session
          ? {
              role: session.role,
              qq: session.qq || null,
              token: session.token || (session.role === "visitor" ? "visitor" : null),
            }
          : null,
        user: publicUser(user),
      };
    }

    case "getSpotlight": {
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) {
        throw new Error("届别编号无效");
      }
      // 第一次访问时用构建产物里的目录清单初始化配置；完整配置仍只在管理动作中返回。
      spotlightConfigOf(settings, editionSlug);
      saveSettings(settings);
      const config = spotlightConfigOf(settings, editionSlug);
      const date = todayForSpotlight(config);
      const rows = generateSpotlightDaily(settings, editionSlug, date, false);
      return publicSpotlightResult(editionSlug, date, rows);
    }

    case "getEditionInsights": {
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) throw new Error("届别编号无效");
      const st = editionState(settings, editionSlug);
      const workStats = reportWorkStats(editionSlug);
      const rankingsAvailable = st.phase === "统计" || st.phase === "公示";
      const heat = workStats.map((row) => ({
        workId: row.workId,
        commentCount: row.commentCount,
        likeCount: row.likeCount,
        lastActivityAt: row.lastActivityAt,
      }));
      return {
        rankingsAvailable,
        heat,
        leaderboard: rankingsAvailable
          ? workStats
              .filter((row) => Number(row.ratingCount) > 0)
              .sort((a, b) => Number(b.totalAvg) - Number(a.totalAvg) || Number(b.ratingCount) - Number(a.ratingCount) || a.workId.localeCompare(b.workId))
              .map((row, index) => ({
                rank: index + 1,
                workId: row.workId,
                ratingCount: row.ratingCount,
                totalAvg: row.totalAvg,
              }))
          : [],
      };
    }

    case "sendRegisterCode": {
      if (!settings.registrationOpen) throw new Error("管理员已关闭注册。");
      const qq = String(payload.qq || "").trim();
      if (!/^\d{5,12}$/.test(qq)) throw new Error("请输入 5–12 位数字 QQ 号。");
      if (!isAllowedRegister(settings, qq)) {
        throw new Error("该 QQ 不在调查员目录或管理员名单中。请联系已有管理员添加后再注册。");
      }
      if (getUser(qq)) throw new Error("该 QQ 已注册，请直接登录。");
      if (!mailerConfigured()) throw new Error("邮件服务尚未配置，请联系管理员手动开通账号。");

      const now = Date.now();
      const last = db
        .prepare("SELECT created_at FROM email_verifications WHERE qq = ? ORDER BY created_at DESC LIMIT 1")
        .get(qq);
      if (last && now - Number(last.created_at) < CODE_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((CODE_RESEND_COOLDOWN_MS - (now - Number(last.created_at))) / 1000);
        throw new Error("发送过于频繁，请 " + wait + " 秒后再试。");
      }
      const qqHour = db
        .prepare("SELECT COUNT(*) AS c FROM email_verifications WHERE qq = ? AND created_at > ?")
        .get(qq, now - 3600 * 1000).c;
      if (Number(qqHour) >= CODE_SEND_PER_QQ_HOUR) {
        throw new Error("该 QQ 一小时内请求次数过多，请稍后再试。");
      }
      const ipMinute = db
        .prepare("SELECT COUNT(*) AS c FROM email_verifications WHERE request_ip = ? AND created_at > ?")
        .get(clientIp, now - 60 * 1000).c;
      if (Number(ipMinute) >= CODE_SEND_PER_IP_MINUTE) {
        throw new Error("请求过于频繁，请稍后再试。");
      }
      const ipHour = db
        .prepare("SELECT COUNT(*) AS c FROM email_verifications WHERE request_ip = ? AND created_at > ?")
        .get(clientIp, now - 3600 * 1000).c;
      if (Number(ipHour) >= CODE_SEND_PER_IP_HOUR) {
        throw new Error("当前网络请求次数过多，请稍后再试。");
      }
      const dayTotal = db
        .prepare("SELECT COUNT(*) AS c FROM email_verifications WHERE created_at > ?")
        .get(now - 24 * 3600 * 1000).c;
      if (Number(dayTotal) >= CODE_SEND_GLOBAL_DAILY) {
        throw new Error("今日邮件额度已用完，请联系管理员手动开通账号。");
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const id = crypto.randomUUID();
      // 同一 QQ 只保留最新的验证码可用
      db.prepare("UPDATE email_verifications SET used_at = ? WHERE qq = ? AND used_at IS NULL").run(now, qq);
      db.prepare(
        "INSERT INTO email_verifications (id, qq, code_hash, expires_at, created_at, used_at, verify_attempts, request_ip) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)",
      ).run(id, qq, hashCode(code), now + CODE_TTL_MS, now, clientIp);

      try {
        await sendVerificationMail(qq, code);
      } catch (err) {
        // 发送失败则作废这条验证码，但仍计入限流，避免反复重试打爆发信额度
        db.prepare("UPDATE email_verifications SET used_at = ? WHERE id = ?").run(Date.now(), id);
        console.error("[sendRegisterCode] 邮件发送失败：" + ((err && err.message) || err));
        throw new Error("验证码邮件发送失败，请稍后重试或联系管理员手动开通账号。");
      }
      pruneVerifications();
      return {
        ok: true,
        cooldown: Math.round(CODE_RESEND_COOLDOWN_MS / 1000),
        email: qq + "@qq.com",
        ttlMinutes: Math.round(CODE_TTL_MS / 60000),
      };
    }

    case "register": {
      if (!settings.registrationOpen) throw new Error("管理员已关闭注册。");
      const qq = String(payload.qq || "").trim();
      const pass = String(payload.pass || payload.password || "");
      const nickname = String(payload.nickname || "").trim().slice(0, NAME_MAX);
      const code = String(payload.code || "").trim();
      if (!/^\d{5,12}$/.test(qq)) throw new Error("请输入 5–12 位数字 QQ 号。");
      if (!isAllowedRegister(settings, qq)) {
        throw new Error("该 QQ 不在调查员目录或管理员名单中。请联系已有管理员添加后再注册。");
      }
      if (getUser(qq)) throw new Error("该 QQ 已注册，请直接登录。");
      if (pass.length < 4) throw new Error("密码至少 4 位。");
      if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位数字邮箱验证码。");

      const now = Date.now();
      const record = db
        .prepare(
          "SELECT id, code_hash, expires_at, verify_attempts FROM email_verifications WHERE qq = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
        )
        .get(qq);
      if (!record) throw new Error("请先点击「发送验证码」，并到 " + qq + "@qq.com 查收。");
      if (Number(record.expires_at) < now) throw new Error("验证码已过期，请重新获取。");
      if (Number(record.verify_attempts) >= CODE_MAX_ATTEMPTS) {
        throw new Error("验证码错误次数过多，请重新获取。");
      }
      if (!verifyCode(code, record.code_hash)) {
        db.prepare("UPDATE email_verifications SET verify_attempts = verify_attempts + 1 WHERE id = ?").run(record.id);
        const left = CODE_MAX_ATTEMPTS - (Number(record.verify_attempts) + 1);
        throw new Error(left > 0 ? "验证码不正确，还可尝试 " + left + " 次。" : "验证码不正确，请重新获取。");
      }

      const role = resolveRole(settings, qq);
      const row = {
        qq,
        pass: hashPassword(pass),
        nickname: nickname || "用户" + qq.slice(-4),
        role,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      let committed = false;
      db.exec("BEGIN IMMEDIATE");
      try {
        if (getUser(qq)) throw new Error("该 QQ 已注册，请直接登录。");
        putUser(row);
        db.prepare("UPDATE email_verifications SET used_at = ? WHERE id = ?").run(Date.now(), record.id);
        db.exec("COMMIT");
        committed = true;
      } catch (err) {
        if (!committed) {
          try {
            db.exec("ROLLBACK");
          } catch (e) {
            /* ignore */
          }
        }
        throw err;
      }
      const token = createToken();
      saveToken(token, qq, role);
      return {
        token,
        session: { role, qq },
        user: publicUser(row),
      };
    }

    case "login": {
      const qq = String(payload.qq || "").trim();
      const pass = String(payload.pass || "");
      const row = getUser(qq);
      if (!row) throw new Error("账号不存在，请先注册。");
      if (!row.enabled) throw new Error("该账号已被管理员停用。");
      const role = resolveRole(settings, qq);
      if (!settings.allowMemberLogin && role !== "admin") {
        throw new Error("管理员已关闭调查员登录。");
      }
      if (!verifyPassword(pass, row.pass)) throw new Error("密码不正确。");
      row.role = role;
      putUser(row);
      const token = createToken();
      saveToken(token, qq, role);
      return {
        token,
        session: { role, qq },
        user: publicUser(row),
      };
    }

    case "visitor": {
      if (!settings.allowVisitor) throw new Error("管理员已关闭访客进入。");
      return {
        token: "visitor",
        session: { role: "visitor" },
        user: null,
      };
    }

    case "logout": {
      if (session && session.token && session.token !== "visitor") {
        db.prepare("DELETE FROM tokens WHERE token = ?").run(session.token);
      }
      return { ok: true };
    }

    case "updateProfile": {
      if (!user) throw new Error("请先登录。");
      if (payload.nickname != null) {
        user.nickname = String(payload.nickname).trim().slice(0, NAME_MAX) || user.nickname;
      }
      if (payload.newPass) {
        const next = String(payload.newPass || "");
        if (next.length < 4) throw new Error("新密码至少 4 位。");
        if (payload.oldPass != null && String(payload.oldPass).length) {
          if (!verifyPassword(String(payload.oldPass), user.pass)) {
            throw new Error("当前密码不正确。");
          }
        }
        user.pass = hashPassword(next);
      }
      putUser(user);
      return { user: publicUser(user) };
    }

    case "getWorkBundle": {
      const workId = String(payload.workId || "");
      if (!workId) throw new Error("缺少 workId");
      const editionSlug = workId.split("/")[0];
      const st = editionState(settings, editionSlug);

      // 评分获取：严格保护隐私
      const rawRatings = db.prepare("SELECT id, workId, qq, chuanlu, dangan, overall, t FROM ratings WHERE workId = ?").all(workId);
      let ratings = [];
      if (session && session.role === "admin") {
        ratings = rawRatings;
      } else if (st.phase === "征文" || st.phase === "评分") {
        // 评分阶段：普通用户只能看到自己的评分
        if (user) {
          ratings = rawRatings.filter((r) => r.qq === user.qq);
        } else {
          ratings = [];
        }
      } else if (st.phase === "统计" || st.phase === "公示") {
        // 公示阶段：允许均分统计，但不暴露他人 QQ -> 分数的对应
        ratings = rawRatings.map((r, idx) => {
          if (user && r.qq === user.qq) return r;
          return {
            ...r,
            qq: "masked-" + (idx + 1),
          };
        });
      }

      // 评论获取：匿名评论对非管理员脱敏
      const rawComments = db.prepare("SELECT id, workId, qq, name, anonymous, judge, body, t, editedAt FROM comments WHERE workId = ? ORDER BY t ASC LIMIT 500").all(workId);
      const comments = rawComments.map((c) => {
        const isAnon = !!c.anonymous;
        const isSelf = user && c.qq === user.qq;
        const isAdmin = session && session.role === "admin";
        return {
          id: c.id,
          workId: c.workId,
          qq: isAdmin || isSelf ? c.qq : "",
          name: isAnon && !isAdmin && !isSelf ? "匿名调查员" : c.name,
          anonymous: isAnon,
          judge: !!c.judge,
          body: c.body,
          t: c.t,
          editedAt: c.editedAt || "",
        };
      });

      // 点赞
      const rawLikes = db.prepare("SELECT qq FROM likes WHERE workId = ? LIMIT 1000").all(workId);
      const likes = {};
      rawLikes.forEach((row, index) => {
        const key = user && row.qq === user.qq ? user.qq : "liked-" + (index + 1);
        likes[key] = true;
      });

      // 作者附言
      const noteRow = db.prepare("SELECT body, qq, updatedAt FROM author_notes WHERE workId = ?").get(workId);
      const authorNote = noteRow
        ? {
            body: noteRow.body,
            updatedAt: noteRow.updatedAt,
            qq:
              session && (session.role === "admin" || (user && noteRow.qq === user.qq))
                ? noteRow.qq
                : "",
          }
        : null;

      // 正文在线修改（如无覆盖则为 null，前端继续用构建时正文）
      const contentRow = db.prepare("SELECT body, updatedAt, qq FROM work_content WHERE workId = ?").get(workId);
      const content = contentRow
        ? {
            html: contentRow.body,
            updatedAt: contentRow.updatedAt,
            editedBy: session && session.role === "admin" ? contentRow.qq : "",
          }
        : null;

      return {
        ratings,
        comments,
        likes,
        authorNote,
        content,
      };
    }

    case "getStars": {
      if (!user) return { stars: [] };
      const editionSlug = String(payload.editionSlug || "");
      const row = db.prepare("SELECT slugs FROM stars WHERE qq = ? AND editionSlug = ?").get(user.qq, editionSlug);
      return { stars: row ? JSON.parse(row.slugs || "[]") : [] };
    }

    case "setStars": {
      if (!user || session.role === "visitor") throw new Error("无权操作");
      const editionSlug = String(payload.editionSlug || "");
      const slugs = Array.isArray(payload.slugs) ? payload.slugs : [];
      const id = user.qq + "::" + editionSlug;
      db.prepare(`
        INSERT INTO stars (id, qq, editionSlug, slugs)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET slugs = excluded.slugs
      `).run(id, user.qq, editionSlug, JSON.stringify(slugs));
      return { stars: slugs };
    }

    case "submitRating": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("无权评分");
      }
      const workId = String(payload.workId || "");
      const editionSlug = workId.split("/")[0];
      const st = editionState(settings, editionSlug);
      if (st.phase !== "评分") throw new Error("当前不在大众评分阶段");
      const chuanlu = Number(payload.chuanlu);
      const dangan = Number(payload.dangan);
      const overall = Number(payload.overall);
      if (![chuanlu, dangan, overall].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
        throw new Error("分数无效");
      }
      const id = workId + "::" + user.qq;
      const t = new Date().toISOString();
      db.prepare(`
        INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workId, qq) DO UPDATE SET
          chuanlu = excluded.chuanlu,
          dangan = excluded.dangan,
          overall = excluded.overall,
          t = excluded.t
      `).run(id, workId, user.qq, chuanlu, dangan, overall, t);

      const record = {
        id,
        workId,
        qq: user.qq,
        chuanlu,
        dangan,
        overall,
        t,
      };
      return { rating: record };
    }

    case "toggleLike": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("无权点赞");
      }
      const workId = String(payload.workId || "");
      const editionSlug = workId.split("/")[0];
      const st = editionState(settings, editionSlug);
      if (st.phase !== "统计" && st.phase !== "公示") {
        throw new Error("当前阶段不可点赞");
      }
      const id = workId + "::" + user.qq;
      const existing = db.prepare("SELECT id FROM likes WHERE id = ?").get(id);
      if (existing) {
        db.prepare("DELETE FROM likes WHERE id = ?").run(id);
        return { liked: false };
      }
      db.prepare("INSERT INTO likes (id, workId, qq, t) VALUES (?, ?, ?, ?)").run(
        id,
        workId,
        user.qq,
        new Date().toISOString()
      );
      return { liked: true };
    }

    case "addComment": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("无权评论");
      }
      const workId = String(payload.workId || "");
      const body = String(payload.body || "").trim().slice(0, BODY_MAX);
      if (!body) throw new Error("评论不能为空");
      const anonymous = !!payload.anonymous;
      const editionSlug = workId.split("/")[0];
      const st = editionState(settings, editionSlug);
      const judge = session.role === "admin" && st.phase === "统计" && !anonymous;
      const id = crypto.randomBytes(12).toString("hex");
      const t = new Date().toISOString();
      db.prepare(`
        INSERT INTO comments (id, workId, qq, name, anonymous, judge, body, t)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, workId, user.qq, user.nickname, anonymous ? 1 : 0, judge ? 1 : 0, body, t);
      const row = {
        id,
        workId,
        qq: user.qq,
        name: user.nickname,
        anonymous,
        judge,
        body,
        t,
      };
      return { comment: row };
    }

    case "deleteComment": {
      if (!user) throw new Error("请先登录");
      const id = String(payload.id || "");
      const row = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
      if (!row) throw new Error("评论不存在");
      if (session.role !== "admin" && row.qq !== user.qq) {
        throw new Error("无权删除");
      }
      db.prepare("DELETE FROM comments WHERE id = ?").run(id);
      return { ok: true };
    }

    // 管理员可改所有人的评论；普通用户只能改自己的
    case "updateComment": {
      if (!user) throw new Error("请先登录");
      const id = String(payload.id || "");
      const row = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
      if (!row) throw new Error("评论不存在");
      if (session.role !== "admin" && row.qq !== user.qq) {
        throw new Error("无权修改");
      }
      const body = String(payload.body || "").trim().slice(0, BODY_MAX);
      if (!body) throw new Error("评论不能为空");
      const editedAt = new Date().toISOString();
      db.prepare("UPDATE comments SET body = ?, editedAt = ? WHERE id = ?").run(body, editedAt, id);
      return { comment: { id: id, body: body, editedAt: editedAt } };
    }

    /* ---------- 正文在线编辑（仅管理员） ---------- */

    case "getWorkContent": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const workId = String(payload.workId || "").trim();
      const row = db.prepare("SELECT body, updatedAt, qq FROM work_content WHERE workId = ?").get(workId);
      const history = db
        .prepare(
          "SELECT id, updatedAt, qq, length(body) AS chars FROM work_content_history WHERE workId = ? ORDER BY updatedAt DESC LIMIT ?",
        )
        .all(workId, WORK_HISTORY_KEEP);
      return {
        workId: workId,
        html: row ? row.body : null,
        updatedAt: row ? row.updatedAt : null,
        qq: row ? row.qq : null,
        history: history,
      };
    }

    case "saveWorkContent": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const workId = String(payload.workId || "").trim();
      if (!workId || workId.length > 200) throw new Error("作品编号无效");
      const rawHtml = String(payload.html == null ? "" : payload.html);
      if (rawHtml.length > WORK_BODY_MAX) {
        throw new Error("正文太长（上限约 " + Math.round(WORK_BODY_MAX / 10000) + " 万字）");
      }
      const html = sanitizeWorkHtml(rawHtml).trim();
      if (!html) throw new Error("正文不能为空；要还原请用「恢复构建版本」");
      const now = new Date().toISOString();
      const prev = db.prepare("SELECT body, updatedAt, qq FROM work_content WHERE workId = ?").get(workId);
      if (prev) pushWorkHistory(workId, prev.body, prev.updatedAt, prev.qq);
      db.prepare("INSERT OR REPLACE INTO work_content (workId, body, updatedAt, qq) VALUES (?, ?, ?, ?)").run(
        workId,
        html,
        now,
        user.qq,
      );
      return { workId: workId, html: html, updatedAt: now, qq: user.qq };
    }

    case "resetWorkContent": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const workId = String(payload.workId || "").trim();
      const prev = db.prepare("SELECT body, updatedAt, qq FROM work_content WHERE workId = ?").get(workId);
      if (prev) {
        pushWorkHistory(workId, prev.body, prev.updatedAt, prev.qq);
        db.prepare("DELETE FROM work_content WHERE workId = ?").run(workId);
      }
      return { workId: workId, html: null };
    }

    case "restoreWorkContent": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const workId = String(payload.workId || "").trim();
      const historyId = String(payload.historyId || "").trim();
      const item = db.prepare("SELECT body, updatedAt, qq FROM work_content_history WHERE id = ? AND workId = ?").get(historyId, workId);
      if (!item) throw new Error("历史版本不存在");
      const now = new Date().toISOString();
      const prev = db.prepare("SELECT body, updatedAt, qq FROM work_content WHERE workId = ?").get(workId);
      if (prev) pushWorkHistory(workId, prev.body, prev.updatedAt, prev.qq);
      db.prepare("DELETE FROM work_content_history WHERE id = ?").run(historyId);
      db.prepare("INSERT OR REPLACE INTO work_content (workId, body, updatedAt, qq) VALUES (?, ?, ?, ?)").run(
        workId,
        item.body,
        now,
        user.qq,
      );
      return { workId: workId, html: item.body, updatedAt: now, qq: user.qq };
    }

    case "adminListWorkContent": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const rows = db.prepare("SELECT workId, updatedAt, qq FROM work_content ORDER BY updatedAt DESC").all();
      return { items: rows };
    }

    case "saveAuthorNote": {
      if (!user) throw new Error("请先登录");
      const workId = String(payload.workId || "");
      const bindings = settings.authorBindings || {};
      const bound = String(bindings[workId] || "").trim();
      if (!bound || bound !== user.qq) throw new Error("仅作者可编辑");
      const bodyText = String(payload.body || "").trim().slice(0, AUTHOR_NOTE_MAX);
      if (!bodyText) {
        db.prepare("DELETE FROM author_notes WHERE workId = ?").run(workId);
        return { authorNote: null };
      }
      const updatedAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO author_notes (workId, body, qq, updatedAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(workId) DO UPDATE SET
          body = excluded.body,
          qq = excluded.qq,
          updatedAt = excluded.updatedAt
      `).run(workId, bodyText, user.qq, updatedAt);
      return {
        authorNote: {
          body: bodyText,
          updatedAt,
          qq: user.qq,
        },
      };
    }

    case "adminGetUsers": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const rows = db.prepare("SELECT qq, nickname, role, enabled FROM users ORDER BY createdAt DESC").all();
      return {
        users: rows.map((r) => ({
          qq: r.qq,
          nickname: r.nickname,
          role: r.role,
          enabled: !!r.enabled,
        })),
      };
    }

    case "adminGetReport": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const users = db.prepare("SELECT qq, nickname, role, enabled, createdAt FROM users ORDER BY createdAt DESC").all().map((row) => ({
        qq: row.qq,
        nickname: row.nickname,
        role: row.role,
        enabled: !!row.enabled,
        createdAt: row.createdAt,
      }));
      const ratings = db.prepare("SELECT workId, qq, chuanlu, dangan, overall, t FROM ratings ORDER BY t DESC").all();
      const comments = db.prepare("SELECT workId, qq, name, anonymous, judge, body, t, editedAt FROM comments ORDER BY t DESC").all().map((row) => ({
        ...row,
        anonymous: !!row.anonymous,
        judge: !!row.judge,
      }));
      const editionSlugs = db.prepare(`
        SELECT DISTINCT substr(workId, 1, instr(workId, '/') - 1) AS slug FROM ratings
        UNION SELECT DISTINCT substr(workId, 1, instr(workId, '/') - 1) AS slug FROM comments
        UNION SELECT DISTINCT substr(workId, 1, instr(workId, '/') - 1) AS slug FROM likes
      `).all().map((row) => row.slug).filter(Boolean);
      const workStats = editionSlugs.flatMap((slug) => reportWorkStats(slug));
      return { summary: reportSummary(), users, ratings, comments, workStats };
    }

    case "adminGetSpotlightConfig": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) {
        throw new Error("届别编号无效");
      }
      const suppliedIds = Array.isArray(payload.catalogueWorkIds)
        ? payload.catalogueWorkIds
        : undefined;
      const result = adminSpotlightState(settings, editionSlug, suppliedIds);
      saveSettings(settings);
      return result;
    }

    case "adminSaveSpotlightConfig": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) {
        throw new Error("届别编号无效");
      }
      const incoming = payload.config && typeof payload.config === "object"
        ? payload.config
        : {};
      if (incoming.mode != null && SPOTLIGHT_MODES.indexOf(String(incoming.mode)) === -1) {
        throw new Error("聚光模式无效");
      }
      const suppliedIds = Array.isArray(incoming.catalogueWorkIds)
        ? incoming.catalogueWorkIds
        : undefined;
      const current = spotlightConfigOf(settings, editionSlug, suppliedIds);
      const next = normalizeSpotlightConfig(
        Object.assign({}, current, incoming),
        editionSlug,
        suppliedIds !== undefined ? suppliedIds : current.catalogueWorkIds,
      );
      settings.spotlight.editions[editionSlug] = next;
      saveSettings(settings);
      if (payload.rebuildToday === true) {
        const date = todayForSpotlight(next);
        generateSpotlightDaily(settings, editionSlug, date, true);
      }
      return adminSpotlightState(settings, editionSlug);
    }

    case "adminSaveSettings": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const next = Object.assign({}, settings);
      const patch = payload.settings || {};
      [
        "allowVisitor",
        "allowMemberLogin",
        "registrationOpen",
        "memberDirectory",
        "adminDirectory",
        "editions",
        "authorBindings",
      ].forEach(function (key) {
        if (patch[key] !== undefined) next[key] = patch[key];
      });
      if (!Array.isArray(next.adminDirectory)) next.adminDirectory = [];
      const envAdmins = getInitialAdminQQs();
      for (const a of envAdmins) {
        if (!next.adminDirectory.includes(a)) {
          next.adminDirectory.push(a);
        }
      }
      saveSettings(next);
      return { settings: next };
    }

    case "adminSetUserEnabled": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const qq = String(payload.qq || "");
      const target = getUser(qq);
      if (!target) throw new Error("用户不存在");
      const enabled = payload.enabled ? 1 : 0;
      db.prepare("UPDATE users SET enabled = ? WHERE qq = ?").run(enabled, qq);
      target.enabled = !!enabled;
      return { user: publicUser(target) };
    }

    // 管理员兜底：收不到邮件（邮箱未开通等）时直接建号
    case "adminCreateUser": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const qq = String(payload.qq || "").trim();
      const pass = String(payload.pass || "");
      const nickname = String(payload.nickname || "").trim().slice(0, NAME_MAX);
      if (!/^\d{5,12}$/.test(qq)) throw new Error("请输入 5–12 位数字 QQ 号。");
      if (pass.length < 4) throw new Error("临时密码至少 4 位。");
      if (getUser(qq)) throw new Error("该 QQ 已注册，请让对方直接登录或使用「忘记密码」以外的重置方式。");
      const role = resolveRole(settings, qq);
      const row = {
        qq,
        pass: hashPassword(pass),
        nickname: nickname || "用户" + qq.slice(-4),
        role,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      putUser(row);
      return { user: publicUser(row) };
    }

    default:
      throw new Error("未知操作：" + action);
  }
}

// 取真实访客 IP：Caddy 反代后仅在 X-Forwarded-For 末尾追加，取最后一段最稳
function clientIpOf(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "");
  const parts = fwd
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  const real = String(req.headers["x-real-ip"] || "").trim();
  return parts.length ? parts[parts.length - 1] : real || req.socket.remoteAddress || "unknown";
}

// HTTP 请求分发
const server = http.createServer(async (req, res) => {
  // CORS 响应头
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split("?")[0];
  if (urlPath !== "/api" && urlPath !== "/api/") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  let bodyStr = "";
  req.on("data", (chunk) => {
    bodyStr += chunk;
    if (bodyStr.length > 2 * 1024 * 1024) {
      req.destroy();
    }
  });

  req.on("end", async () => {
    let body = {};
    try {
      body = JSON.parse(bodyStr || "{}");
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "JSON 无效" }));
      return;
    }

    const action = body.action;
    if (!action) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "缺少 action" }));
      return;
    }

    try {
      const currentSettings = getSettings();
      const auth = authFromHeader(req.headers.authorization, currentSettings);
      const data = await handle(action, body.payload || {}, auth, { ip: clientIpOf(req) });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, data }));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: err.message || String(err) }));
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Dreamland Archive API running at http://${HOST}:${PORT}`);
});
