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

  let started = false;
  const history = [];   // conversation so far: {role, content}
  let pendingImage = null;  // data-URL of an attached image, or null

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
})();
