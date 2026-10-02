/**
 * 幻梦境档案馆 · 自托管 Node.js + SQLite API 服务
 * 保持现有 HTTP API 动作契约
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
const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_CODE_SEND_PER_QQ_HOUR = 5;
const RESET_CODE_SEND_PER_IP_MINUTE = 5;
const RESET_CODE_SEND_PER_IP_HOUR = 30;
const RESET_CODE_MAX_FAILURES_PER_QQ_HOUR = 10;
const RESET_CODE_MAX_FAILURES_PER_IP_HOUR = 30;

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
const READING_GUIDE_IDS = ["first-visit", "ten-minutes", "folk-rites", "case-files", "dreaming-voyages"];
const CATALOGUE_MANIFEST_PATH = path.join(__dirname, "catalogue.json");
const RATING_ACHIEVEMENT_TITLES = {
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

  CREATE TABLE IF NOT EXISTS rating_exclusions (
    qq TEXT PRIMARY KEY
  );

  CREATE VIEW IF NOT EXISTS counted_ratings AS
    SELECT * FROM ratings WHERE qq NOT IN (SELECT qq FROM rating_exclusions);

  CREATE TABLE IF NOT EXISTS rating_achievements (
    id TEXT PRIMARY KEY,
    qq TEXT NOT NULL,
    editionSlug TEXT NOT NULL,
    achievementKey TEXT NOT NULL,
    unlockedAt TEXT NOT NULL,
    notifiedAt TEXT,
    UNIQUE(qq, editionSlug, achievementKey)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    workId TEXT NOT NULL,
    rootId TEXT,
    qq TEXT NOT NULL,
    name TEXT NOT NULL,
    anonymous INTEGER NOT NULL DEFAULT 0,
    judge INTEGER NOT NULL DEFAULT 0,
    body TEXT NOT NULL,
    t TEXT NOT NULL,
    requestId TEXT,
    deletedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS comment_requests (
    qq TEXT NOT NULL,
    requestId TEXT NOT NULL,
    workId TEXT NOT NULL,
    rootId TEXT,
    anonymous INTEGER NOT NULL,
    body TEXT NOT NULL,
    commentJson TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (qq, requestId)
  );

  CREATE TABLE IF NOT EXISTS reading_states (
    qq TEXT NOT NULL,
    workId TEXT NOT NULL,
    progress REAL NOT NULL DEFAULT 0,
    positionJson TEXT,
    markedReadAt TEXT,
    laterAt TEXT,
    updatedAt TEXT NOT NULL,
    PRIMARY KEY (qq, workId)
  );
  CREATE INDEX IF NOT EXISTS idx_reading_states_qq_updated
    ON reading_states(qq, updatedAt DESC);

  CREATE TABLE IF NOT EXISTS reading_shelf_meta (
    qq TEXT PRIMARY KEY,
    generation INTEGER NOT NULL DEFAULT 0,
    updatedAt TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS comment_notifications (
    id TEXT PRIMARY KEY,
    recipientQq TEXT NOT NULL,
    workId TEXT NOT NULL,
    rootId TEXT NOT NULL,
    commentId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    readAt TEXT,
    dismissedAt TEXT,
    UNIQUE(recipientQq, commentId)
  );
  CREATE INDEX IF NOT EXISTS idx_comment_notifications_inbox
    ON comment_notifications(recipientQq, dismissedAt, createdAt DESC);

  CREATE TABLE IF NOT EXISTS work_feedback (
    id TEXT PRIMARY KEY,
    reporterQq TEXT NOT NULL,
    workId TEXT NOT NULL,
    category TEXT NOT NULL,
    selectedText TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    sourcePath TEXT NOT NULL,
    requestId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    adminNote TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    handledBy TEXT,
    UNIQUE(reporterQq, requestId)
  );
  CREATE INDEX IF NOT EXISTS idx_work_feedback_queue
    ON work_feedback(status, createdAt DESC);

  CREATE TABLE IF NOT EXISTS comment_reports (
    id TEXT PRIMARY KEY,
    reporterQq TEXT NOT NULL,
    commentId TEXT NOT NULL,
    reason TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    requestId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    adminNote TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    handledBy TEXT,
    UNIQUE(reporterQq, requestId)
  );
  CREATE INDEX IF NOT EXISTS idx_comment_reports_queue
    ON comment_reports(status, createdAt DESC);

  CREATE TABLE IF NOT EXISTS feedback_actions (
    id TEXT PRIMARY KEY,
    targetType TEXT NOT NULL,
    targetId TEXT NOT NULL,
    adminQq TEXT NOT NULL,
    status TEXT NOT NULL,
    adminNote TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_actions_target
    ON feedback_actions(targetType, targetId, createdAt DESC);

  CREATE TABLE IF NOT EXISTS stars (
    id TEXT PRIMARY KEY,
    qq TEXT NOT NULL,
    editionSlug TEXT NOT NULL,
    slugs TEXT NOT NULL
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

  CREATE TABLE IF NOT EXISTS password_reset_verifications (
    id TEXT PRIMARY KEY,
    qq TEXT NOT NULL,
    code_hash TEXT NOT NULL DEFAULT '',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    verify_attempts INTEGER NOT NULL DEFAULT 0,
    request_ip TEXT,
    sent_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_password_reset_verifications_qq
    ON password_reset_verifications(qq, created_at);

  CREATE INDEX IF NOT EXISTS idx_password_reset_verifications_ip
    ON password_reset_verifications(request_ip, created_at);

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

  CREATE INDEX IF NOT EXISTS idx_ratings_qq_work
    ON ratings(qq, workId);

  CREATE INDEX IF NOT EXISTS idx_comments_work_aggregate
    ON comments(workId, t);

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

  CREATE TABLE IF NOT EXISTS edition_publications (
    editionSlug TEXT PRIMARY KEY,
    publishedAt TEXT NOT NULL,
    snapshot TEXT NOT NULL
  );

  CREATE TRIGGER IF NOT EXISTS edition_publications_no_update
    BEFORE UPDATE ON edition_publications BEGIN
      SELECT RAISE(ABORT, '正式公示不可修改');
    END;
  CREATE TRIGGER IF NOT EXISTS edition_publications_no_delete
    BEFORE DELETE ON edition_publications BEGIN
      SELECT RAISE(ABORT, '正式公示不可删除');
    END;
`);

// 旧库补列：评论的编辑时间（用于显示"已编辑"）
(function migrateCommentEditedAt() {
  const cols = db.prepare("PRAGMA table_info(comments)").all();
  const hasEdited = cols.some(function (c) {
    return c.name === "editedAt";
  });
  if (!hasEdited) db.exec("ALTER TABLE comments ADD COLUMN editedAt TEXT");
})();

(function migrateCommentThreads() {
  const cols = db.prepare("PRAGMA table_info(comments)").all();
  if (!cols.some((col) => col.name === "rootId")) {
    db.exec("ALTER TABLE comments ADD COLUMN rootId TEXT");
  }
  if (!cols.some((col) => col.name === "deletedAt")) {
    db.exec("ALTER TABLE comments ADD COLUMN deletedAt TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_comments_work_root_time ON comments(workId, rootId, t, id)");
})();

(function migrateCommentRequestIds() {
  const cols = db.prepare("PRAGMA table_info(comments)").all();
  if (!cols.some((col) => col.name === "requestId")) {
    db.exec("ALTER TABLE comments ADD COLUMN requestId TEXT");
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_comments_qq_request_id
      ON comments(qq, requestId)
      WHERE requestId IS NOT NULL AND requestId <> ''
  `);
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
    awardConfigs: {},
    spotlight: { editions: {} },
  };
}

function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("main");
  if (row) {
    try {
      const parsed = JSON.parse(row.value);
      if (!Array.isArray(parsed.adminDirectory)) parsed.adminDirectory = [];
      if (!parsed.awardConfigs || typeof parsed.awardConfigs !== "object") {
        parsed.awardConfigs = {};
      }
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

function normalizeReadingGuides(input) {
  if (!Array.isArray(input) || input.length !== READING_GUIDE_IDS.length) {
    throw new Error("请保留五条主题导读路线");
  }
  const seen = new Set();
  return input.map((guide) => {
    if (!guide || typeof guide !== "object" || Array.isArray(guide)) {
      throw new Error("主题导读路线无效");
    }
    const id = String(guide.id || "");
    if (!READING_GUIDE_IDS.includes(id) || seen.has(id)) throw new Error("主题导读路线无效或重复");
    seen.add(id);
    const title = String(guide.title || "").trim();
    const audience = String(guide.audience || "").trim();
    const description = String(guide.description || "").trim();
    if (!title || title.length > 40 || audience.length > 140 || description.length > 200) {
      throw new Error("主题导读标题或说明过长");
    }
    const workIds = guide.workIds;
    const reasons = guide.reasons;
    if (!Array.isArray(workIds) || workIds.length < 1 || workIds.length > 8 ||
        !Array.isArray(reasons) || reasons.length !== workIds.length) {
      throw new Error("每条路线需要 1–8 篇作品，且每篇有对应导读语");
    }
    const unique = new Set();
    const cleanIds = workIds.map((value) => {
      const workId = String(value || "").trim();
      if (!/^\d{4}\/[^\s/]{1,180}$/.test(workId) || unique.has(workId)) {
        throw new Error("作品编号无效或在同一路线内重复");
      }
      unique.add(workId);
      return workId;
    });
    const cleanReasons = reasons.map((value) => {
      const reason = String(value || "").trim();
      if (reason.length > 100) throw new Error("单篇导读语不能超过 100 字");
      return reason;
    });
    return { id, title, audience, description, workIds: cleanIds, reasons: cleanReasons };
  });
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

function safeReadingStateInput(input) {
  const workId = String(input && input.workId || "").trim();
  const separator = workId.indexOf("/");
  if (separator < 1 || workId.length > 260) throw new Error("作品编号无效。");
  const editionSlug = workId.slice(0, separator);
  if (!manifestCatalogueIds(editionSlug).includes(workId)) throw new Error("作品不在公开目录中。");
  const progressValue = Number(input.progress);
  const progress = Number.isFinite(progressValue) ? Math.max(0, Math.min(1, progressValue)) : 0;
  let positionJson = null;
  if (input.position && typeof input.position === "object") {
    const version = String(input.position.version || "").slice(0, 80);
    const anchor = String(input.position.anchor || "").slice(0, 160);
    const offset = Number(input.position.offset);
    if (version && anchor && Number.isFinite(offset)) {
      positionJson = JSON.stringify({
        version,
        anchor,
        offset: Math.max(0, Math.min(1, offset)),
      });
      if (positionJson.length > 512) throw new Error("阅读位置过长。");
    }
  }
  function optionalTime(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const time = Date.parse(raw);
    if (!Number.isFinite(time) || time > Date.now() + 5 * 60 * 1000) return "";
    return new Date(time).toISOString();
  }
  const clientTime = Date.parse(String(input.updatedAt || ""));
  const updatedAt = Number.isFinite(clientTime) && clientTime <= Date.now() + 5 * 60 * 1000
    ? new Date(clientTime).toISOString()
    : new Date().toISOString();
  return {
    workId,
    progress,
    positionJson,
    markedReadAt: optionalTime(input.markedReadAt),
    laterAt: optionalTime(input.laterAt),
    updatedAt,
  };
}

function serializedReadingState(row) {
  if (!row) return null;
  let position = null;
  try { position = row.positionJson ? JSON.parse(row.positionJson) : null; } catch (e) { /* ignore invalid legacy value */ }
  return {
    workId: row.workId,
    progress: Math.max(0, Math.min(1, Number(row.progress) || 0)),
    position,
    markedReadAt: row.markedReadAt || "",
    laterAt: row.laterAt || "",
    updatedAt: row.updatedAt || "",
  };
}

function readingShelfGeneration(qq) {
  const row = db.prepare("SELECT generation FROM reading_shelf_meta WHERE qq = ?").get(qq);
  return Math.max(0, Number(row && row.generation) || 0);
}

function readingShelfEntries(qq) {
  return db.prepare(
    "SELECT workId, progress, positionJson, markedReadAt, laterAt, updatedAt " +
    "FROM reading_states WHERE qq = ? ORDER BY updatedAt DESC LIMIT 2000",
  ).all(qq).map(serializedReadingState);
}

function upsertReadingState(qq, input) {
  const next = safeReadingStateInput(input);
  db.prepare(
    "INSERT INTO reading_states (qq, workId, progress, positionJson, markedReadAt, laterAt, updatedAt) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?) " +
    "ON CONFLICT(qq, workId) DO UPDATE SET " +
    "progress = excluded.progress, positionJson = excluded.positionJson, " +
    "markedReadAt = excluded.markedReadAt, laterAt = excluded.laterAt, updatedAt = excluded.updatedAt " +
    "WHERE excluded.updatedAt > reading_states.updatedAt",
  ).run(qq, next.workId, next.progress, next.positionJson, next.markedReadAt, next.laterAt, next.updatedAt);
  const row = db.prepare(
    "SELECT workId, progress, positionJson, markedReadAt, laterAt, updatedAt " +
    "FROM reading_states WHERE qq = ? AND workId = ?",
  ).get(qq, next.workId);
  return serializedReadingState(row);
}

function createReplyNotification(recipientQq, actorQq, workId, rootId, commentId, createdAt) {
  if (!recipientQq || recipientQq === actorQq) return;
  db.prepare(
    "INSERT OR IGNORE INTO comment_notifications " +
    "(id, recipientQq, workId, rootId, commentId, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(crypto.randomUUID(), recipientQq, workId, rootId, commentId, createdAt);
}

function ratingAchievementDefinitions(total) {
  const count = Math.max(0, Number(total) || 0);
  const thresholds = [];
  for (let threshold = 5; threshold < count; threshold += 5) {
    thresholds.push(threshold);
  }
  if (count > 0) thresholds.push(count);
  return Array.from(new Set(thresholds)).map((threshold) => {
    const isFirst = threshold === 5;
    const isComplete = threshold === count;
    const title = RATING_ACHIEVEMENT_TITLES[threshold] ||
      (isComplete ? "幻梦全录" : "第" + Math.ceil(threshold / 5) + "层回声");
    let description;
    if (isFirst) {
      description = "你已为本届 5 份档案留下评议。幻梦境的门，已经向你敞开。";
    } else if (isComplete) {
      description = "你已为本届全部 " + count + " 份档案留下评议。此番下潜，幻梦境已被你完整记录。";
    } else {
      description = "你已为本届 " + threshold + " 份档案留下评议。梦境的回声，又向深处延伸一步。";
    }
    return {
      key: isFirst ? "first-five" : isComplete ? "full-volume" : "rated-" + threshold,
      threshold,
      title,
      description,
    };
  });
}

function ratingProgressForUser(qq, editionSlug) {
  const eligibleWorkIds = manifestCatalogueIds(editionSlug);
  const eligible = new Set(eligibleWorkIds);
  const myRatings = db
    .prepare("SELECT workId, chuanlu, dangan, overall FROM ratings WHERE qq = ?")
    .all(qq)
    .filter((row) => eligible.has(row.workId));
  const ratedWorkIds = myRatings.map((row) => row.workId);
  return {
    editionSlug,
    ratedWorkIds,
    myRatings,
    ratedCount: ratedWorkIds.length,
    eligibleWorkCount: eligibleWorkIds.length,
    milestone: 5,
  };
}

function ratingProgressWithAchievements(qq, progress) {
  const definitions = ratingAchievementDefinitions(progress.eligibleWorkCount);
  const existingRows = db.prepare(
    "SELECT achievementKey, unlockedAt, notifiedAt FROM rating_achievements WHERE qq = ? AND editionSlug = ?",
  ).all(qq, progress.editionSlug);
  const existing = new Map(existingRows.map((row) => [row.achievementKey, row]));
  const missingReached = definitions.filter((definition) =>
    definition.threshold <= progress.ratedCount && !existing.has(definition.key),
  );
  const newestMissingKey = missingReached.length
    ? missingReached[missingReached.length - 1].key
    : "";
  const now = new Date().toISOString();
  missingReached.forEach((definition) => {
    const notifiedAt = definition.key === newestMissingKey ? null : now;
    db.prepare(
      "INSERT OR IGNORE INTO rating_achievements (id, qq, editionSlug, achievementKey, unlockedAt, notifiedAt) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      ratingAchievementId(qq, progress.editionSlug, definition.key),
      qq,
      progress.editionSlug,
      definition.key,
      now,
      notifiedAt,
    );
  });

  const rows = db.prepare(
    "SELECT achievementKey, unlockedAt, notifiedAt FROM rating_achievements WHERE qq = ? AND editionSlug = ?",
  ).all(qq, progress.editionSlug);
  const byKey = new Map(rows.map((row) => [row.achievementKey, row]));
  const achievements = definitions.map((definition) => {
    const row = byKey.get(definition.key);
    return Object.assign({}, definition, {
      unlocked: !!row,
      noticePending: !!(row && !row.notifiedAt),
      unlockedAt: row ? row.unlockedAt : null,
    });
  });
  const pendingAchievements = achievements.filter((item) => item.noticePending);
  const nextAchievement = achievements.find((item) => !item.unlocked) || null;
  return Object.assign({}, progress, {
    achievements,
    pendingAchievements,
    nextAchievement,
    achievementUnlocked: achievements.some((item) => item.unlocked),
    achievementNoticePending: pendingAchievements.length > 0,
  });
}

function ratingAchievementId(qq, editionSlug, achievementKey) {
  return [qq, editionSlug, achievementKey].join("::");
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
  const excluded = disqualifiedIdsOf(getSettings(), editionSlug);
  return config.catalogueWorkIds.filter((workId) => !excluded.has(workId)).map((workId) => {
    const ratingRow = db
      .prepare("SELECT COUNT(*) AS count FROM counted_ratings WHERE workId = ?")
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
  const excluded = disqualifiedIdsOf(getSettings(), editionSlug);
  return {
    editionSlug,
    date,
    items: rows.filter((row) => !excluded.has(row.workId)).map((row) => ({
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

// 管理员正文仍是不可信 HTML；用解析器处理标签、属性和实体编码。
const { sanitizeWorkHtml } = require("./sanitize-work-html.cjs");

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
  // QQ 邮箱的通知预览会折叠纯文本换行，因此首行本身必须能完整表达
  // “验证码”和有效期，不能依赖空行把六码与“10 分钟”隔开。
  const summary = "验证码：" + code + "（" + minutes + " 分钟内有效）";
  const text = [
    summary,
    "",
    "请在幻梦境档案馆的注册页面输入此验证码。",
    "如果不是你本人操作，请忽略此邮件。",
  ].join("\n");
  const html = [
    '<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f5f3ef;color:#292522;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;">',
    '<main style="max-width:520px;margin:0 auto;padding:32px;background:#fffdf9;border:1px solid #e5dfd7;border-radius:12px;">',
    '<p style="margin:0 0 8px;color:#9a4a39;font-size:13px;letter-spacing:.12em;">幻梦境档案馆</p>',
    '<h1 style="margin:0 0 20px;font-size:24px;line-height:1.35;">注册验证码</h1>',
    '<p style="margin:0 0 14px;font-size:16px;line-height:1.7;">请在注册页面输入以下验证码：</p>',
    '<div style="margin:0 0 16px;padding:16px 20px;border:1px solid #d8c7bb;border-radius:8px;background:#f8f3ed;color:#9a4a39;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:.16em;text-align:center;">' + code + '</div>',
    '<p style="margin:0 0 20px;font-size:15px;line-height:1.7;"><strong>有效期：</strong>' + minutes + ' 分钟</p>',
    '<p style="margin:0;padding-top:16px;border-top:1px solid #eee7df;color:#706a64;font-size:13px;line-height:1.7;">如果不是你本人操作，请忽略此邮件。</p>',
    '</main></body></html>',
  ].join("");
  await t.sendMail({
    from: '"' + SMTP_CONFIG.fromName + '" <' + SMTP_CONFIG.user + ">",
    to: qq + "@qq.com",
    subject: "幻梦境档案馆注册验证码",
    text: text,
    html: html,
  });
}

async function sendPasswordResetMail(qq, code) {
  const t = await getTransporter();
  if (!t) throw new Error("邮件服务尚未配置");
  const minutes = Math.round(CODE_TTL_MS / 60000);
  const summary = "密码找回验证码：" + code + "（" + minutes + " 分钟内有效）";
  const text = [
    summary,
    "",
    "请在幻梦境档案馆的密码找回页面输入此验证码。",
    "如果不是你本人操作，请忽略此邮件。",
  ].join("\n");
  const html = [
    '<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f5f3ef;color:#292522;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',\'Microsoft YaHei\',sans-serif;">',
    '<main style="max-width:520px;margin:0 auto;padding:32px;background:#fffdf9;border:1px solid #e5dfd7;border-radius:12px;">',
    '<p style="margin:0 0 8px;color:#9a4a39;font-size:13px;letter-spacing:.12em;">幻梦境档案馆</p>',
    '<h1 style="margin:0 0 20px;font-size:24px;line-height:1.35;">密码找回验证码</h1>',
    '<p style="margin:0 0 14px;font-size:16px;line-height:1.7;">请在密码找回页面输入以下验证码：</p>',
    '<div style="margin:0 0 16px;padding:16px 20px;border:1px solid #d8c7bb;border-radius:8px;background:#f8f3ed;color:#9a4a39;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:.16em;text-align:center;">' + code + '</div>',
    '<p style="margin:0 0 20px;font-size:15px;line-height:1.7;"><strong>有效期：</strong>' + minutes + ' 分钟</p>',
    '<p style="margin:0;padding-top:16px;border-top:1px solid #eee7df;color:#706a64;font-size:13px;line-height:1.7;">如果不是你本人操作，请忽略此邮件。此验证码只用于重置密码。</p>',
    '</main></body></html>',
  ].join("");
  await t.sendMail({
    from: '"' + SMTP_CONFIG.fromName + '" <' + SMTP_CONFIG.user + ">",
    to: qq + "@qq.com",
    subject: "幻梦境档案馆密码找回验证码",
    text,
    html,
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
      SELECT workId FROM counted_ratings WHERE workId LIKE ?
      UNION SELECT workId FROM comments WHERE workId LIKE ?
    ), ratings_by_work AS (
      SELECT workId, COUNT(*) AS ratingCount, AVG(chuanlu) AS chuanluAvg,
        AVG(dangan) AS danganAvg, AVG(overall) AS overallAvg,
        AVG((chuanlu + dangan + overall) / 3.0) AS totalAvg, MAX(t) AS lastRatingAt
      FROM counted_ratings WHERE workId LIKE ? GROUP BY workId
    ), comments_by_work AS (
      SELECT workId, COUNT(*) AS commentCount, MAX(COALESCE(editedAt, t)) AS lastCommentAt
      FROM comments WHERE workId LIKE ? GROUP BY workId
    )
    SELECT works.workId, COALESCE(r.ratingCount, 0) AS ratingCount,
      r.chuanluAvg, r.danganAvg, r.overallAvg, r.totalAvg,
      COALESCE(c.commentCount, 0) AS commentCount,
      MAX(COALESCE(r.lastRatingAt, ''), COALESCE(c.lastCommentAt, '')) AS lastActivityAt
    FROM works
    LEFT JOIN ratings_by_work r ON r.workId = works.workId
    LEFT JOIN comments_by_work c ON c.workId = works.workId
    ORDER BY works.workId ASC
  `).all(prefix, prefix, prefix, prefix);
}

// 搜索面板的“馆内热议”：投票为主、评论为辅，新互动权重更高，最多 4 条，同届最多 2 条。
const SEARCH_RECOMMENDATION_LIMIT = 4;
const SEARCH_RECOMMENDATION_MAX_PER_EDITION = 2;
const SEARCH_RECOMMENDATION_MIN_ACTIVITY = 2;

function searchRecommendations() {
  // 互动按时间分档加权：最近 7 天记满权重，8-30 天打折，更早的只保留少量权重。
  const rows = db.prepare(`
    WITH works AS (
      SELECT workId FROM counted_ratings UNION SELECT workId FROM comments
    ), rating_activity AS (
      SELECT workId, COUNT(*) AS ratingCount,
        SUM(CASE
          WHEN datetime(t) >= datetime('now', '-7 days') THEN 1.0
          WHEN datetime(t) >= datetime('now', '-30 days') THEN 0.6
          ELSE 0.3
        END) AS ratingWeight
      FROM counted_ratings GROUP BY workId
    ), comment_activity AS (
      SELECT workId, COUNT(*) AS commentCount,
        SUM(CASE
          WHEN datetime(COALESCE(editedAt, t)) >= datetime('now', '-7 days') THEN 1.0
          WHEN datetime(COALESCE(editedAt, t)) >= datetime('now', '-30 days') THEN 0.6
          ELSE 0.3
        END) AS commentWeight
      FROM comments GROUP BY workId
    )
    SELECT works.workId AS workId,
      COALESCE(r.ratingCount, 0) AS ratingCount,
      COALESCE(c.commentCount, 0) AS commentCount,
      COALESCE(r.ratingWeight, 0) AS ratingWeight,
      COALESCE(c.commentWeight, 0) AS commentWeight
    FROM works
    LEFT JOIN rating_activity r ON r.workId = works.workId
    LEFT JOIN comment_activity c ON c.workId = works.workId
  `).all();
  const disqualified = getSettings().disqualifiedWorks || {};
  const candidates = rows
    .filter((row) => /^[A-Za-z0-9_-]{1,64}\//.test(String(row.workId || "")) && !disqualified[row.workId])
    .map((row) => {
      const ratingCount = Number(row.ratingCount) || 0;
      const commentCount = Number(row.commentCount) || 0;
      const ratingWeight = Number(row.ratingWeight) || 0;
      const commentWeight = Number(row.commentWeight) || 0;
      return {
        workId: row.workId,
        ratingCount,
        commentCount,
        activity: ratingCount + commentCount,
        // 投票权重 3、评论权重 1；对数压缩避免单篇长期占满入口。
        score: Math.log1p(ratingWeight) * 3 + Math.log1p(commentWeight),
      };
    })
    .filter((row) => row.activity >= SEARCH_RECOMMENDATION_MIN_ACTIVITY);
  candidates.sort((a, b) =>
    b.score - a.score ||
    b.ratingCount - a.ratingCount ||
    a.workId.localeCompare(b.workId),
  );
  const editionCounts = new Map();
  const picked = candidates.filter((row) => {
    const slug = row.workId.split("/")[0];
    const count = editionCounts.get(slug) || 0;
    if (count >= SEARCH_RECOMMENDATION_MAX_PER_EDITION) return false;
    editionCounts.set(slug, count + 1);
    return true;
  }).slice(0, SEARCH_RECOMMENDATION_LIMIT);
  for (const row of candidates) {
    if (picked.length >= SEARCH_RECOMMENDATION_LIMIT) break;
    if (!picked.includes(row)) picked.push(row);
  }
  return picked.map(({ score, activity, ratingWeight, commentWeight, ...row }) => row);
}

// 除名作品：不计名次、不进评分分布、不再接受评分；正文与评论照常保留。
const DISQUALIFY_REASON_DEFAULT =
  "有确切证据显示，本档案由 AI 深度参与写成，不符合本群的写作规范。档案馆不评判 AI 写作本身的是非；只是这里收藏的，向来是调查员亲手写下的字。";

function disqualifiedWorksOf(settings, editionSlug) {
  const all = (settings && settings.disqualifiedWorks) || {};
  return Object.fromEntries(Object.entries(all).filter(([workId]) => workId.startsWith(editionSlug + "/")));
}

function disqualifiedIdsOf(settings, editionSlug) {
  return new Set(Object.keys(disqualifiedWorksOf(settings, editionSlug)));
}

function disqualifiedListOf(settings, editionSlug) {
  return Object.entries(disqualifiedWorksOf(settings, editionSlug))
    .map(([workId, entry]) => ({ workId, reason: entry.reason, at: entry.at }))
    .sort((a, b) => a.workId.localeCompare(b.workId));
}

function editionLeaderboard(editionSlug, excluded = new Set()) {
  return reportWorkStats(editionSlug)
    .filter((row) => Number(row.ratingCount) > 0 && !excluded.has(row.workId))
    .sort((a, b) =>
      Number(b.totalAvg) - Number(a.totalAvg) ||
      Number(b.ratingCount) - Number(a.ratingCount) ||
      a.workId.localeCompare(b.workId),
    )
    .map((row, index) => ({
      rank: index + 1,
      workId: row.workId,
      ratingCount: row.ratingCount,
      totalAvg: row.totalAvg,
    }));
}

function editionScoreDistributions(editionSlug, excluded = new Set()) {
  const dimensions = ["chuanlu", "dangan", "overall"];
  const selections = dimensions.flatMap((dimension) =>
    [1, 2, 3, 4, 5].map(
      (score) => `SUM(CASE WHEN ${dimension} = ${score} THEN 1 ELSE 0 END) AS ${dimension}${score}`,
    ),
  );
  const rows = db.prepare(`
    SELECT workId, COUNT(*) AS ratingCount, ${selections.join(", ")}
    FROM counted_ratings
    WHERE workId LIKE ?
    GROUP BY workId
  `).all(editionSlug + "/%");
  const distributions = {};
  rows.filter((row) => !excluded.has(row.workId)).forEach((row) => {
    distributions[row.workId] = {
      ratingCount: Number(row.ratingCount) || 0,
      ...Object.fromEntries(dimensions.map((dimension) => [
        dimension,
        [1, 2, 3, 4, 5].map((score) => Number(row[dimension + score]) || 0),
      ])),
    };
  });
  return distributions;
}

const EDITION_PHASES = ["征文", "评分", "统计", "公示"];

function publicationOf(editionSlug) {
  const row = db.prepare("SELECT snapshot FROM edition_publications WHERE editionSlug = ?").get(editionSlug);
  return row ? JSON.parse(row.snapshot) : null;
}

function publicPublication(publication) {
  return publication ? { publishedAt: publication.publishedAt } : null;
}

function editionAuthorReveals(settings, editionSlug) {
  const authorReveals = {};
  const bindings = settings.authorBindings || {};
  const excluded = disqualifiedIdsOf(settings, editionSlug);
  manifestCatalogueIds(editionSlug).forEach((workId) => {
    if (excluded.has(workId)) return;
    const qq = String(bindings[workId] || "");
    const author = qq && getUser(qq);
    if (author && author.nickname) authorReveals[workId] = author.nickname;
  });
  return authorReveals;
}

function publicEditionAwards(settings, editionSlug, leaderboard) {
  const config = settings.awardConfigs && settings.awardConfigs[editionSlug];
  if (!config) {
    return { published: true, authorRevealRankLimit: 0, awardedWorkIds: [], authorReveals: {}, specialAwards: [] };
  }
  const catalogueIds = new Set(manifestCatalogueIds(editionSlug));
  const excluded = disqualifiedIdsOf(settings, editionSlug);
  const specialAwards = (Array.isArray(config.specialAwards) ? config.specialAwards : [])
    .filter((award) => award && catalogueIds.has(String(award.workId || "")) && !excluded.has(String(award.workId || "")))
    .map((award) => ({
      name: String(award.name || ""),
      workId: String(award.workId || ""),
      excerpt: String(award.excerpt || ""),
      review: String(award.review || ""),
    }));
  const rankLimit = Math.max(0, Math.min(catalogueIds.size, Number(config.authorRevealRankLimit) || 0));
  const revealIds = new Set(leaderboard.slice(0, rankLimit).map((row) => row.workId));
  specialAwards.forEach((award) => revealIds.add(award.workId));
  const authorReveals = {};
  const bindings = settings.authorBindings || {};
  revealIds.forEach((workId) => {
    const qq = String(bindings[workId] || "");
    if (!qq) return;
    const author = getUser(qq);
    if (author && author.nickname) authorReveals[workId] = author.nickname;
  });
  return {
    published: true,
    authorRevealRankLimit: rankLimit,
    awardedWorkIds: Array.from(revealIds),
    authorReveals,
    specialAwards,
  };
}

function createPublication(settings, editionSlug, confirmedBy) {
  if (publicationOf(editionSlug)) throw new Error("本届已有正式公示");
  const catalogueIds = new Set(manifestCatalogueIds(editionSlug));
  if (!catalogueIds.size) throw new Error("本届目录清单为空，无法发布公示");
  const excluded = disqualifiedIdsOf(settings, editionSlug);
  const leaderboard = editionLeaderboard(editionSlug, excluded);
  if (leaderboard.some((row) => !catalogueIds.has(row.workId))) {
    throw new Error("评分中存在目录外作品，请核对后再公示");
  }
  const publishedAt = new Date().toISOString();
  const publication = {
    editionSlug,
    publishedAt,
    confirmedBy,
    leaderboard,
    distributions: editionScoreDistributions(editionSlug, excluded),
    authorReveals: editionAuthorReveals(settings, editionSlug),
    awards: publicEditionAwards(settings, editionSlug, leaderboard),
    disqualified: disqualifiedListOf(settings, editionSlug),
  };
  db.prepare("INSERT INTO edition_publications (editionSlug, publishedAt, snapshot) VALUES (?, ?, ?)")
    .run(editionSlug, publishedAt, JSON.stringify(publication));
  return publication;
}

function phaseAdvanceOf(settings, editionSlug) {
  const state = editionState(settings, editionSlug);
  const advance = state.phaseAdvance;
  const phaseIndex = EDITION_PHASES.indexOf(state.phase);
  const next = phaseIndex < 0 ? null : EDITION_PHASES[phaseIndex + 1];
  if (!advance || advance.source !== "server" || advance.next !== next || !Array.isArray(advance.votes)) {
    return null;
  }
  const votes = [...new Set(advance.votes)].filter((qq) => {
    const candidate = getUser(qq);
    return candidate && candidate.enabled && resolveRole(settings, qq) === "admin";
  });
  return votes.length ? { next, votes, source: "server" } : null;
}

function emptyAwardConfig() {
  return { authorRevealRankLimit: 25, specialAwards: [] };
}

function saveableAwardConfig(editionSlug, incoming) {
  const catalogueIds = new Set(manifestCatalogueIds(editionSlug));
  const rankLimit = Number(incoming && incoming.authorRevealRankLimit);
  if (!Number.isInteger(rankLimit) || rankLimit < 0 || rankLimit > catalogueIds.size) {
    throw new Error("作者公开名次上限无效");
  }
  const rawAwards = Array.isArray(incoming && incoming.specialAwards)
    ? incoming.specialAwards
    : [];
  if (rawAwards.length > 6) throw new Error("本届最多设置 6 项特别奖");
  const specialAwards = rawAwards.map((award) => {
    const name = String((award && award.name) || "").trim().slice(0, 100);
    const workId = String((award && award.workId) || "").trim();
    const excerpt = String((award && award.excerpt) || "").trim().slice(0, 3000);
    const review = String((award && award.review) || "").trim().slice(0, 30000);
    if (!name || !workId) throw new Error("每项特别奖都需要填写奖项名称和获奖作品");
    if (!catalogueIds.has(workId)) throw new Error("特别奖作品不属于当前届");
    return { name, workId, excerpt, review };
  });
  return { authorRevealRankLimit: rankLimit, specialAwards };
}

function reportSummary() {
  return {
    users: Number(db.prepare("SELECT COUNT(*) AS c FROM users").get().c),
    enabledUsers: Number(db.prepare("SELECT COUNT(*) AS c FROM users WHERE enabled = 1").get().c),
    ratings: Number(db.prepare("SELECT COUNT(*) AS c FROM counted_ratings").get().c),
    comments: Number(db.prepare("SELECT COUNT(*) AS c FROM comments").get().c),
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

    case "getSearchRecommendations":
      return { works: searchRecommendations() };

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
        readingGuides: Array.isArray(settings.readingGuides) ? settings.readingGuides : null,
        disqualifiedWorks: Object.fromEntries(Object.entries(settings.disqualifiedWorks || {})
          .map(([workId, entry]) => [workId, { reason: entry.reason, at: entry.at }])),
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
      const publication = publicationOf(editionSlug);
      const workStats = reportWorkStats(editionSlug);
      const rankingsAvailable = Boolean(
        publication || st.phase === "统计",
      );
      const excluded = disqualifiedIdsOf(settings, editionSlug);
      const heat = workStats.map((row) => ({
        workId: row.workId,
        commentCount: row.commentCount,
        lastActivityAt: row.lastActivityAt,
      }));
      return {
        rankingsAvailable,
        heat,
        leaderboard: publication ? publication.leaderboard : rankingsAvailable ? editionLeaderboard(editionSlug, excluded) : [],
        distributions: publication ? publication.distributions : rankingsAvailable ? editionScoreDistributions(editionSlug, excluded) : null,
        authorReveals: publication
          ? publication.authorReveals || publication.awards.authorReveals || {}
          : rankingsAvailable ? editionAuthorReveals(settings, editionSlug) : {},
        publication: publicPublication(publication),
        disqualified: publication ? publication.disqualified || [] : disqualifiedListOf(settings, editionSlug),
      };
    }

    case "getEditionAwards": {
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) throw new Error("届别编号无效");
      const publication = publicationOf(editionSlug);
      if (publication) return {
        ...publication.awards,
        authorReveals: publication.authorReveals || publication.awards.authorReveals || {},
        publication: publicPublication(publication),
      };
      return { published: false, authorRevealRankLimit: 0, awardedWorkIds: [], authorReveals: {}, specialAwards: [], publication: null };
    }

    case "requestPasswordReset": {
      const qq = String(payload.qq || "").trim();
      if (!/^\d{5,12}$/.test(qq)) throw new Error("请输入 5–12 位数字 QQ 号。");

      const now = Date.now();
      const retryAfterSeconds = Math.round(CODE_RESEND_COOLDOWN_MS / 1000);
      const genericResponse = {
        message: "若账号存在且可找回，验证码将发送至其 QQ 邮箱。请检查收件箱和垃圾邮件。",
        retryAfterSeconds,
      };
      const last = db
        .prepare("SELECT created_at FROM password_reset_verifications WHERE qq = ? ORDER BY created_at DESC LIMIT 1")
        .get(qq);
      const qqHour = db
        .prepare("SELECT COUNT(*) AS c FROM password_reset_verifications WHERE qq = ? AND created_at > ?")
        .get(qq, now - 3600 * 1000).c;
      const ipMinute = db
        .prepare("SELECT COUNT(*) AS c FROM password_reset_verifications WHERE request_ip = ? AND created_at > ?")
        .get(clientIp, now - 60 * 1000).c;
      const ipHour = db
        .prepare("SELECT COUNT(*) AS c FROM password_reset_verifications WHERE request_ip = ? AND created_at > ?")
        .get(clientIp, now - 3600 * 1000).c;
      const failedQqHour = db
        .prepare("SELECT COALESCE(SUM(verify_attempts), 0) AS c FROM password_reset_verifications WHERE qq = ? AND created_at > ?")
        .get(qq, now - 3600 * 1000).c;
      const failedIpHour = db
        .prepare("SELECT COALESCE(SUM(verify_attempts), 0) AS c FROM password_reset_verifications WHERE request_ip = ? AND created_at > ?")
        .get(clientIp, now - 3600 * 1000).c;
      const registrationDayTotal = db
        .prepare("SELECT COUNT(*) AS c FROM email_verifications WHERE created_at > ?")
        .get(now - 24 * 3600 * 1000).c;
      const resetDayTotal = db
        .prepare("SELECT COUNT(*) AS c FROM password_reset_verifications WHERE sent_at > ?")
        .get(now - 24 * 3600 * 1000).c;
      const cooldownActive = last && now - Number(last.created_at) < CODE_RESEND_COOLDOWN_MS;
      const requestLimited =
        cooldownActive ||
        Number(qqHour) >= RESET_CODE_SEND_PER_QQ_HOUR ||
        Number(ipMinute) >= RESET_CODE_SEND_PER_IP_MINUTE ||
        Number(ipHour) >= RESET_CODE_SEND_PER_IP_HOUR ||
        Number(failedQqHour) >= RESET_CODE_MAX_FAILURES_PER_QQ_HOUR ||
        Number(failedIpHour) >= RESET_CODE_MAX_FAILURES_PER_IP_HOUR ||
        Number(registrationDayTotal) + Number(resetDayTotal) >= CODE_SEND_GLOBAL_DAILY;

      if (!requestLimited) {
        const userExists = getUser(qq);
        const canSend = !!(userExists && userExists.enabled && mailerConfigured());
        const generatedCode = String(crypto.randomInt(10000000, 100000000));
        const code = canSend ? generatedCode : "";
        const codeHash = hashCode(generatedCode);
        const id = crypto.randomUUID();
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("UPDATE password_reset_verifications SET used_at = ? WHERE qq = ? AND used_at IS NULL").run(now, qq);
          db.prepare(`
            INSERT INTO password_reset_verifications
              (id, qq, code_hash, expires_at, created_at, used_at, verify_attempts, request_ip, sent_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
          `).run(
            id,
            qq,
            code ? codeHash : "",
            now + CODE_TTL_MS,
            now,
            code ? null : now,
            clientIp,
            code ? now : null,
          );
          db.exec("COMMIT");
        } catch (err) {
          try {
            db.exec("ROLLBACK");
          } catch (e) {
            /* ignore */
          }
          throw err;
        }

        if (code) {
          sendPasswordResetMail(qq, code).catch((err) => {
            db.prepare("UPDATE password_reset_verifications SET used_at = ? WHERE id = ? AND used_at IS NULL").run(Date.now(), id);
            console.error("[requestPasswordReset] 邮件发送失败：" + ((err && err.message) || err));
          });
        }
        db.prepare("DELETE FROM password_reset_verifications WHERE created_at < ?").run(now - VERIFY_RETENTION_MS);
      }

      return genericResponse;
    }

    case "resetPassword": {
      const qq = String(payload.qq || "").trim();
      const code = String(payload.code || "").trim();
      const newPassword = String(payload.newPassword || "");
      if (!/^\d{5,12}$/.test(qq)) throw new Error("请输入 5–12 位数字 QQ 号。");
      if (!/^\d{8}$/.test(code)) throw new Error("请输入 8 位数字验证码。");
      if (newPassword.length < 4) throw new Error("新密码至少 4 位。");
      if (newPassword.length > 256) throw new Error("新密码不能超过 256 个字符。");

      let reset = false;
      let invalid = false;
      const now = Date.now();
      db.exec("BEGIN IMMEDIATE");
      try {
        const challenge = db
          .prepare("SELECT id, code_hash, expires_at, used_at, verify_attempts FROM password_reset_verifications WHERE qq = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1")
          .get(qq);
        if (
          !challenge ||
          !challenge.code_hash ||
          Number(challenge.expires_at) <= now ||
          Number(challenge.verify_attempts) >= RESET_CODE_MAX_ATTEMPTS
        ) {
          if (challenge && challenge.id) {
            db.prepare("UPDATE password_reset_verifications SET used_at = ? WHERE id = ?").run(now, challenge.id);
          }
          invalid = true;
        } else if (!verifyCode(code, challenge.code_hash)) {
          const attempts = Number(challenge.verify_attempts) + 1;
          const accountFailures = Number(db
            .prepare("SELECT COALESCE(SUM(verify_attempts), 0) AS c FROM password_reset_verifications WHERE qq = ? AND created_at > ?")
            .get(qq, now - 3600 * 1000).c) + 1;
          const ipFailures = Number(db
            .prepare("SELECT COALESCE(SUM(verify_attempts), 0) AS c FROM password_reset_verifications WHERE request_ip = ? AND created_at > ?")
            .get(clientIp, now - 3600 * 1000).c) + 1;
          const exhausted =
            attempts >= RESET_CODE_MAX_ATTEMPTS ||
            accountFailures >= RESET_CODE_MAX_FAILURES_PER_QQ_HOUR ||
            ipFailures >= RESET_CODE_MAX_FAILURES_PER_IP_HOUR;
          db.prepare("UPDATE password_reset_verifications SET verify_attempts = ?, used_at = ? WHERE id = ?")
            .run(attempts, exhausted ? now : null, challenge.id);
          invalid = true;
        } else {
          const target = getUser(qq);
          if (!target || !target.enabled) {
            db.prepare("UPDATE password_reset_verifications SET used_at = ? WHERE id = ?").run(now, challenge.id);
            invalid = true;
          } else {
            db.prepare("UPDATE users SET pass = ? WHERE qq = ?").run(hashPassword(newPassword), qq);
            db.prepare("UPDATE password_reset_verifications SET used_at = ? WHERE qq = ? AND used_at IS NULL").run(now, qq);
            db.prepare("DELETE FROM tokens WHERE qq = ?").run(qq);
            reset = true;
          }
        }
        db.exec("COMMIT");
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch (e) {
          /* ignore */
        }
        throw err;
      }
      if (invalid || !reset) throw new Error("验证码无效或已过期，请重新申请。");
      return { requireLogin: true };
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
      const registrationDayTotal = db
        .prepare("SELECT COUNT(*) AS c FROM email_verifications WHERE created_at > ?")
        .get(now - 24 * 3600 * 1000).c;
      const resetDayTotal = db
        .prepare("SELECT COUNT(*) AS c FROM password_reset_verifications WHERE sent_at > ?")
        .get(now - 24 * 3600 * 1000).c;
      const dayTotal = Number(registrationDayTotal) + Number(resetDayTotal);
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
      const excludedQQs = new Set(db.prepare("SELECT qq FROM rating_exclusions").all().map((row) => row.qq));
      const countedRatings = rawRatings.filter((rating) => !excludedQQs.has(rating.qq));
      let ratings = [];
      if (session && session.role === "admin") {
        ratings = countedRatings;
      } else if (st.phase === "征文" || st.phase === "评分") {
        // 评分阶段：普通用户只能看到自己的评分
        if (user) {
          ratings = rawRatings.filter((r) => r.qq === user.qq);
        } else {
          ratings = [];
        }
      } else if (st.phase === "统计") {
        // 统计阶段公开汇总接口，个人评分仍仅返回本人记录。
        ratings = user ? rawRatings.filter((r) => r.qq === user.qq) : [];
      } else if (st.phase === "公示") {
        // 公示阶段允许核对均分，但不暴露他人 QQ -> 分数的对应。
        ratings = countedRatings.filter((r) => !user || r.qq !== user.qq);
        if (user) ratings = ratings.concat(rawRatings.filter((r) => r.qq === user.qq));
        ratings = ratings.map((r, idx) => {
          if (user && r.qq === user.qq) return r;
          return {
            ...r,
            qq: "masked-" + (idx + 1),
          };
        });
      }

      // 评论获取：匿名评论对非管理员脱敏
      const rawComments = db.prepare("SELECT id, workId, rootId, qq, name, anonymous, judge, body, t, editedAt, deletedAt FROM comments WHERE workId = ? ORDER BY t ASC, id ASC LIMIT 1000").all(workId);
      const comments = rawComments.map((c) => {
        const isAnon = !!c.anonymous;
        const isSelf = user && c.qq === user.qq;
        const isAdmin = session && session.role === "admin";
        return {
          id: c.id,
          workId: c.workId,
          rootId: c.rootId || null,
          qq: isAdmin || isSelf ? c.qq : "",
          name: isAnon && !isAdmin && !isSelf ? "匿名调查员" : c.name,
          anonymous: isAnon,
          judge: !!c.judge,
          body: c.deletedAt ? "" : c.body,
          deleted: !!c.deletedAt,
          t: c.t,
          editedAt: c.editedAt || "",
        };
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
        authorNote,
        content,
      };
    }

    case "getReadingShelf": {
      if (!user) throw new Error("请登录后查看已同步的阅读记录。");
      return {
        generation: readingShelfGeneration(user.qq),
        entries: readingShelfEntries(user.qq),
      };
    }

    case "saveReadingState": {
      if (!user) throw new Error("请登录后同步阅读记录。");
      const generation = readingShelfGeneration(user.qq);
      if (Number(payload.generation || 0) !== generation) {
        return { entry: null, generation, stale: true };
      }
      return { entry: upsertReadingState(user.qq, payload), generation };
    }

    case "syncReadingShelf": {
      if (!user) throw new Error("请登录后同步阅读记录。");
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      if (entries.length > 2000) throw new Error("阅读记录过多，请分批同步。");
      const generation = readingShelfGeneration(user.qq);
      if (Number(payload.generation || 0) !== generation) {
        return { generation, entries: readingShelfEntries(user.qq), stale: true };
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        entries.forEach((entry) => upsertReadingState(user.qq, entry));
        const rows = readingShelfEntries(user.qq);
        db.exec("COMMIT");
        return { generation, entries: rows };
      } catch (err) {
        try { db.exec("ROLLBACK"); } catch (rollbackError) { /* transaction already ended */ }
        throw err;
      }
    }

    case "clearReadingShelf": {
      if (!user) throw new Error("请登录后清除已同步的阅读记录。");
      db.exec("BEGIN IMMEDIATE");
      try {
        const generation = readingShelfGeneration(user.qq) + 1;
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO reading_shelf_meta (qq, generation, updatedAt) VALUES (?, ?, ?) " +
          "ON CONFLICT(qq) DO UPDATE SET generation = excluded.generation, updatedAt = excluded.updatedAt",
        ).run(user.qq, generation, now);
        db.prepare("DELETE FROM reading_states WHERE qq = ?").run(user.qq);
        db.exec("COMMIT");
        return { generation, entries: [] };
      } catch (err) {
        try { db.exec("ROLLBACK"); } catch (rollbackError) { /* transaction already ended */ }
        throw err;
      }
    }

    case "getStars": {
      if (!user) return { stars: [] };
      const editionSlug = String(payload.editionSlug || "");
      const row = db.prepare("SELECT slugs FROM stars WHERE qq = ? AND editionSlug = ?").get(user.qq, editionSlug);
      return { stars: row ? JSON.parse(row.slugs || "[]") : [] };
    }

    case "getMyRatingProgress": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("请登录后查看评议进度。");
      }
      const editionSlug = String(payload.editionSlug || "");
      const progress = ratingProgressForUser(user.qq, editionSlug);
      return ratingProgressWithAchievements(user.qq, progress);
    }

    case "getMyRatingWorkIds": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("请登录后查看自己的评议记录。");
      }
      const rows = db.prepare("SELECT DISTINCT workId FROM ratings WHERE qq = ?").all(user.qq);
      const allowed = new Set(rows.map((row) => row.workId).filter((workId) => {
        const editionSlug = String(workId || "").split("/")[0];
        return manifestCatalogueIds(editionSlug).includes(workId);
      }));
      return { workIds: Array.from(allowed) };
    }

    case "claimRatingAchievement": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("请登录后领取成就提示。");
      }
      const editionSlug = String(payload.editionSlug || "");
      const progress = ratingProgressForUser(user.qq, editionSlug);
      const progressWithAchievements = ratingProgressWithAchievements(user.qq, progress);
      const pending = progressWithAchievements.pendingAchievements || [];
      const requestedKey = String(payload.achievementKey || "");
      const achievement = requestedKey
        ? pending.find((item) => item.key === requestedKey)
        : pending[0];
      if (!achievement) return { claimed: false };
      const now = new Date().toISOString();
      const result = db.prepare(
        "UPDATE rating_achievements SET notifiedAt = ? WHERE qq = ? AND editionSlug = ? AND achievementKey = ? AND notifiedAt IS NULL",
      ).run(now, user.qq, editionSlug, achievement.key);
      return {
        claimed: Number(result.changes) > 0,
        achievement: Object.assign({}, achievement, { noticePending: false }),
      };
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
      const eligibleWorkIds = manifestCatalogueIds(editionSlug);
      if (eligibleWorkIds.indexOf(workId) === -1) {
        throw new Error("这份档案不在当前届别的可评作品目录中。");
      }
      if (disqualifiedIdsOf(settings, editionSlug).has(workId)) {
        throw new Error("这份档案已被除名，不再接受评分。");
      }
      const chuanlu = Number(payload.chuanlu);
      const dangan = Number(payload.dangan);
      const overall = Number(payload.overall);
      if (![chuanlu, dangan, overall].every((n) => Number.isInteger(n) && n >= 1 && n <= 5)) {
        throw new Error("分数无效");
      }
      const id = workId + "::" + user.qq;
      const t = new Date().toISOString();
      let ratedCountBefore = 0;
      let ratedCountAfter = 0;
      let achievementUnlockedNow = false;
      let unlockedAchievement = null;
      db.exec("BEGIN IMMEDIATE");
      try {
        ratedCountBefore = ratingProgressForUser(user.qq, editionSlug).ratedCount;
        db.prepare(`
          INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(workId, qq) DO UPDATE SET
            chuanlu = excluded.chuanlu,
            dangan = excluded.dangan,
            overall = excluded.overall,
            t = excluded.t
        `).run(id, workId, user.qq, chuanlu, dangan, overall, t);
        ratedCountAfter = ratingProgressForUser(user.qq, editionSlug).ratedCount;

        const definitions = ratingAchievementDefinitions(eligibleWorkIds.length);
        definitions.forEach((definition) => {
          if (ratedCountBefore >= definition.threshold || ratedCountAfter < definition.threshold) return;
          const inserted = db.prepare(
            "INSERT OR IGNORE INTO rating_achievements (id, qq, editionSlug, achievementKey, unlockedAt, notifiedAt) VALUES (?, ?, ?, ?, ?, NULL)",
          ).run(
            ratingAchievementId(user.qq, editionSlug, definition.key),
            user.qq,
            editionSlug,
            definition.key,
            t,
          );
          if (Number(inserted.changes) > 0) {
            achievementUnlockedNow = true;
            unlockedAchievement = Object.assign({}, definition, {
              unlocked: true,
              noticePending: true,
              unlockedAt: t,
            });
          }
        });
        db.exec("COMMIT");
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch (rollbackError) {
          /* ignore rollback failure */
        }
        throw err;
      }

      const record = {
        id,
        workId,
        qq: user.qq,
        chuanlu,
        dangan,
        overall,
        t,
      };
      const finalProgress = ratingProgressWithAchievements(
        user.qq,
        ratingProgressForUser(user.qq, editionSlug),
      );
      const achievementNoticePending = finalProgress.achievementNoticePending;
      return {
        rating: record,
        wasFirstRatingForWork: ratedCountBefore < ratedCountAfter,
        ratedCountAfter,
        eligibleWorkCount: eligibleWorkIds.length,
        achievementUnlocked: achievementUnlockedNow || achievementNoticePending,
        achievementUnlockedNow,
        achievementNoticePending,
        unlockedAchievement,
      };
    }

    case "addComment": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("无权评论");
      }
      const workId = String(payload.workId || "");
      const body = String(payload.body || "").trim().slice(0, BODY_MAX);
      if (!body) throw new Error("评论不能为空");
      if (!workId) throw new Error("缺少作品编号");
      const replyToId = String(payload.replyToId || "").trim();
      const anonymous = !!payload.anonymous;
      const requestId = String(payload.requestId || "").trim();
      if (requestId && (requestId.length < 8 || requestId.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(requestId))) {
        throw new Error("评论请求编号无效。");
      }
      let rootId = null;
      let replyRecipientQq = "";
      if (requestId) {
        const previous = db.prepare(`
          SELECT workId, rootId, anonymous, body, commentJson
          FROM comment_requests WHERE qq = ? AND requestId = ?
        `).get(user.qq, requestId);
        if (previous) {
          if (
            previous.workId !== workId ||
            (previous.rootId || "") !== replyToId ||
            !!previous.anonymous !== anonymous ||
            previous.body !== body
          ) {
            throw new Error("评论请求编号已用于其他内容，请重新载入草稿后再试。");
          }
          return { comment: JSON.parse(previous.commentJson) };
        }
      }
      if (replyToId) {
        const target = db.prepare("SELECT id, workId, rootId, deletedAt, qq FROM comments WHERE id = ?").get(replyToId);
        if (!target || target.workId !== workId) throw new Error("回复目标不存在或不属于这篇作品。");
        if (target.rootId) throw new Error("只能回复初始评论，不能回复其他回复。");
        if (target.deletedAt) throw new Error("该评论已删除，无法回复。");
        rootId = target.id;
        replyRecipientQq = target.qq;
      }
      const editionSlug = workId.split("/")[0];
      const st = editionState(settings, editionSlug);
      const judge = !rootId && session.role === "admin" && st.phase === "统计" && !anonymous;
      const id = crypto.randomBytes(12).toString("hex");
      const t = new Date().toISOString();
      const row = {
        id,
        workId,
        rootId,
        qq: user.qq,
        name: user.nickname,
        anonymous,
        judge,
        body,
        t,
      };
      if (requestId) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const previous = db.prepare(`
            SELECT workId, rootId, anonymous, body, commentJson
            FROM comment_requests WHERE qq = ? AND requestId = ?
          `).get(user.qq, requestId);
          if (previous) {
            db.exec("COMMIT");
            if (
              previous.workId !== workId ||
              (previous.rootId || "") !== replyToId ||
              !!previous.anonymous !== anonymous ||
              previous.body !== body
            ) {
              throw new Error("评论请求编号已用于其他内容，请重新载入草稿后再试。");
            }
            return { comment: JSON.parse(previous.commentJson) };
          }
          db.prepare(`
            INSERT INTO comments (id, workId, rootId, qq, name, anonymous, judge, body, t, requestId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, workId, rootId, user.qq, user.nickname, anonymous ? 1 : 0, judge ? 1 : 0, body, t, requestId);
          createReplyNotification(replyRecipientQq, user.qq, workId, rootId, id, t);
          db.prepare(`
            INSERT INTO comment_requests (qq, requestId, workId, rootId, anonymous, body, commentJson, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(user.qq, requestId, workId, rootId, anonymous ? 1 : 0, body, JSON.stringify(row), t);
          db.exec("COMMIT");
        } catch (err) {
          try { db.exec("ROLLBACK"); } catch (rollbackError) { /* transaction already ended */ }
          throw err;
        }
      } else {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            "INSERT INTO comments (id, workId, rootId, qq, name, anonymous, judge, body, t) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          ).run(id, workId, rootId, user.qq, user.nickname, anonymous ? 1 : 0, judge ? 1 : 0, body, t);
          createReplyNotification(replyRecipientQq, user.qq, workId, rootId, id, t);
          db.exec("COMMIT");
        } catch (err) {
          try { db.exec("ROLLBACK"); } catch (rollbackError) { /* transaction already ended */ }
          throw err;
        }
      }
      return { comment: row };
    }

    case "getCommentNotifications": {
      if (!user) throw new Error("登录后可查看回复提醒。");
      const rows = db.prepare(
        "SELECT n.id, n.workId, n.rootId, n.commentId, n.createdAt, n.readAt, c.body AS replyBody " +
        "FROM comment_notifications n " +
        "JOIN comments c ON c.id = n.commentId AND c.deletedAt IS NULL " +
        "JOIN comments root ON root.id = n.rootId AND root.deletedAt IS NULL " +
        "WHERE n.recipientQq = ? AND n.dismissedAt IS NULL " +
        "ORDER BY n.createdAt DESC LIMIT 100",
      ).all(user.qq);
      return {
        notifications: rows.map((row) => ({
          id: row.id,
          workId: row.workId,
          rootId: row.rootId,
          commentId: row.commentId,
          createdAt: row.createdAt,
          readAt: row.readAt || "",
          preview: String(row.replyBody || "").replace(/\s+/g, " ").slice(0, 120),
        })),
      };
    }

    case "markCommentNotificationRead": {
      if (!user) throw new Error("登录后可更新回复提醒。");
      const id = String(payload.id || "").trim();
      db.prepare("UPDATE comment_notifications SET readAt = COALESCE(readAt, ?) WHERE id = ? AND recipientQq = ? AND dismissedAt IS NULL")
        .run(new Date().toISOString(), id, user.qq);
      return { updated: true };
    }

    case "markAllCommentNotificationsRead": {
      if (!user) throw new Error("登录后可更新回复提醒。");
      const result = db.prepare("UPDATE comment_notifications SET readAt = COALESCE(readAt, ?) WHERE recipientQq = ? AND dismissedAt IS NULL")
        .run(new Date().toISOString(), user.qq);
      return { updated: Number(result.changes) || 0 };
    }

    case "dismissCommentNotification": {
      if (!user) throw new Error("登录后可更新回复提醒。");
      const id = String(payload.id || "").trim();
      db.prepare("UPDATE comment_notifications SET dismissedAt = COALESCE(dismissedAt, ?) WHERE id = ? AND recipientQq = ?")
        .run(new Date().toISOString(), id, user.qq);
      return { dismissed: true };
    }

    case "submitWorkFeedback": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("登录调查员账号后可提交作品反馈。");
      }
      const workId = String(payload.workId || "").trim();
      const editionSlug = workId.split("/")[0];
      if (!manifestCatalogueIds(editionSlug).includes(workId)) throw new Error("作品不在公开目录中。");
      const category = String(payload.category || "");
      if (!["content", "attachment", "other"].includes(category)) throw new Error("请选择反馈类型。");
      const description = String(payload.description || "").trim().slice(0, 2000);
      if (description.length < 3) throw new Error("请再补充一些问题说明。");
      const selectedText = String(payload.selectedText || "").trim().slice(0, 500);
      const requestId = String(payload.requestId || "").trim();
      if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) throw new Error("反馈请求编号无效。");
      const previous = db.prepare("SELECT * FROM work_feedback WHERE reporterQq = ? AND requestId = ?")
        .get(user.qq, requestId);
      if (previous) {
        if (previous.workId !== workId || previous.category !== category ||
            previous.description !== description || previous.selectedText !== selectedText) {
          throw new Error("反馈请求编号已用于其他内容。");
        }
        return { feedback: { id: previous.id, status: previous.status, createdAt: previous.createdAt } };
      }
      const recentDuplicate = db.prepare(
        "SELECT id, status, createdAt FROM work_feedback WHERE reporterQq = ? AND workId = ? " +
        "AND category = ? AND selectedText = ? AND description = ? AND createdAt >= ? " +
        "ORDER BY createdAt DESC LIMIT 1",
      ).get(user.qq, workId, category, selectedText, description, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (recentDuplicate) {
        return { feedback: { id: recentDuplicate.id, status: recentDuplicate.status, createdAt: recentDuplicate.createdAt } };
      }
      let sourcePath = String(payload.sourcePath || "").trim().slice(0, 400);
      if (!sourcePath.startsWith("/") || sourcePath.startsWith("//")) sourcePath = "/";
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO work_feedback " +
        "(id, reporterQq, workId, category, selectedText, description, sourcePath, requestId, createdAt, updatedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, user.qq, workId, category, selectedText, description, sourcePath, requestId, now, now);
      return { feedback: { id, status: "pending", createdAt: now } };
    }

    case "submitCommentReport": {
      if (!user || (session.role !== "member" && session.role !== "admin")) {
        throw new Error("登录调查员账号后可举报评论。");
      }
      const commentId = String(payload.commentId || "").trim();
      const comment = db.prepare("SELECT id, qq, deletedAt FROM comments WHERE id = ?").get(commentId);
      if (!comment || comment.deletedAt) throw new Error("这条评论已不存在。");
      if (comment.qq === user.qq) throw new Error("不能举报自己的评论。");
      const reason = String(payload.reason || "");
      if (!["spam", "harassment", "privacy", "other"].includes(reason)) throw new Error("请选择举报原因。");
      const description = String(payload.description || "").trim().slice(0, 500);
      const requestId = String(payload.requestId || "").trim();
      if (!/^[A-Za-z0-9._:-]{8,100}$/.test(requestId)) throw new Error("举报请求编号无效。");
      const previous = db.prepare("SELECT * FROM comment_reports WHERE reporterQq = ? AND requestId = ?")
        .get(user.qq, requestId);
      if (previous) {
        if (previous.commentId !== commentId || previous.reason !== reason || previous.description !== description) {
          throw new Error("举报请求编号已用于其他内容。");
        }
        return { report: { id: previous.id, status: previous.status, createdAt: previous.createdAt } };
      }
      const recentDuplicate = db.prepare(
        "SELECT id, status, createdAt FROM comment_reports WHERE reporterQq = ? AND commentId = ? " +
        "AND reason = ? AND description = ? AND createdAt >= ? ORDER BY createdAt DESC LIMIT 1",
      ).get(user.qq, commentId, reason, description, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (recentDuplicate) {
        return { report: { id: recentDuplicate.id, status: recentDuplicate.status, createdAt: recentDuplicate.createdAt } };
      }
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      db.prepare(
        "INSERT INTO comment_reports " +
        "(id, reporterQq, commentId, reason, description, requestId, createdAt, updatedAt) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, user.qq, commentId, reason, description, requestId, now, now);
      return { report: { id, status: "pending", createdAt: now } };
    }

    case "getMyWorkFeedback": {
      if (!user) throw new Error("登录后可查看你提交的反馈。");
      const rows = db.prepare(
        "SELECT id, workId, category, status, createdAt, updatedAt " +
        "FROM work_feedback WHERE reporterQq = ? ORDER BY createdAt DESC LIMIT 100",
      ).all(user.qq);
      return { feedback: rows };
    }

    case "getAdminFeedback": {
      if (!user || session.role !== "admin") throw new Error("需要管理员权限。");
      const kind = String(payload.kind || "all");
      const workFeedback = kind === "reports" ? [] : db.prepare(
        "SELECT f.id, f.workId, f.category, f.selectedText, f.description, f.sourcePath, f.status, " +
        "f.adminNote, f.createdAt, f.updatedAt, f.reporterQq, u.nickname AS reporterName " +
        "FROM work_feedback f LEFT JOIN users u ON u.qq = f.reporterQq " +
        "ORDER BY CASE f.status WHEN 'pending' THEN 0 ELSE 1 END, f.createdAt DESC LIMIT 200",
      ).all();
      const reports = kind === "work" ? [] : db.prepare(
        "SELECT r.id, r.commentId, r.reason, r.description, r.status, r.adminNote, r.createdAt, " +
        "r.reporterQq, u.nickname AS reporterName, c.workId, c.rootId, c.body AS commentBody, c.deletedAt " +
        "FROM comment_reports r LEFT JOIN users u ON u.qq = r.reporterQq " +
        "LEFT JOIN comments c ON c.id = r.commentId " +
        "ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.createdAt DESC LIMIT 200",
      ).all();
      return { workFeedback, reports };
    }

    case "getFeedbackHistory": {
      if (!user || session.role !== "admin") throw new Error("需要管理员权限。");
      const targetType = payload.targetType === "report" ? "report" : "work";
      const targetId = String(payload.targetId || "").trim();
      const table = targetType === "report" ? "comment_reports" : "work_feedback";
      if (!db.prepare("SELECT id FROM " + table + " WHERE id = ?").get(targetId)) {
        throw new Error("处理记录不存在。");
      }
      return {
        actions: db.prepare(
          "SELECT a.id, a.adminQq, u.nickname AS adminName, a.status, a.adminNote, a.createdAt " +
          "FROM feedback_actions a LEFT JOIN users u ON u.qq = a.adminQq " +
          "WHERE a.targetType = ? AND a.targetId = ? ORDER BY a.createdAt DESC LIMIT 100",
        ).all(targetType, targetId),
      };
    }

    case "updateWorkFeedback":
    case "updateCommentReport": {
      if (!user || session.role !== "admin") throw new Error("需要管理员权限。");
      const isReport = action === "updateCommentReport";
      const table = isReport ? "comment_reports" : "work_feedback";
      const id = String(payload.id || "").trim();
      const status = String(payload.status || "");
      if (!["pending", "resolved", "no_action"].includes(status)) throw new Error("处理状态无效。");
      const adminNote = String(payload.adminNote || "").trim().slice(0, 1000);
      const exists = db.prepare("SELECT id FROM " + table + " WHERE id = ?").get(id);
      if (!exists) throw new Error("处理记录不存在。");
      const now = new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE " + table + " SET status = ?, adminNote = ?, updatedAt = ?, handledBy = ? WHERE id = ?")
          .run(status, adminNote, now, user.qq, id);
        db.prepare(
          "INSERT INTO feedback_actions (id, targetType, targetId, adminQq, status, adminNote, createdAt) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(crypto.randomUUID(), isReport ? "report" : "work", id, user.qq, status, adminNote, now);
        db.exec("COMMIT");
      } catch (err) {
        try { db.exec("ROLLBACK"); } catch (rollbackError) { /* transaction already ended */ }
        throw err;
      }
      return { updated: true, status, updatedAt: now };
    }

    case "deleteComment": {
      if (!user) throw new Error("请先登录");
      const id = String(payload.id || "");
      const row = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
      if (!row) throw new Error("评论不存在");
      if (session.role !== "admin" && row.qq !== user.qq) {
        throw new Error("无权删除");
      }
      if (!row.rootId) {
        const replies = db.prepare("SELECT COUNT(*) AS c FROM comments WHERE rootId = ?").get(id).c;
        if (Number(replies) > 0) {
          db.prepare("UPDATE comments SET body = '', deletedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
        } else {
          db.prepare("DELETE FROM comments WHERE id = ?").run(id);
        }
      } else {
        db.prepare("DELETE FROM comments WHERE id = ?").run(id);
      }
      return { ok: true };
    }

    // 管理员可改所有人的评论；普通用户只能改自己的
    case "updateComment": {
      if (!user) throw new Error("请先登录");
      const id = String(payload.id || "");
      const row = db.prepare("SELECT * FROM comments WHERE id = ?").get(id);
      if (!row) throw new Error("评论不存在");
      if (row.deletedAt) throw new Error("已删除的评论不能编辑。");
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

    case "adminGetEditionAwardsConfig": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) throw new Error("届别编号无效");
      return {
        config: (settings.awardConfigs && settings.awardConfigs[editionSlug]) || emptyAwardConfig(),
      };
    }

    case "adminSaveEditionAwardsConfig": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) throw new Error("届别编号无效");
      if (publicationOf(editionSlug)) throw new Error("本届已正式公示，奖项配置不可修改");
      const config = saveableAwardConfig(editionSlug, payload.config || {});
      if (!settings.awardConfigs || typeof settings.awardConfigs !== "object") settings.awardConfigs = {};
      settings.awardConfigs[editionSlug] = config;
      saveSettings(settings);
      return { config };
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
      const ratings = db.prepare("SELECT workId, qq, chuanlu, dangan, overall, t FROM counted_ratings ORDER BY t DESC").all();
      const comments = db.prepare("SELECT workId, qq, name, anonymous, judge, body, t, editedAt FROM comments ORDER BY t DESC").all().map((row) => ({
        ...row,
        anonymous: !!row.anonymous,
        judge: !!row.judge,
      }));
      const editionSlugs = db.prepare(`
        SELECT DISTINCT substr(workId, 1, instr(workId, '/') - 1) AS slug FROM counted_ratings
        UNION SELECT DISTINCT substr(workId, 1, instr(workId, '/') - 1) AS slug FROM comments
      `).all().map((row) => row.slug).filter(Boolean);
      const workStats = editionSlugs.flatMap((slug) => reportWorkStats(slug));
      return { summary: reportSummary(), users, ratings, comments, workStats };
    }

    case "adminSaveReadingGuides": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const guides = normalizeReadingGuides(payload.guides);
      settings.readingGuides = guides;
      saveSettings(settings);
      return { guides };
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

    case "adminGetEditionPhaseState": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) throw new Error("届别编号无效");
      const current = getSettings();
      const st = editionState(current, editionSlug);
      return { editionSlug, phase: st.phase, phaseAdvance: phaseAdvanceOf(current, editionSlug), publication: publicPublication(publicationOf(editionSlug)) };
    }

    case "adminConfirmEditionPhase": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) throw new Error("届别编号无效");
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = getSettings();
        const confirmingUser = getUser(user.qq);
        if (!confirmingUser || !confirmingUser.enabled || resolveRole(current, user.qq) !== "admin") {
          throw new Error("需要管理员");
        }
        const st = editionState(current, editionSlug);
        const phaseIndex = EDITION_PHASES.indexOf(st.phase);
        if (phaseIndex < 0) throw new Error("当前阶段无效");
        const next = EDITION_PHASES[phaseIndex + 1];
        if (!next) throw new Error("已是最终阶段");
        const advance = phaseAdvanceOf(current, editionSlug);
        const votes = advance ? advance.votes.filter((qq) => qq !== user.qq) : [];
        if (!advance || !advance.votes.includes(user.qq)) votes.push(user.qq);
        let publication = null;
        if (votes.length >= 2) {
          if (next === "公示") publication = createPublication(current, editionSlug, votes);
          st.phase = next;
          st.phaseAdvance = null;
        } else {
          st.phaseAdvance = votes.length ? { next, votes, source: "server" } : null;
        }
        saveSettings(current);
        db.exec("COMMIT");
        return { editionSlug, phase: st.phase, phaseAdvance: st.phaseAdvance, publication: publicPublication(publication) };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }

    case "adminClearEditionPhaseConfirm": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const editionSlug = String(payload.editionSlug || "").trim();
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(editionSlug)) throw new Error("届别编号无效");
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = getSettings();
        const st = editionState(current, editionSlug);
        st.phaseAdvance = null;
        saveSettings(current);
        db.exec("COMMIT");
        return { editionSlug, phase: st.phase, phaseAdvance: null, publication: publicPublication(publicationOf(editionSlug)) };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
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
        "authorBindings",
      ].forEach(function (key) {
        if (patch[key] !== undefined) next[key] = patch[key];
      });
      if (patch.editions !== undefined) {
        if (!patch.editions || typeof patch.editions !== "object" || Array.isArray(patch.editions)) {
          throw new Error("届别设置无效");
        }
        next.editions = { ...(settings.editions || {}) };
        for (const [slug, incoming] of Object.entries(patch.editions)) {
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(slug) || !incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
            throw new Error("届别设置无效");
          }
          const stored = editionState(settings, slug);
          if ((Object.hasOwn(incoming, "phase") && incoming.phase !== stored.phase)
            || (Object.hasOwn(incoming, "phaseAdvance")
              && JSON.stringify(incoming.phaseAdvance || null) !== JSON.stringify(stored.phaseAdvance || null))) {
            throw new Error("阶段与确认票数只能通过专用确认操作修改");
          }
          next.editions[slug] = { ...stored, ...incoming, phase: stored.phase, phaseAdvance: stored.phaseAdvance };
        }
      }
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

    case "adminSetWorkDisqualified": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const workId = String(payload.workId || "");
      const editionSlug = workId.split("/")[0];
      if (manifestCatalogueIds(editionSlug).indexOf(workId) === -1) throw new Error("作品不在当前届别目录中");
      if (publicationOf(editionSlug)) throw new Error("本届已正式公示，名次已封存，不能再除名或撤销");
      const next = { ...(settings.disqualifiedWorks || {}) };
      if (payload.disqualified) {
        const reason = String(payload.reason || "").trim() || DISQUALIFY_REASON_DEFAULT;
        if (reason.length > 400) throw new Error("除名说明不能超过 400 字");
        next[workId] = { reason, at: (next[workId] && next[workId].at) || new Date().toISOString(), by: user.qq };
      } else {
        delete next[workId];
      }
      settings.disqualifiedWorks = next;
      saveSettings(settings);
      return { disqualifiedWorks: next };
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
