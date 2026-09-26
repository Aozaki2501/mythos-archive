const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { once } = require("node:events");
const { DatabaseSync } = require("node:sqlite");

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

test("主题导读仅管理员可保存，保存后访客可读取固定编排", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "mythos-guides-"));
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, "index.cjs")], {
    env: { ...process.env, DATABASE_PATH: path.join(dir, "test.db"), PORT: String(port), ADMIN_QQ: "11111" },
    stdio: "ignore",
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
    rmSync(dir, { recursive: true, force: true });
  });
  async function request(action, payload = {}, token = "") {
    const response = await fetch(`http://127.0.0.1:${port}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ action, payload }),
    });
    return response.json();
  }
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      ready = (await request("ping")).ok;
      if (ready) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.ok(ready, "测试 API 未启动");
  const db = new DatabaseSync(path.join(dir, "test.db"));
  db.prepare("INSERT INTO users (qq, pass, nickname, role, enabled, createdAt) VALUES (?, ?, ?, ?, 1, ?)")
    .run("11111", "unused", "管理员", "admin", new Date().toISOString());
  db.prepare("INSERT INTO tokens (token, qq, role, exp) VALUES (?, ?, 'admin', ?)")
    .run("admin-token", "11111", Date.now() + 60000);
  db.close();

  const defaults = ["first-visit", "ten-minutes", "folk-rites", "case-files", "dreaming-voyages"];
  const guides = defaults.map((id) => ({
    id, title: id, audience: "适合所有读者", description: "人工选读", workIds: ["2025/10-乐蝉"], reasons: ["一篇短作"],
  }));
  assert.equal((await request("bootstrap")).data.settings.readingGuides, null);
  assert.equal((await request("adminSaveReadingGuides", { guides })).ok, false);
  assert.equal((await request("adminSaveReadingGuides", { guides: guides.slice(0, 4) }, "admin-token")).ok, false);
  assert.equal((await request("adminSaveReadingGuides", { guides }, "admin-token")).ok, true);
  assert.deepEqual((await request("bootstrap")).data.settings.readingGuides, guides);
});
