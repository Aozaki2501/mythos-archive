const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { once } = require("node:events");
const { DatabaseSync } = require("node:sqlite");

const workIds = JSON.parse(readFileSync(path.join(__dirname, "catalogue.json"), "utf8")).editions["2026"];

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), "mythos-publication-"));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.cjs")], {
    env: { ...process.env, DATABASE_PATH: path.join(dir, "test.db"), PORT: String(port), ADMIN_QQ: "11111,22222" },
    stdio: "ignore",
  });
  let db;
  t.after(async () => {
    if (db) db.close();
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}/api`;
  async function call(action, payload = {}, token = "") {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, payload }),
    });
    const body = await response.json();
    if (!body.ok) throw new Error(body.error);
    return body.data;
  }
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) break;
    try {
      await call("ping");
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  }
  assert.ok(ready, "测试 API 未启动");
  db = new DatabaseSync(path.join(dir, "test.db"));
  for (const qq of ["11111", "22222", "33333"]) {
    db.prepare("INSERT INTO users (qq, pass, nickname, role, enabled, createdAt) VALUES (?, ?, ?, ?, 1, ?)")
      .run(qq, "unused", `作者${qq}`, qq === "33333" ? "member" : "admin", new Date().toISOString());
    if (qq !== "33333") {
      db.prepare("INSERT INTO tokens (token, qq, role, exp) VALUES (?, ?, 'admin', ?)").run(`token-${qq}`, qq, Date.now() + 60000);
    }
  }
  const settings = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'main'").get().value);
  settings.editions["2026"] = { phase: "统计", phaseAdvance: null, deadlines: {} };
  settings.authorBindings[workIds[0]] = "33333";
  settings.awardConfigs["2026"] = {
    authorRevealRankLimit: 1,
    specialAwards: [{ name: "特别奖", workId: workIds[1], excerpt: "短评", review: "正式评语" }],
  };
  db.prepare("UPDATE settings SET value = ? WHERE key = 'main'").run(JSON.stringify(settings));
  db.prepare("INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("r1", workIds[0], "33333", 5, 5, 5, new Date().toISOString());
  return { call, db };
}

test("阶段只能由两位不同管理员确认，正式结果保持固定", async (t) => {
  const { call, db } = await fixture(t);
  const first = "token-11111";
  const second = "token-22222";
  const original = await call("getEditionInsights", { editionSlug: "2026" });
  assert.equal(original.publication, null);
  assert.equal(original.leaderboard[0].workId, workIds[0]);
  assert.equal((await call("getEditionAwards", { editionSlug: "2026" })).published, false);
  await assert.rejects(call("adminConfirmEditionPhase", { editionSlug: "2026" }), /需要管理员/);
  const settings = (await call("bootstrap", {}, first)).settings;
  settings.editions["2026"].phase = "公示";
  await assert.rejects(call("adminSaveSettings", { settings }, first), /专用确认操作/);
  assert.equal((await call("adminGetEditionPhaseState", { editionSlug: "2026" }, first)).phase, "统计");
  settings.editions["2026"].phase = "统计";
  settings.editions["2026"].deadlines["统计"] = "2026-10-01T00:00:00.000Z";
  await call("adminSaveSettings", { settings }, first);
  assert.equal((await call("bootstrap", {}, first)).settings.editions["2026"].deadlines["统计"], "2026-10-01T00:00:00.000Z");

  const vote = await call("adminConfirmEditionPhase", { editionSlug: "2026" }, first);
  assert.equal(vote.phase, "统计");
  assert.deepEqual(vote.phaseAdvance.votes, ["11111"]);
  await assert.rejects(call("adminSaveSettings", { settings: { editions: { "2026": { phase: "统计", phaseAdvance: null } } } }, first), /专用确认操作/);
  await call("adminSaveSettings", { settings: { editions: { "2026": { voteDeadline: "2026-10-02T00:00:00.000Z" } } } }, first);
  assert.deepEqual((await call("adminGetEditionPhaseState", { editionSlug: "2026" }, first)).phaseAdvance.votes, ["11111"]);
  const withdrawn = await call("adminConfirmEditionPhase", { editionSlug: "2026" }, first);
  assert.equal(withdrawn.phaseAdvance, null);
  await call("adminConfirmEditionPhase", { editionSlug: "2026" }, first);
  const published = await call("adminConfirmEditionPhase", { editionSlug: "2026" }, second);
  assert.equal(published.phase, "公示");
  assert.ok(published.publication.publishedAt);
  await call("adminSaveSettings", { settings: { editions: { "2026": { voteDeadline: "2026-10-03T00:00:00.000Z" } } } }, first);
  assert.equal((await call("adminGetEditionPhaseState", { editionSlug: "2026" }, first)).phase, "公示");
  await assert.rejects(call("adminConfirmEditionPhase", { editionSlug: "2026" }, first), /最终阶段/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM edition_publications").get().n, 1);

  const insights = await call("getEditionInsights", { editionSlug: "2026" });
  const awards = await call("getEditionAwards", { editionSlug: "2026" });
  assert.deepEqual(insights.leaderboard, original.leaderboard);
  assert.equal(awards.authorReveals[workIds[0]], "作者33333");
  assert.equal(awards.specialAwards[0].review, "正式评语");
  assert.deepEqual(awards.publication, insights.publication);

  db.prepare("UPDATE ratings SET chuanlu = 1, dangan = 1, overall = 1 WHERE id = 'r1'").run();
  db.prepare("UPDATE users SET nickname = '改名后' WHERE qq = '33333'").run();
  assert.deepEqual((await call("getEditionInsights", { editionSlug: "2026" })).leaderboard, insights.leaderboard);
  assert.deepEqual((await call("getEditionAwards", { editionSlug: "2026" })).authorReveals, awards.authorReveals);
  await assert.rejects(call("adminSaveEditionAwardsConfig", { editionSlug: "2026", config: { authorRevealRankLimit: 0, specialAwards: [] } }, first), /不可修改/);
  assert.throws(() => db.prepare("DELETE FROM edition_publications WHERE editionSlug = '2026'").run(), /不可删除/);
});

test("无奖项配置不虚构奖项；目录外评分使发布回滚", async (t) => {
  const { call, db } = await fixture(t);
  const settings = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'main'").get().value);
  delete settings.awardConfigs["2026"];
  db.prepare("UPDATE settings SET value = ? WHERE key = 'main'").run(JSON.stringify(settings));
  db.prepare("INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, 5, 5, 5, ?)")
    .run("orphan", "2026/missing", "33333", new Date().toISOString());
  await call("adminConfirmEditionPhase", { editionSlug: "2026" }, "token-11111");
  await assert.rejects(call("adminConfirmEditionPhase", { editionSlug: "2026" }, "token-22222"), /目录外作品/);
  assert.equal((await call("adminGetEditionPhaseState", { editionSlug: "2026" }, "token-11111")).phase, "统计");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM edition_publications").get().n, 0);
  db.prepare("DELETE FROM ratings WHERE id = 'orphan'").run();
  await call("adminConfirmEditionPhase", { editionSlug: "2026" }, "token-22222");
  const awards = await call("getEditionAwards", { editionSlug: "2026" });
  assert.equal(awards.published, true);
  assert.deepEqual(awards.specialAwards, []);
  assert.deepEqual(awards.authorReveals, {});
});
