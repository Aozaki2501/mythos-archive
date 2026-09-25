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

  // 超时按调用方传入的 options.timeoutMs 生效，默认不设超时：
  // 发验证码、评分、评论等写请求可能本身就要十几秒，客户端超时会让用户误以为没提交成功。
  // 需要限时的只读请求（例如启动时的 bootstrap）由调用方显式传入。
  function call(action, payload, options) {
    var timeoutMs = Number(options && options.timeoutMs) > 0 ? Number(options.timeoutMs) : 0;
    var headers = { "Content-Type": "application/json" };
    var token = getToken();
    if (token) headers.Authorization = "Bearer " + token;
    var init = {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ action: action, payload: payload || {} }),
    };
    var controller = null;
    var timer = null;
    if (timeoutMs && typeof AbortController === "function") {
      controller = new AbortController();
      init.signal = controller.signal;
      timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }
    function settled() {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
    }
    function failed() {
      settled();
      if (controller && controller.signal.aborted) {
        throw new Error(
          "请求超时（" + Math.round(timeoutMs / 1000) + " 秒没有响应）。请检查网络后重试。",
        );
      }
      throw new Error("无法连接到服务器。请检查网络（若刚切换或关闭代理，请重启浏览器或刷新页面）。");
    }
    return fetch(API_URL, init).then(function (res) {
      return res.json().then(
        function (body) {
          settled();
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
        },
        function (parseError) {
          settled();
          throw parseError;
        },
      );
    }, failed);
  }

  global.MythosAPI = {
    enabled: function () {
      return true;
    },
    getToken: getToken,
    setToken: setToken,
    call: call,
    bootstrap: function (options) {
      return call("bootstrap", {}, options);
    },
    getEditionInsights: function (editionSlug) {
      return call("getEditionInsights", { editionSlug: editionSlug });
    },
    getEditionAwards: function (editionSlug) {
      return call("getEditionAwards", { editionSlug: editionSlug });
    },
    adminGetEditionPhaseState: function (editionSlug) {
      return call("adminGetEditionPhaseState", { editionSlug: editionSlug });
    },
    // 仅传届别；下一阶段及确认人身份由服务端从当前状态和登录会话确定。
    // 同一管理员再次调用会撤销自己的确认。
    adminConfirmEditionPhase: function (editionSlug) {
      return call("adminConfirmEditionPhase", { editionSlug: editionSlug });
    },
    adminClearEditionPhaseConfirm: function (editionSlug) {
      return call("adminClearEditionPhaseConfirm", { editionSlug: editionSlug });
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
    requestPasswordReset: function (qq) {
      return call("requestPasswordReset", { qq: qq });
    },
    resetPassword: function (qq, code, newPassword) {
      return call("resetPassword", { qq: qq, code: code, newPassword: newPassword });
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
