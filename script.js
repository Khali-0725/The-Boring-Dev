/* ============================================================
   Aria — interface behavior (UI only, no model connected)
   ============================================================ */

(function () {
  "use strict";

  const hero      = document.getElementById("hero");
  const chat      = document.getElementById("chat");
  const thread    = document.getElementById("thread");
  const composer  = document.getElementById("composer");
  const promptEl  = document.getElementById("prompt");
  const dock      = document.getElementById("dock");
  const dockInput = document.getElementById("dock-input");
  const chips     = document.getElementById("chips");
  const themeBtn  = document.getElementById("theme-toggle");
  const menuBtn   = document.getElementById("menu-toggle");
  const sidebar   = document.getElementById("sidebar");
  const backdrop  = document.getElementById("backdrop");
  const newChatBtn = document.getElementById("new-chat");
  const recentsEl = document.getElementById("recents");

  let started = false;
  let history = [];     // active conversation: {role, content} — points at the active chat's messages
  let pendingImage = null;  // data-URL of an attached image, or null

  /* ----- chat history store (device-local, no login) ----- */
  const STORE_KEY = "bd-chats";
  let chats = [];        // [{id, title, messages, updatedAt}]
  let activeId = null;

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      chats = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(chats)) chats = [];
    } catch (e) { chats = []; }
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(chats)); } catch (e) {}
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function activeChat() {
    return chats.find(function (c) { return c.id === activeId; }) || null;
  }

  /* ----- image attach ----- */
  const previews = [document.getElementById("preview-hero"), document.getElementById("preview-dock")];

  /* shrink an image file to a small JPEG data URL (keeps the request light) */
  function fileToDataURL(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        const img = new Image();
        img.onerror = reject;
        img.onload = function () {
          let w = img.width, h = img.height;
          if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
          else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPreview() {
    previews.forEach(function (p) {
      if (!p) return;
      if (pendingImage) {
        p.hidden = false;
        p.innerHTML = '<img alt="attachment" /><button type="button" class="remove">remove</button>';
        p.querySelector("img").src = pendingImage;
        p.querySelector(".remove").addEventListener("click", clearImage);
      } else {
        p.hidden = true;
        p.innerHTML = "";
      }
    });
  }

  function clearImage() {
    pendingImage = null;
    renderPreview();
  }

  document.querySelectorAll(".attach").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const input = document.getElementById(btn.getAttribute("data-target"));
      if (input) input.click();
    });
  });
  document.querySelectorAll(".file-input").forEach(function (input) {
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      input.value = ""; // allow re-picking the same file later
      if (!file) return;
      fileToDataURL(file, 1024, 0.8)
        .then(function (url) { pendingImage = url; renderPreview(); })
        .catch(function () { addMessage("aria", "Couldn't read that image — try a different file."); });
    });
  });

  /* ----- theme toggle ----- */
  function syncThemeButton() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.setAttribute("aria-pressed", String(dark));
    themeBtn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  }
  themeBtn.addEventListener("click", function () {
    const root = document.documentElement;
    const dark = root.getAttribute("data-theme") === "dark";
    if (dark) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", "dark");
    try { localStorage.setItem("bd-theme", dark ? "light" : "dark"); } catch (e) {}
    syncThemeButton();
  });
  syncThemeButton();

  /* auto-grow any textarea to fit its content */
  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }

  /* create and append a message bubble; returns the element.
     imageURL (optional) shows a thumbnail inside a user bubble. */
  function addMessage(role, text, imageURL) {
    const msg = document.createElement("div");
    msg.className = "msg " + role;

    const who = document.createElement("span");
    who.className = "who";
    who.textContent = role === "user" ? "You" : "Boring Dev";
    msg.appendChild(who);

    const body = document.createElement("span");
    body.className = "body";
    body.textContent = text;
    msg.appendChild(body);

    if (imageURL) {
      const img = document.createElement("img");
      img.className = "sent-image";
      img.src = imageURL;
      img.alt = "attached image";
      msg.appendChild(img);
    }

    thread.appendChild(msg);
    msg.scrollIntoView({ behavior: "smooth", block: "end" });
    return msg;
  }

  /* show the three-dot typing indicator, return the node so we can replace it */
  function addTyping() {
    const msg = document.createElement("div");
    msg.className = "msg aria";
    msg.innerHTML =
      '<span class="who">Boring Dev</span>' +
      '<span class="typing"><span></span><span></span><span></span></span>';
    thread.appendChild(msg);
    msg.scrollIntoView({ behavior: "smooth", block: "end" });
    return msg;
  }

  /* ----- tiny, safe markdown renderer ----- */
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* inline + block-ish markdown for the non-code parts */
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
  function renderMarkdown(src) {
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

  function flashButton(btn, label) {
    const original = btn.textContent;
    btn.textContent = label;
    btn.classList.add("done");
    setTimeout(function () {
      btn.textContent = original;
      btn.classList.remove("done");
    }, 1400);
  }

  /* wire up code-block + message copy buttons inside a rendered message */
  function wireCopy(msg, rawText) {
    msg.querySelectorAll(".code-copy").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const code = btn.parentElement.querySelector("code");
        navigator.clipboard.writeText(code ? code.textContent : "");
        flashButton(btn, "copied");
      });
    });
    const copyMsg = msg.querySelector(".copy-msg");
    if (copyMsg) {
      copyMsg.addEventListener("click", function () {
        navigator.clipboard.writeText(rawText);
        flashButton(copyMsg, "copied");
      });
    }
  }

  /* add the response-time + copy footer to an assistant message */
  function addMeta(msg, rawText, secs) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML =
      '<span class="speed">⚡ ' + secs + 's</span>' +
      '<button class="copy-msg" type="button">copy</button>';
    msg.appendChild(meta);
  }

  /* call our serverless function and stream the reply token-by-token */
  function ariaReply(userText) {
    const typing = addTyping();
    const t0 = (window.performance || Date).now();
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    })
      .then(async function (r) {
        // error path: server sends JSON (not a stream)
        if (!r.ok || !r.body) {
          typing.remove();
          let why = "Unknown error.";
          try {
            const data = await r.json();
            why = (data && (data.error || data.detail)) || why;
          } catch (e) {}
          addMessage("aria", "That didn't go through — " + why);
          return;
        }

        // success path: read the plain-text stream and grow the bubble live
        typing.remove();
        const msg = addMessage("aria", "");
        const bodyEl = msg.querySelector(".body");
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let full = "";

        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          full += decoder.decode(chunk.value, { stream: true });
          bodyEl.textContent = full;         // fast, plain text while streaming
          msg.scrollIntoView({ behavior: "smooth", block: "end" });
        }

        if (full.trim()) {
          const secs = (((window.performance || Date).now() - t0) / 1000).toFixed(1);
          bodyEl.innerHTML = renderMarkdown(full);   // prettify when done
          addMeta(msg, full, secs);
          wireCopy(msg, full);
          history.push({ role: "assistant", content: full });
          persist();
        } else {
          bodyEl.textContent = "That didn't go through — empty reply.";
        }
      })
      .catch(function () {
        typing.remove();
        addMessage(
          "aria",
          "Can't reach the backend. If you opened this as a local file, run it with " +
          "“vercel dev” or deploy to Vercel so /api/chat is live."
        );
      });
  }

  function truncate(s, n) {
    s = s.trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  /* move from the centered hero into the docked chat layout (once) */
  function enterChat() {
    if (started) return;
    started = true;
    hero.hidden = true;
    chat.hidden = false;
    dock.hidden = false;
    dockInput.focus();
  }

  /* handle a submitted message from either composer */
  function send(text) {
    text = (text || "").trim();
    const image = pendingImage;
    if (!text && !image) return;
    enterChat();

    addMessage("user", text, image);

    // Multimodal messages use an array of content parts (text + image);
    // plain text messages stay a simple string.
    if (image) {
      const parts = [];
      if (text) parts.push({ type: "text", text: text });
      parts.push({ type: "image_url", image_url: { url: image } });
      history.push({ role: "user", content: parts });
    } else {
      history.push({ role: "user", content: text });
    }

    clearImage();
    persist();
    ariaReply(text);
  }

  /* ----- hero composer ----- */
  promptEl.addEventListener("input", function () { autoGrow(promptEl); });
  composer.addEventListener("submit", function (e) {
    e.preventDefault();
    send(promptEl.value);
    promptEl.value = "";
    autoGrow(promptEl);
  });

  /* Enter to send, Shift+Enter for newline */
  function enterToSend(inputEl, formEl) {
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        formEl.requestSubmit();
      }
    });
  }
  enterToSend(promptEl, composer);

  /* ----- docked composer ----- */
  dockInput.addEventListener("input", function () { autoGrow(dockInput); });
  dock.addEventListener("submit", function (e) {
    e.preventDefault();
    send(dockInput.value);
    dockInput.value = "";
    autoGrow(dockInput);
  });
  enterToSend(dockInput, dock);

  /* ----- suggestion chips fill + send ----- */
  chips.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    send(chip.textContent);
  });

  /* ===== chat history: read/derive helpers ===== */
  function textOf(content) {
    if (Array.isArray(content)) {
      const t = content.find(function (p) { return p.type === "text"; });
      return t ? t.text : "";
    }
    return String(content || "");
  }
  function imageOf(content) {
    if (Array.isArray(content)) {
      const im = content.find(function (p) { return p.type === "image_url"; });
      return im && im.image_url ? im.image_url.url : null;
    }
    return null;
  }
  function titleFor(chat) {
    const firstUser = chat.messages.find(function (m) { return m.role === "user"; });
    const raw = firstUser ? textOf(firstUser.content) : "";
    const t = raw.trim().replace(/\s+/g, " ");
    return t ? truncate(t, 40) : "New chat";
  }

  /* save the active conversation back into the store, newest first */
  function persist() {
    const c = activeChat();
    if (!c) return;
    c.messages = history;
    c.title = titleFor(c);
    c.updatedAt = Date.now();
    chats.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    saveStore();
    renderRecents();
  }

  /* rebuild the visible thread from the active conversation */
  function renderThread() {
    thread.innerHTML = "";
    history.forEach(function (m) {
      if (m.role === "user") {
        addMessage("user", textOf(m.content), imageOf(m.content));
      } else {
        const msg = addMessage("aria", "");
        msg.querySelector(".body").innerHTML = renderMarkdown(String(m.content));
        const meta = document.createElement("div");
        meta.className = "meta";
        meta.innerHTML = '<button class="copy-msg" type="button">copy</button>';
        msg.appendChild(meta);
        wireCopy(msg, String(m.content));
      }
    });
  }

  /* render the Recents list (only chats that have messages) */
  function renderRecents() {
    recentsEl.innerHTML = "";
    const withMsgs = chats.filter(function (c) { return c.messages.length > 0; });
    if (!withMsgs.length) {
      const p = document.createElement("p");
      p.className = "recents-empty";
      p.textContent = "No chats yet.";
      recentsEl.appendChild(p);
      return;
    }
    withMsgs.forEach(function (c) {
      const row = document.createElement("div");
      row.className = "recent" + (c.id === activeId ? " active" : "");
      const title = document.createElement("span");
      title.className = "recent-title";
      title.textContent = c.title || "New chat";
      const del = document.createElement("button");
      del.className = "recent-del";
      del.type = "button";
      del.setAttribute("aria-label", "Delete chat");
      del.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      row.appendChild(title);
      row.appendChild(del);
      row.addEventListener("click", function (e) {
        if (e.target.closest(".recent-del")) return;
        openChat(c.id);
        closeSidebarMobile();
      });
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        deleteChat(c.id);
      });
      recentsEl.appendChild(row);
    });
  }

  /* switch to the centered hero (empty chat) */
  function resetToHero() {
    started = false;
    thread.innerHTML = "";
    chat.hidden = true;
    dock.hidden = true;
    hero.hidden = false;
    clearImage();
    promptEl.value = "";
    autoGrow(promptEl);
  }

  function openChat(id) {
    const c = chats.find(function (x) { return x.id === id; });
    if (!c) return;
    activeId = id;
    history = c.messages;
    if (history.length) {
      started = true;
      hero.hidden = true;
      chat.hidden = false;
      dock.hidden = false;
      renderThread();
    } else {
      resetToHero();
    }
    renderRecents();
  }

  /* start a fresh chat (reuses an existing empty one so we don't pile up blanks) */
  function newChat() {
    let empty = chats.find(function (c) { return c.messages.length === 0; });
    if (!empty) {
      empty = { id: uid(), title: "New chat", messages: [], updatedAt: Date.now() };
      chats.unshift(empty);
    }
    activeId = empty.id;
    history = empty.messages;
    resetToHero();
    renderRecents();
    closeSidebarMobile();
  }

  function deleteChat(id) {
    chats = chats.filter(function (c) { return c.id !== id; });
    saveStore();
    if (id === activeId) {
      const next = chats.find(function (c) { return c.messages.length > 0; });
      if (next) openChat(next.id);
      else newChat();
    } else {
      renderRecents();
    }
  }

  /* ----- sidebar open/close (drawer on mobile; docked on desktop) ----- */
  function openSidebar() {
    document.body.classList.add("nav-open");
    backdrop.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
  }
  function closeSidebarMobile() {
    document.body.classList.remove("nav-open");
    backdrop.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
  }
  menuBtn.addEventListener("click", function () {
    if (document.body.classList.contains("nav-open")) closeSidebarMobile();
    else openSidebar();
  });
  backdrop.addEventListener("click", closeSidebarMobile);
  newChatBtn.addEventListener("click", newChat);

  /* ----- init: restore the most recent conversation, or start fresh ----- */
  loadStore();
  chats.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  const recent = chats.find(function (c) { return c.messages.length > 0; });
  if (recent) openChat(recent.id);
  else newChat();
})();
