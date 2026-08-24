/* A tiny, safe markdown renderer (escape-first; no raw HTML passes through). */

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* inline + light block markdown for the non-code parts */
function renderInline(text) {
  const lines = text.split("\n");
  let out = "", inList = false;
  for (const raw of lines) {
    let e = escapeHtml(raw);
    e = e.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
    e = e.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    const trimmed = raw.trim();

    if (/^[-*•]\s+/.test(trimmed)) {
      if (!inList) { out += "<ul>"; inList = true; }
      out += "<li>" + e.replace(/^\s*[-*•]\s+/, "") + "</li>";
      continue;
    }
    if (inList) { out += "</ul>"; inList = false; }

    const h = trimmed.match(/^(#{1,4})\s+/);
    if (h) {
      const lvl = h[1].length;
      out += "<h" + lvl + ">" + e.replace(/^\s*#{1,4}\s+/, "") + "</h" + lvl + ">";
      continue;
    }
    if (trimmed === "") continue;
    out += "<p>" + e + "</p>";
  }
  if (inList) out += "</ul>";
  return out;
}

/* full markdown: pull out ```fenced code``` blocks, render the rest inline */
export function renderMarkdown(src) {
  const re = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let out = "", last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) out += renderInline(src.slice(last, m.index));
    const code = escapeHtml(m[2].replace(/\n$/, ""));
    out +=
      '<div class="code-block">' +
      '<button class="code-copy" type="button">copy</button>' +
      "<pre><code>" + code + "</code></pre></div>";
    last = re.lastIndex;
  }
  if (last < src.length) out += renderInline(src.slice(last));
  return out;
}
