/**
 * 幻梦境档案馆 · CloudBase HTTP API
 * 集合：users / settings / ratings / comments / stars / likes / authorNotes / tokens
 */
const cloud = require("@cloudbase/node-sdk");

const DEFAULT_ADMIN_QQ = "10001";
const TOKEN_TTL_MS = 30 * 24 * 3600 * 1000;
const BODY_MAX = 500;
const AUTHOR_NOTE_MAX = 2000;
const NAME_MAX = 20;

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

function json(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(data),
  };
}

function hashPassword(text) {
  const str = String(text) + "|mythos-archive-v4";
  let h1 = 2166136261;
  let h2 = 2166136261 ^ 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 ^= c + ((h2 << 6) + (h2 >> 2));
    h2 = Math.imul(h2, 2246822519);
  }
  const hex = (n) => ("00000000" + (n >>> 0).toString(16)).slice(-8);
  return hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(~h1);
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function defaultSettings() {
  return {

    allowVisitor: true,
    allowMemberLogin: true,
    registrationOpen: true,
    memberDirectory: [],
    adminDirectory: [DEFAULT_ADMIN_QQ],
    editions: {},
    authorBindings: {},
  };
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    /* already exists or unsupported — ignore */
  }
}

async function ensureSettings() {
  await ensureCollection("settings");
  const col = db.collection("settings");
  try {
    const { data } = await col.doc("main").get();
    if (data && data[0]) return data[0];
  } catch (e) {
    /* missing */
  }
  const doc = defaultSettings();
  const payload = Object.assign({}, doc);
  delete payload._id;
  await col.doc("main").set(payload);
  return Object.assign({ _id: "main" }, payload);
}

async function saveSettings(settings) {
  const payload = Object.assign({}, settings);
  delete payload._id;
  await db.collection("settings").doc("main").set(payload);
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

async function getUser(qq) {
  const { data } = await db.collection("users").doc(qq).get();
  return data && data[0] ? data[0] : null;
}

async function putUser(user) {
  const payload = Object.assign({}, user);
  delete payload._id;
  await db.collection("users").doc(user.qq).set(payload);
}

async function createToken(qq, role) {
  const token = newId() + newId();
  const exp = Date.now() + TOKEN_TTL_MS;
  await db.collection("tokens").doc(token).set({
    qq: qq,
    role: role,
    exp: exp,
  });
  return token;
}

async function authFromEvent(event) {
  const headers = event.headers || {};
  const raw =
    headers.Authorization ||
    headers.authorization ||
    headers.AUTHORIZATION ||
    "";
  const token = String(raw).replace(/^Bearer\s+/i, "").trim();
  if (!token) return { session: null, user: null };
  if (token === "visitor") {
    return { session: { role: "visitor" }, user: null };
  }
  try {
    const { data } = await db.collection("tokens").doc(token).get();
    const row = data && data[0];
    if (!row || row.exp < Date.now()) return { session: null, user: null };
    const user = await getUser(row.qq);
    if (!user || !user.enabled) return { session: null, user: null };
    const settings = await ensureSettings();
    const role = resolveRole(settings, user.qq);
    if (user.role !== role) {
      user.role = role;
      await putUser(user);
    }
    return {
      session: { role: role, qq: user.qq, token: token },
      user: user,
      settings: settings,
    };
  } catch (e) {
    return { session: null, user: null };
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    qq: user.qq,
    nickname: user.nickname,
    role: user.role,
    enabled: user.enabled,
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

async function handle(action, payload, auth) {
  const settings = auth.settings || (await ensureSettings());
  const session = auth.session;
  const user = auth.user;

  switch (action) {
    case "ping":
      await Promise.all(
        [
          "settings",
          "users",
          "tokens",
          "ratings",
          "comments",
          "stars",
          "likes",
          "authorNotes",
        ].map(ensureCollection),
      );
      await ensureSettings();
      return { ok: true, time: new Date().toISOString() };

    case "bootstrap": {
      const safeSettings = {
        allowVisitor: settings.allowVisitor,
        allowMemberLogin: settings.allowMemberLogin,
        registrationOpen: settings.registrationOpen,
        editions: settings.editions || {},
        authorBindings: settings.authorBindings || {},
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
              token:
                session.token ||
                (session.role === "visitor" ? "visitor" : null),
            }
          : null,
        user: publicUser(user),
      };
    }

    case "register": {
      if (!settings.registrationOpen) throw new Error("管理员已关闭注册。");
      const qq = String(payload.qq || "").trim();
      const pass = String(payload.pass || "");
      const nickname = String(payload.nickname || "")
        .trim()
        .slice(0, NAME_MAX);
      if (!/^\d{5,12}$/.test(qq)) throw new Error("请输入 5–12 位数字 QQ 号。");
      if (!isAllowedRegister(settings, qq)) {
        throw new Error(
          "该 QQ 不在调查员目录或管理员名单中。请联系已有管理员添加后再注册。",
        );
      }
      if (await getUser(qq)) throw new Error("该 QQ 已注册，请直接登录。");
      if (pass.length < 4) throw new Error("密码至少 4 位。");
      const role = resolveRole(settings, qq);
      const row = {

        qq: qq,
        pass: hashPassword(pass),
        nickname: nickname || "用户" + qq.slice(-4),
        role: role,
        enabled: true,
        createdAt: new Date().toISOString(),
      };
      await putUser(row);
      const token = await createToken(qq, role);
      return {
        token: token,
        session: { role: role, qq: qq },
        user: publicUser(row),
      };
    }

    case "login": {
      const qq = String(payload.qq || "").trim();
      const pass = String(payload.pass || "");
      const row = await getUser(qq);
      if (!row) throw new Error("账号不存在，请先注册。");
      if (!row.enabled) throw new Error("该账号已被管理员停用。");
      if (
        !settings.allowMemberLogin &&
        resolveRole(settings, qq) !== "admin"
      ) {
        throw new Error("管理员已关闭调查员登录。");
      }
      if (hashPassword(pass) !== row.pass) throw new Error("密码不正确。");
      const role = resolveRole(settings, qq);
      row.role = role;
      await putUser(row);
      const token = await createToken(qq, role);
      return {
        token: token,
        session: { role: role, qq: qq },
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
        try {
          await db.collection("tokens").doc(session.token).remove();
        } catch (e) {
          /* ignore */
        }
      }
      return { ok: true };
    }

    case "updateProfile": {
      if (!user) throw new Error("请先登录。");
      if (payload.nickname != null) {
        user.nickname =
          String(payload.nickname).trim().slice(0, NAME_MAX) || user.nickname;
      }
      if (payload.newPass) {
        const next = String(payload.newPass || "");
        if (next.length < 4) throw new Error("新密码至少 4 位。");
        // 已有登录态即可改密；若传了 oldPass 则再校验一次（兼容旧客户端）
        if (payload.oldPass != null && String(payload.oldPass).length) {
          if (hashPassword(String(payload.oldPass)) !== user.pass) {
            throw new Error("当前密码不正确。");
          }
        }
        user.pass = hashPassword(next);
      }
      await putUser(user);
      return { user: publicUser(user) };
    }

    case "getWorkBundle": {
      const workId = String(payload.workId || "");
      if (!workId) throw new Error("缺少 workId");
      const [ratingsRes, commentsRes, likesRes, noteRes] = await Promise.all([
        db.collection("ratings").where({ workId: workId }).limit(1000).get(),
        db
          .collection("comments")
          .where({ workId: workId })
          .orderBy("t", "asc")
          .limit(500)
          .get(),
        db.collection("likes").where({ workId: workId }).limit(1000).get(),
        db.collection("authorNotes").doc(workId).get(),
      ]);
      const likes = {};
      (likesRes.data || []).forEach(function (row) {
        likes[row.qq] = true;
      });
      const note = noteRes.data && noteRes.data[0] ? noteRes.data[0] : null;
      return {
        ratings: ratingsRes.data || [],
        comments: commentsRes.data || [],
        likes: likes,
        authorNote: note
          ? { body: note.body, updatedAt: note.updatedAt, qq: note.qq }
          : null,
      };
    }

    case "getStars": {
      if (!user) return { stars: [] };
      const editionSlug = String(payload.editionSlug || "");
      const { data } = await db
        .collection("stars")
        .where({ qq: user.qq, editionSlug: editionSlug })
        .limit(1)
        .get();
      return { stars: data && data[0] ? data[0].slugs || [] : [] };
    }

    case "setStars": {
      if (!user || session.role === "visitor") throw new Error("无权操作");
      const editionSlug = String(payload.editionSlug || "");
      const slugs = Array.isArray(payload.slugs) ? payload.slugs : [];
      const id = user.qq + "::" + editionSlug;
      await db.collection("stars").doc(id).set({
        qq: user.qq,
        editionSlug: editionSlug,
        slugs: slugs,
      });
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
      if (![chuanlu, dangan, overall].every(function (n) {
        return n >= 1 && n <= 5;
      })) {
        throw new Error("分数无效");
      }
      const id = workId + "::" + user.qq;
      const record = {

        id: newId(),
        workId: workId,
        qq: user.qq,
        chuanlu: chuanlu,
        dangan: dangan,
        overall: overall,
        t: new Date().toISOString(),
      };
      await db.collection("ratings").doc(id).set(record);
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
      try {
        const { data } = await db.collection("likes").doc(id).get();
        if (data && data[0]) {
          await db.collection("likes").doc(id).remove();
          return { liked: false };
        }
      } catch (e) {
        /* add */
      }
      await db.collection("likes").doc(id).set({
        workId: workId,
        qq: user.qq,
        t: new Date().toISOString(),
      });
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
      const judge =
        session.role === "admin" && st.phase === "统计" && !anonymous;
      const id = newId();
      const row = {

        id: id,
        workId: workId,
        qq: user.qq,
        name: user.nickname,
        anonymous: anonymous,
        judge: judge,
        body: body,
        t: new Date().toISOString(),
      };
      await db.collection("comments").doc(id).set(row);
      return { comment: row };
    }

    case "deleteComment": {
      if (!user) throw new Error("请先登录");
      const id = String(payload.id || "");
      const { data } = await db.collection("comments").doc(id).get();
      const row = data && data[0];
      if (!row) throw new Error("评论不存在");
      if (session.role !== "admin" && row.qq !== user.qq) {
        throw new Error("无权删除");
      }
      await db.collection("comments").doc(id).remove();
      return { ok: true };
    }

    case "saveAuthorNote": {
      if (!user) throw new Error("请先登录");
      const workId = String(payload.workId || "");
      const bindings = settings.authorBindings || {};
      const bound =
        bindings[workId] || String(payload.workAuthorQQ || "").trim();
      if (!bound || bound !== user.qq) throw new Error("仅作者可编辑");
      const bodyText = String(payload.body || "")
        .trim()
        .slice(0, AUTHOR_NOTE_MAX);
      if (!bodyText) {
        try {
          await db.collection("authorNotes").doc(workId).remove();
        } catch (e) {
          /* ignore */
        }
        return { authorNote: null };
      }
      const row = {

        workId: workId,
        body: bodyText,
        qq: user.qq,
        updatedAt: new Date().toISOString(),
      };
      await db.collection("authorNotes").doc(workId).set(row);
      return {
        authorNote: {
          body: row.body,
          updatedAt: row.updatedAt,
          qq: row.qq,
        },
      };
    }

    case "adminGetUsers": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const { data } = await db.collection("users").limit(1000).get();
      return {
        users: (data || []).map(publicUser),
      };
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
      if (next.adminDirectory.indexOf(DEFAULT_ADMIN_QQ) === -1) {
        next.adminDirectory.unshift(DEFAULT_ADMIN_QQ);
      }
      await saveSettings(next);
      return { settings: next };
    }

    case "adminSetUserEnabled": {
      if (!user || session.role !== "admin") throw new Error("需要管理员");
      const qq = String(payload.qq || "");
      const target = await getUser(qq);
      if (!target) throw new Error("用户不存在");
      target.enabled = !!payload.enabled;
      await putUser(target);
      return { user: publicUser(target) };
    }

    default:
      throw new Error("未知操作：" + action);
  }
}

exports.main = async (event, context) => {
  // HTTP 触发
  if (event && event.httpMethod) {
    if (event.httpMethod === "OPTIONS") {
      return json(204, {});
    }
    let body = {};
    try {
      body =
        typeof event.body === "string"
          ? JSON.parse(event.body || "{}")
          : event.body || {};
    } catch (e) {
      return json(400, { error: "JSON 无效" });
    }
    const action = body.action;
    if (!action) return json(400, { error: "缺少 action" });
    try {
      const auth = await authFromEvent(event);
      if (!auth.settings) auth.settings = await ensureSettings();
      const data = await handle(action, body.payload || {}, auth);
      return json(200, { ok: true, data: data });
    } catch (err) {
      return json(400, { ok: false, error: err.message || String(err) });
    }
  }

  // callFunction 触发：event 即为 data
  const action = event && event.action;
  if (!action) {
    return { ok: false, error: "缺少 action" };
  }
  try {
    const fakeEvent = {
      headers: {
        Authorization: event.token ? "Bearer " + event.token : "",
      },
    };
    const auth = await authFromEvent(fakeEvent);
    if (!auth.settings) auth.settings = await ensureSettings();
    const data = await handle(action, event.payload || {}, auth);
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};
