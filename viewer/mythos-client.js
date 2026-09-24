/* 自托管 HTTP API 客户端。沿用 token 键以保留现有登录会话。 */
(function (global) {
  "use strict";

  var TOKEN_KEY = "mythos.cloud.token";
  var API_URL = global.ARCHIVE_API_URL || "/api";

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

  function call(action, payload) {
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(API_URL, {
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
        // 服务端返回 { ok, data }。
        if (body && body.data !== undefined && body.ok !== undefined) {
          return body.data;
        }
        return body;
      });
    });
  }

  global.MythosAPI = {
    enabled: function () {
      return true;
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
