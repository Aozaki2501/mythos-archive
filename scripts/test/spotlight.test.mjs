import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { DatabaseSync } = await import("node:sqlite");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamland-spotlight-"));
const dbPath = path.join(tempDir, "spotlight.test.db");
const port = 34000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const adminQQ = "90001";
const adminToken = "spotlight-test-admin-token";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function seedDatabase(workIds) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE users (
      qq TEXT PRIMARY KEY,
      pass TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE tokens (
      token TEXT PRIMARY KEY,
      qq TEXT NOT NULL,
      role TEXT NOT NULL,
      exp INTEGER NOT NULL
    );
    CREATE TABLE ratings (
      id TEXT PRIMARY KEY,
      workId TEXT NOT NULL,
      qq TEXT NOT NULL,
      chuanlu INTEGER NOT NULL,
      dangan INTEGER NOT NULL,
      overall INTEGER NOT NULL,
      t TEXT NOT NULL,
      UNIQUE(workId, qq)
    );
  `);

  const settings = {
    allowVisitor: true,
    allowMemberLogin: true,
    registrationOpen: true,
    memberDirectory: ["90002"],
    adminDirectory: [adminQQ],
    editions: {
      2026: {
        phase: "评分",
        voteDeadline: "",
        deadlines: { 征文: "", 评分: "", 统计: "", 公示: "" },
      },
    },
    authorBindings: {},
    spotlight: { editions: {} },
  };
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
    "main",
    JSON.stringify(settings),
  );
  db.prepare(
    "INSERT INTO users (qq, pass, nickname, role, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(adminQQ, hashPassword("spotlight-test-password"), "测试管理员", "admin", 1, new Date().toISOString());
  db.prepare("INSERT INTO tokens (token, qq, role, exp) VALUES (?, ?, ?, ?)").run(
    adminToken,
    adminQQ,
    "admin",
    Date.now() + 60 * 60 * 1000,
  );

  // 让第二个候选明确超过默认评分阈值，检查自动选择不会把它标成“待更多评议”。
  for (let index = 0; index < 5; index += 1) {
    db.prepare(
      "INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(
      `rating-${index}`,
      workIds[1],
      `rater-${index}`,
      5,
      5,
      5,
      new Date(Date.now() - index * 1000).toISOString(),
    );
  }
  db.close();
}

async function callApi(action, payload = {}, token = "") {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, payload }),
  });
  const body = await response.json();
  return { response, body };
}

async function waitForServer(child) {
  let lastError = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await callApi("ping");
      if (result.response.ok && result.body.ok) return;
    } catch (error) {
      lastError = error.message;
    }
    if (child.exitCode != null) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`测试 API 未启动：${lastError}`);
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "server", "catalogue.json"), "utf8"),
);
const workIds = manifest.editions["2026"];
assert.ok(Array.isArray(workIds) && workIds.length >= 4, "测试目录至少需要 4 篇作品");
seedDatabase(workIds);

const child = spawn(process.execPath, ["server/index.cjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATABASE_PATH: dbPath,
    ADMIN_QQ: adminQQ,
    SMTP_USER: "",
    SMTP_PASS: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
child.stdout.on("data", (chunk) => {
  serverOutput += String(chunk);
});
child.stderr.on("data", (chunk) => {
  serverOutput += String(chunk);
});

try {
  await waitForServer(child);

  const noAuthAdmin = await callApi("adminGetSpotlightConfig", {
    editionSlug: "2026",
    catalogueWorkIds: workIds.slice(0, 4),
  });
  assert.equal(noAuthAdmin.response.ok, false, "未登录不应访问管理员聚光配置");
  assert.match(noAuthAdmin.body.error, /管理员/);

  const first = await callApi("getSpotlight", { editionSlug: "2026" });
  assert.equal(first.response.ok, true);
  assert.equal(first.body.ok, true);
  assert.ok(first.body.data.date);
  assert.ok(first.body.data.items.length <= 3);
  assert.ok(!JSON.stringify(first.body.data).includes("ratingCount"));
  assert.ok(!JSON.stringify(first.body.data).includes("manualSchedule"));

  const second = await callApi("getSpotlight", { editionSlug: "2026" });
  assert.deepEqual(second.body.data, first.body.data, "同一天重复读取必须返回固化结果");

  const adminBefore = await callApi(
    "adminGetSpotlightConfig",
    { editionSlug: "2026", catalogueWorkIds: workIds.slice(0, 4) },
    adminToken,
  );
  assert.equal(adminBefore.response.ok, true);
  assert.equal(adminBefore.body.data.config.dailyCount, 3);
  assert.ok(adminBefore.body.data.candidates.some((row) => "ratingCount" in row));

  const today = first.body.data.date;
  const manual = await callApi(
    "adminSaveSpotlightConfig",
    {
      editionSlug: "2026",
      rebuildToday: true,
      config: {
        enabled: true,
        mode: "manual",
        ratingThreshold: 5,
        cooldownDays: 7,
        timezone: "Asia/Hong_Kong",
        catalogueWorkIds: workIds.slice(0, 4),
        manualSchedule: {
          [today]: [
            {
              workId: workIds[2],
              publicLabel: "今日选读",
              note: "仅管理员可见的测试备注",
            },
          ],
        },
      },
    },
    adminToken,
  );
  assert.equal(manual.response.ok, true);
  assert.equal(manual.body.data.today.length, 1);
  assert.equal(manual.body.data.today[0].workId, workIds[2]);
  assert.equal(manual.body.data.today[0].source, "manual");
  assert.equal(
    manual.body.data.config.manualSchedule[today][0].note,
    "仅管理员可见的测试备注",
  );

  const manualPublic = await callApi("getSpotlight", { editionSlug: "2026" });
  assert.deepEqual(manualPublic.body.data.items.map((item) => item.workId), [workIds[2]]);
  assert.ok(!JSON.stringify(manualPublic.body.data).includes("note"));
  assert.ok(!JSON.stringify(manualPublic.body.data).includes("ratingCount"));

  const hybrid = await callApi(
    "adminSaveSpotlightConfig",
    {
      editionSlug: "2026",
      rebuildToday: true,
      config: {
        mode: "hybrid",
        catalogueWorkIds: workIds.slice(0, 4),
        manualSchedule: {
          [today]: [{ workId: workIds[2], publicLabel: "今日选读" }],
        },
      },
    },
    adminToken,
  );
  assert.equal(hybrid.response.ok, true);
  assert.ok(hybrid.body.data.today.length >= 2);
  assert.equal(hybrid.body.data.today[0].workId, workIds[2]);
  assert.equal(new Set(hybrid.body.data.today.map((row) => row.workId)).size, hybrid.body.data.today.length);

  const five = await callApi(
    "adminSaveSpotlightConfig",
    {
      editionSlug: "2026",
      rebuildToday: true,
      config: {
        mode: "manual",
        dailyCount: 5,
        catalogueWorkIds: workIds.slice(0, 4),
        manualSchedule: {
          [today]: workIds.slice(0, 4).map((workId) => ({ workId, publicLabel: "今日选读" })),
        },
      },
    },
    adminToken,
  );
  assert.equal(five.response.ok, true);
  assert.equal(five.body.data.config.dailyCount, 5);
  assert.equal(five.body.data.today.length, 4, "目录不足 5 篇时应只生成可用作品");

  const one = await callApi(
    "adminSaveSpotlightConfig",
    {
      editionSlug: "2026",
      rebuildToday: true,
      config: {
        mode: "manual",
        dailyCount: 1,
        catalogueWorkIds: workIds.slice(0, 4),
        manualSchedule: {
          [today]: workIds.slice(0, 4).map((workId) => ({ workId, publicLabel: "今日选读" })),
        },
      },
    },
    adminToken,
  );
  assert.equal(one.response.ok, true);
  assert.equal(one.body.data.config.dailyCount, 1);
  assert.equal(one.body.data.today.length, 1);

  const clamped = await callApi(
    "adminSaveSpotlightConfig",
    {
      editionSlug: "2026",
      rebuildToday: true,
      config: {
        mode: "manual",
        dailyCount: 99,
        catalogueWorkIds: workIds.slice(0, 4),
        manualSchedule: {
          [today]: [{ workId: workIds[0], publicLabel: "今日选读" }],
        },
      },
    },
    adminToken,
  );
  assert.equal(clamped.response.ok, true);
  assert.equal(clamped.body.data.config.dailyCount, 5);

  const invalidSchedule = await callApi(
    "adminSaveSpotlightConfig",
    {
      editionSlug: "2026",
      rebuildToday: true,
      config: {
        mode: "manual",
        catalogueWorkIds: workIds.slice(0, 4),
        manualSchedule: {
          [today]: [
            { workId: "2026/not-in-catalogue", publicLabel: "今日选读" },
            { workId: workIds[0], publicLabel: "未知标签" },
            { workId: workIds[0], publicLabel: "今日聚光" },
          ],
        },
      },
    },
    adminToken,
  );
  assert.equal(invalidSchedule.response.ok, true);
  assert.equal(invalidSchedule.body.data.today.length, 1);
  assert.equal(invalidSchedule.body.data.today[0].workId, workIds[0]);
  assert.equal(invalidSchedule.body.data.today[0].publicLabel, "今日选读");

  console.log("spotlight API tests passed");
} catch (error) {
  console.error(error.stack || error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
} finally {
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
  fs.rmSync(tempDir, { recursive: true, force: true });
}
