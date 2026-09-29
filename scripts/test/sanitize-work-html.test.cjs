const assert = require("node:assert/strict");
const { sanitizeWorkHtml } = require("../../server/sanitize-work-html.cjs");

const attacks = [
  '<img/onerror=alert(1) src=x>',
  '<a href=javascript:alert(1)>x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<svg onload=alert(1)></svg>',
];
for (const attack of attacks) {
  const result = sanitizeWorkHtml(attack);
  assert.doesNotMatch(result, /onerror|onload|javascript:|<svg/i, attack);
}
assert.match(sanitizeWorkHtml('<p class="work-line">正文 <a href="https://example.com">链接</a></p>'), /class="work-line"/);
assert.match(sanitizeWorkHtml('<p style="color:#222222">正文</p>'), /color:#222222/);
assert.doesNotMatch(sanitizeWorkHtml('<p style="background-image:url(javascript:alert(1))">正文</p>'), /background-image|javascript:/i);
console.log("work HTML sanitization passed");
