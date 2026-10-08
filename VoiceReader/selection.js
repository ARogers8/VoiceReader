// Runs inside the web page (via chrome.scripting.executeScript), so it must
// be self-contained: no imports and no outside variables.
//
// Returns the highlighted text without the clutter news sites mix into a
// selection: ad slots, "related stories", newsletter boxes, share buttons,
// captions and hidden screen-reader text. Only elements *inside* the
// selection are filtered, so highlighting just a sidebar still reads it, and
// if filtering would leave nothing the plain selection is used instead.
export function readCleanSelection() {
  const sel = window.getSelection();
  const plain = sel ? sel.toString() : "";
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return plain;

  const JUNK_TAGS = new Set([
    "ASIDE", "NAV", "FOOTER", "SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME",
    "BUTTON", "FORM", "SELECT", "TEXTAREA", "SVG", "FIGCAPTION", "DIALOG",
  ]);
  const JUNK_ROLES = new Set([
    "complementary", "navigation", "banner", "contentinfo", "button", "dialog",
    "alertdialog", "search", "form", "toolbar",
  ]);
  // Whole words in id/class/data attributes (split on spaces, - and _).
  const JUNK_NAMES = new RegExp(
    "(^|[\\s_-])(" + [
      "ad", "ads", "adv", "advert", "adverts", "advertisement", "adslot", "adunit", "dfp", "gpt",
      "sponsor", "sponsored", "promo", "promoted", "outbrain", "taboola", "teaser",
      "newsletter", "signup", "subscribe", "subscription", "paywall", "regwall",
      "related", "recommended", "recommendations", "trending", "most-read", "mostread", "recirc", "read-more", "readmore",
      "share", "sharing", "social", "comment", "comments", "toolbar",
      "cookie", "cookies", "consent", "popup", "modal",
      "sr-only", "visually-hidden", "visuallyhidden", "screen-reader-text",
    ].join("|") + ")([\\s_-]|$)",
    "i",
  );
  const AD_LABELS = /^(advertisement|advertising|sponsored( content)?|ad|(story|article) continues below( this)? (advertisement|ad)|continue reading (below|the main story)|scroll to continue( with content)?)$/i;

  const junkCache = new Map();
  const isJunk = (el) => {
    if (junkCache.has(el)) return junkCache.get(el);
    const names = [el.id, el.getAttribute("class"), el.getAttribute("data-testid"), el.getAttribute("data-component")]
      .filter(Boolean).join(" ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2"); // "ArticleSponsored" -> "Article Sponsored"
    const style = getComputedStyle(el);
    const junk =
      JUNK_TAGS.has(el.tagName) ||
      el.hidden ||
      el.getAttribute("aria-hidden") === "true" ||
      JUNK_ROLES.has(el.getAttribute("role")) ||
      JUNK_NAMES.test(names) ||
      style.display === "none" ||
      style.visibility === "hidden";
    junkCache.set(el, junk);
    return junk;
  };

  const pieces = [];
  for (let r = 0; r < sel.rangeCount; r++) {
    const range = sel.getRangeAt(r);
    const sliceText = (node) => {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.data.length;
      return node.data.slice(start, end).replace(/\s+/g, " ");
    };
    const root = range.commonAncestorContainer;
    if (root.nodeType === Node.TEXT_NODE) {
      pieces.push(sliceText(root));
      continue;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        if (node.nodeType === Node.ELEMENT_NODE && isJunk(node)) return NodeFilter.FILTER_REJECT; // skips its children too
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) pieces.push(sliceText(node));
      else if (node.tagName === "BR") pieces.push("\n");
      else if (!getComputedStyle(node).display.startsWith("inline")) pieces.push("\n\n"); // paragraph break
    }
    pieces.push("\n\n");
  }

  const clean = pieces.join("")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim())
    .filter((p) => p && !AD_LABELS.test(p))
    .join("\n\n");
  return clean || plain;
}
