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

  /* create and append a message bubble; returns the element */
  function addMessage(role, text) {
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

  /* call our serverless function (which talks to Groq) */
  function ariaReply(userText) {
    const typing = addTyping();
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (res) {
        typing.remove();
        if (res.ok && res.data && res.data.reply) {
          addMessage("aria", res.data.reply);
          history.push({ role: "assistant", content: res.data.reply });
        } else {
          const why = (res.data && (res.data.error || res.data.detail)) || "Unknown error.";
          addMessage("aria", "That didn't go through — " + why);
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
    if (!text) return;
    enterChat();
    addMessage("user", text);
    history.push({ role: "user", content: text });
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
