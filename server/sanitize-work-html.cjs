const sanitizeHtml = require("sanitize-html");

function sanitizeWorkHtml(input) {
  return sanitizeHtml(String(input == null ? "" : input), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "figure", "figcaption", "details", "summary", "section", "article", "h1", "h2", "pre"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["class", "id", "title", "aria-label", "colspan", "rowspan", "style"],
      img: ["src", "alt", "width", "height", "loading"],
    },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i],
        "text-align": [/^(left|right|center|justify)$/],
        "white-space": [/^(normal|pre|pre-wrap)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
    disallowedTagsMode: "discard",
  });
}

module.exports = { sanitizeWorkHtml };
