import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamland-search-"));
const dbPath = path.join(tempDir, "search.db");
const port = 35000 + (process.pid % 1000);
const url = `http://127.0.0.1:${port}/api`;
const ids = JSON.parse(fs.readFileSync(path.join(root, "server/catalogue.json"), "utf8")).editions["2026"].slice(0, 4);
assert.equal(ids.length, 4);

const child = spawn(process.execPath, ["server/index.cjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATABASE_PATH: dbPath, SMTP_USER: "", SMTP_PASS: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); });
child.stderr.on("data", (chunk) => { output += String(chunk); });

async function call(action) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return response.json();
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      ready = (await call("ping")).ok;
      if (ready) break;
    } catch { /* API is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `API did not start: ${output}`);

  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  // ids[0]：只有一条孤立投票，应当被推荐列表排除。
  db.prepare("INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, 5, 5, 5, ?)")
    .run("r0", ids[0], "qq0", now);
  // ids[1]：今天 1 票 + 3 条今天的评议。
  db.prepare("INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, 5, 5, 5, ?)")
    .run("r1", ids[1], "qq1", now);
  for (let index = 0; index < 3; index += 1) {
    db.prepare("INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, 5, 5, 5, ?)")
      .run(`r2-${index}`, ids[2], `qq2-${index}`, old);
  }
  for (let index = 0; index < 3; index += 1) {
    db.prepare("INSERT INTO comments (id, workId, qq, name, body, t) VALUES (?, ?, ?, '测试', '评议', ?)")
      .run(`c${index}`, ids[1], `qq${index}`, now);
  }
  // ids[2]：3 票但都是 60 天前，只有 1 条今天的评议。
  db.prepare("INSERT INTO comments (id, workId, qq, name, body, t) VALUES (?, ?, ?, '测试', '评议', ?)")
    .run("c-extra", ids[2], "qq2-0", now);
  // ids[3]：今天 4 票，没有评议。
  for (let index = 0; index < 4; index += 1) {
    db.prepare("INSERT INTO ratings (id, workId, qq, chuanlu, dangan, overall, t) VALUES (?, ?, ?, 5, 5, 5, ?)")
      .run(`r3-${index}`, ids[3], `qq3-${index}`, now);
  }
  db.close();

  const result = await call("getSearchRecommendations");
  assert.equal(result.ok, true);
  // 投票为主、评论为辅，且新互动优先：今天 4 票 > 今天 1 票 3 评议 > 60 天前的 3 票。
  assert.deepEqual(result.data.works.map((row) => row.workId), [ids[3], ids[1], ids[2]]);
  assert.equal(result.data.works[0].ratingCount, 4);
  assert.equal(result.data.works[0].commentCount, 0);
  assert.equal(result.data.works[1].ratingCount, 1);
  assert.equal(result.data.works[1].commentCount, 3);
  assert.ok(!result.data.works.some((row) => row.workId === ids[0]));
  assert.ok(result.data.works.length <= 4);
  assert.deepEqual(
    Object.keys(result.data.works[0]).sort(),
    ["commentCount", "ratingCount", "workId"],
  );
  console.log("search recommendation API tests passed");
} catch (error) {
  console.error(error.stack || error, output);
  process.exitCode = 1;
} finally {
  child.kill();
  await new Promise((resolve) => child.once("exit", resolve));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch { /* Windows 可能短暂占用临时数据库文件 */ }
}
