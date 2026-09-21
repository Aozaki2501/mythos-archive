/* CloudBase 前端客户端
 * window.ARCHIVE_CLOUD = { envId, apiUrl? }
 * 优先走 HTTP apiUrl（无需匿名登录）；否则 callFunction
 */
(function (global) {
  "use strict";

  var TOKEN_KEY = "mythos.cloud.token";
  var app = null;
  var ready = null;

  function config() {
    return global.ARCHIVE_CLOUD || null;
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setToken(token) {
    try {
      if (!token) localStorage.removeItem(TOKEN_KEY);
      else localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      /* ignore */
    }
  }

  function ensureApp() {
    var cfg = config();
    if (!cfg || !cfg.envId) throw new Error("未配置 ARCHIVE_CLOUD.envId");
    var sdk = global.cloudbase;
    if (sdk && sdk.default) sdk = sdk.default;
    if (!sdk || typeof sdk.init !== "function") {
      throw new Error("未加载 cloudbase SDK 2.x");
    }
    if (!app) app = sdk.init({ env: cfg.envId });
    return app;
  }

  function signInAnonymous(auth) {
    if (typeof auth.signInAnonymously === "function") {
      return auth.signInAnonymously();
    }
    if (typeof auth.anonymousAuthProvider === "function") {
      return auth.anonymousAuthProvider().signIn();
    }
    if (typeof auth.signInWithAnonymous === "function") {
      return auth.signInWithAnonymous();
    }
    return Promise.reject(new Error("当前 SDK 不支持匿名登录"));
  }

  function ensureAuth() {
    if (ready) return ready;
    var instance = ensureApp();
    var auth = instance.auth({ persistence: "local" });
    ready = Promise.resolve()
      .then(function () {
        if (typeof auth.getLoginState === "function") return auth.getLoginState();
        return null;
      })
      .then(function (state) {
        if (state) return state;
        return signInAnonymous(auth);
      })
      .catch(function () {
        return signInAnonymous(auth);
      });
    return ready;
  }

  function callHttp(action, payload) {
    var cfg = config();
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(cfg.apiUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ action: action, payload: payload || {} }),
    }).catch(function (netErr) {
      throw new Error("无法连接到服务器。请检查网络（若刚切换或关闭代理，请重启浏览器或刷新页面）。");
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok || (body && body.ok === false)) {
          var msg =
            (body && (body.error || body.msg || body.message)) ||
            "请求失败 (" + res.status + ")";
          if (typeof msg === "object") msg = JSON.stringify(msg);
          throw new Error(msg);
        }
        // HTTP 包装：{ ok, data } 或网关再包一层
        if (body && body.data !== undefined && body.ok !== undefined) {
          return body.data;
        }
        if (body && body.body) {
          try {
            var inner =
              typeof body.body === "string" ? JSON.parse(body.body) : body.body;
            if (inner && inner.ok === false) throw new Error(inner.error || "请求失败");
            return inner && inner.data !== undefined ? inner.data : inner;
          } catch (e) {
            if (e.message && e.message !== "请求失败") throw e;
          }
        }
        return body;
      });
    });
  }

  function callFunction(action, payload) {
    return ensureAuth().then(function () {
      return ensureApp()
        .callFunction({
          name: "api",
          data: {
            action: action,
            payload: payload || {},
            token: getToken(),
          },
        })
        .then(function (res) {
          var result = (res && res.result) || res || {};
          if (result.ok === false) {
            throw new Error(result.error || "请求失败");
          }
          return result.data;
        });
    });
  }

  function call(action, payload) {
    var cfg = config();
    if (cfg && cfg.apiUrl) return callHttp(action, payload);
    return callFunction(action, payload);
  }

  global.MythosCloud = {
    enabled: function () {
      return !!(config() && (config().apiUrl || config().envId));
    },
    getToken: getToken,
    setToken: setToken,
    call: call,
    bootstrap: function () {
      return call("bootstrap");
    },
    login: function (qq, pass) {
      return call("login", { qq: qq, pass: pass }).then(function (data) {
        setToken(data.token);
        return data;
      });
    },
    register: function (qq, pass, nickname, code) {
      return call("register", {
        qq: qq,
        pass: pass,
        nickname: nickname,
        code: code,
      }).then(function (data) {
        setToken(data.token);
        return data;
      });
    },
    sendRegisterCode: function (qq) {
      return call("sendRegisterCode", { qq: qq });
    },
    visitor: function () {
      return call("visitor").then(function (data) {
        setToken(data.token);
        return data;
      });
    },
    logout: function () {
      return call("logout")
        .catch(function () {
          return null;
        })
        .then(function () {
          setToken("");
        });
    },
  };
})(window);

