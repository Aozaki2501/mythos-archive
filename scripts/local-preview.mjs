import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PREVIEW_PORT || 18881);
const apiPort = Number(process.env.PORT || 3000);
const dataPath = process.env.DATABASE_PATH || path.join(root, "data", "dreamland.dev.db");
const webRoot = path.join(root, "dist", "web");

if (!existsSync(path.join(webRoot, "index.html"))) {
  throw new Error("缺少 dist/web/index.html。请先运行 npm run web。");
}

const api = spawn(process.execPath, ["server/index.cjs"], {
  cwd: root,
  env: { ...process.env, PORT: String(apiPort), DATABASE_PATH: dataPath },
  stdio: "inherit",
});

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wmf": "image/wmf",
  ".emf": "image/emf",
  ".ico": "image/x-icon",
};

const preview = http.createServer((req, res) => {
  const requestUrl = new URL(req.url || "/", "http://preview.local");
  if (requestUrl.pathname === "/api" || requestUrl.pathname === "/api/") {
    const proxy = http.request(
      {
        hostname: "127.0.0.1",
        port: apiPort,
        path: requestUrl.pathname + requestUrl.search,
        method: req.method,
        headers: req.headers,
      },
      (apiResponse) => {
        res.writeHead(apiResponse.statusCode || 502, apiResponse.headers);
        apiResponse.pipe(res);
      },
    );
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: "本地 API 尚未就绪" }));
    });
    req.pipe(proxy);
    return;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(
      requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1),
    );
  } catch (error) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("无效的文件路径");
    return;
  }
  let filePath = path.resolve(webRoot, relativePath);
  if (!filePath.startsWith(webRoot + path.sep) && filePath !== path.join(webRoot, "index.html")) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    createReadStream(path.join(webRoot, "index.html")).pipe(res);
    return;
  }
  res.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  });
  createReadStream(filePath).pipe(res);
});

function close() {
  preview.close();
  api.kill();
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
api.once("exit", (code) => {
  if (code && code !== 0) process.exitCode = code;
});

preview.listen(port, "127.0.0.1", () => {
  console.log(`本地预览已启动：http://127.0.0.1:${port}`);
  console.log(`开发数据库：${dataPath}`);
  console.log("按 Ctrl+C 同时停止页面和 API。");
});
