import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { DatabaseSync } = await import("node:sqlite");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamland-rating-achievements-"));
const dbPath = path.join(tempDir, "rating-achievements.test.db");
const port = 35000 + (process.pid % 1000);
const baseUrl = `http://127.0.0.1:${port}/api`;
const memberQQ = "90009";
const memberToken = "rating-achievements-test-token";

async function callApi(action, payload = {}) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${memberToken}`,
    },
    body: JSON.stringify({ action, payload }),
  });
  const body = await response.json();
  return { response, body };
}

async function waitForServer(child) {
  let lastError = "";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ping", payload: {} }),
      });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
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
assert.equal(workIds.length, 53, "2026 届测试目录应为 53 篇");

const child = spawn(process.execPath, ["server/index.cjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    DATABASE_PATH: dbPath,
    ADMIN_QQ: "90001",
    SMTP_USER: "",
    SMTP_PASS: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
child.stdout.on("data", (chunk) => { serverOutput += String(chunk); });
child.stderr.on("data", (chunk) => { serverOutput += String(chunk); });

try {
  await waitForServer(child);

  const db = new DatabaseSync(dbPath);
  const settings = {
    allowVisitor: true,
    allowMemberLogin: true,
    registrationOpen: true,
    memberDirectory: [memberQQ],
    adminDirectory: [],
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
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(
    "main",
    JSON.stringify(settings),
  );
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = crypto.scryptSync("test-password", salt, 64).toString("hex");
  db.prepare(
    "INSERT OR REPLACE INTO users (qq, pass, nickname, role, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(memberQQ, `${salt}:${passwordHash}`, "成就测试成员", "member", 1, new Date().toISOString());
  db.prepare(
    "INSERT OR REPLACE INTO tokens (token, qq, role, exp) VALUES (?, ?, ?, ?)",
  ).run(memberToken, memberQQ, "member", Date.now() + 60 * 60 * 1000);

  const insertRating = db.prepare(
    "INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const workId of workIds.slice(0, 11)) {
    insertRating.run(`${workId}::${memberQQ}`, workId, memberQQ, 4, 4, 4, new Date().toISOString());
  }
  db.prepare(
    "INSERT INTO rating_achievements (id, qq, editionSlug, achievementKey, unlockedAt, notifiedAt) VALUES (?, ?, ?, ?, ?, NULL)",
  ).run(`${memberQQ}::2026::first-five`, memberQQ, "2026", "first-five", new Date().toISOString());
  db.close();

  const backfilled = await callApi("getMyRatingProgress", { editionSlug: "2026" });
  assert.equal(backfilled.response.ok, true, backfilled.body.error);
  assert.equal(backfilled.body.data.ratedCount, 11);
  assert.deepEqual(
    backfilled.body.data.achievements.filter((item) => item.unlocked).map((item) => item.key),
    ["first-five", "rated-10"],
    "已有 11 篇评分时应补记 5 篇和 10 篇成就",
  );
  assert.deepEqual(
    backfilled.body.data.pendingAchievements.map((item) => item.key),
    ["first-five", "rated-10"],
    "先前提示未完成时，后续达到的档位也必须留在待提示队列",
  );

  const claimedFive = await callApi("claimRatingAchievement", {
    editionSlug: "2026",
    achievementKey: "first-five",
  });
  assert.equal(claimedFive.response.ok, true, claimedFive.body.error);
  assert.equal(claimedFive.body.data.claimed, true);

  const claimedTen = await callApi("claimRatingAchievement", {
    editionSlug: "2026",
    achievementKey: "rated-10",
  });
  assert.equal(claimedTen.response.ok, true, claimedTen.body.error);
  assert.equal(claimedTen.body.data.claimed, true);
  assert.equal(claimedTen.body.data.achievement.title, "梦境回响");

  for (const workId of workIds.slice(11, 15)) {
    const submitted = await callApi("submitRating", {
      workId,
      chuanlu: 4,
      dangan: 4,
      overall: 4,
    });
    assert.equal(submitted.response.ok, true, submitted.body.error);
  }
  const atFifteen = await callApi("getMyRatingProgress", { editionSlug: "2026" });
  assert.equal(atFifteen.body.data.ratedCount, 15);
  assert.ok(atFifteen.body.data.achievements.some((item) => item.key === "rated-15" && item.unlocked));
  assert.deepEqual(atFifteen.body.data.pendingAchievements.map((item) => item.key), ["rated-15"]);

  const updateExisting = await callApi("submitRating", {
    workId: workIds[0],
    chuanlu: 5,
    dangan: 4,
    overall: 4,
  });
  assert.equal(updateExisting.response.ok, true, updateExisting.body.error);
  assert.equal(updateExisting.body.data.wasFirstRatingForWork, false);
  assert.equal(updateExisting.body.data.ratedCountAfter, 15);
  assert.equal(updateExisting.body.data.achievementUnlockedNow, false);

  const dbAfterScores = new DatabaseSync(dbPath);
  const insertRemainingRating = dbAfterScores.prepare(
    "INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const workId of workIds.slice(15)) {
    insertRemainingRating.run(`${workId}::${memberQQ}`, workId, memberQQ, 4, 4, 4, new Date().toISOString());
  }
  dbAfterScores.close();
  const complete = await callApi("getMyRatingProgress", { editionSlug: "2026" });
  assert.equal(complete.body.data.ratedCount, 53);
  assert.ok(complete.body.data.achievements.some((item) => item.key === "full-volume" && item.unlocked));
  assert.deepEqual(
    complete.body.data.pendingAchievements.map((item) => item.key),
    ["rated-15", "full-volume"],
    "尚未展示的中途档位与全评成就都应保留为待提示",
  );
  const claimedFifteen = await callApi("claimRatingAchievement", {
    editionSlug: "2026",
    achievementKey: "rated-15",
  });
  assert.equal(claimedFifteen.body.data.claimed, true);
  const claimedFullVolume = await callApi("claimRatingAchievement", {
    editionSlug: "2026",
    achievementKey: "full-volume",
  });
  assert.equal(claimedFullVolume.body.data.claimed, true);

  console.log("rating achievement API tests passed");
} catch (error) {
  if (serverOutput) process.stderr.write(serverOutput);
  throw error;
} finally {
  child.kill();
  await new Promise((resolve) => {
    if (child.exitCode != null) return resolve();
    const timeout = setTimeout(resolve, 1500);
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
}
