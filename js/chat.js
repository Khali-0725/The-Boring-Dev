/* Conversation logic — sending, streaming replies, and switching chats. */

import { state, saveStore, activeChat, uid } from "./state.js";
import { dom, autoGrow, truncate } from "./dom.js";
import { addMessage, addTyping, addMeta, wireCopy, renderMarkdown, scrollThread } from "./render.js";
import { streamReply } from "./api.js";
import { clearImage } from "./image.js";
import { renderRecents, closeSidebarMobile } from "./sidebar.js";

/* ----- content helpers (messages may be a string or a parts array) ----- */
export function textOf(content) {
  if (Array.isArray(content)) {
    const t = content.find((p) => p.type === "text");
    return t ? t.text : "";
  }
  return String(content || "");
}
function imageOf(content) {
  if (Array.isArray(content)) {
    const im = content.find((p) => p.type === "image_url");
    return im && im.image_url ? im.image_url.url : null;
  }
  return null;
}
export function titleFor(chat) {
  const firstUser = chat.messages.find((m) => m.role === "user");
  const raw = firstUser ? textOf(firstUser.content) : "";
  const t = raw.trim().replace(/\s+/g, " ");
  return t ? truncate(t, 40) : "New chat";
}

/* save the active conversation back into the store, newest first */
export function persist() {
  const c = activeChat();
  if (!c) return;
  c.messages = state.history;
  c.title = c.named ? (c.title || titleFor(c)) : titleFor(c);
  c.updatedAt = Date.now();
  state.chats.sort((a, b) => b.updatedAt - a.updatedAt);
  saveStore();
  renderRecents();
}

/* rebuild the visible thread from the active conversation */
export function renderThread() {
  dom.thread.innerHTML = "";
  state.history.forEach(function (m) {
    if (m.role === "user") {
      addMessage("user", textOf(m.content), imageOf(m.content));
    } else {
      const msg = addMessage("aria", "");
      msg.querySelector(".body").innerHTML = renderMarkdown(String(m.content));
      addMeta(msg, String(m.content));       // reloaded: copy + speak, no ⚡ speed
      wireCopy(msg, String(m.content));
    }
  });
  scrollThread();
}

/* ----- layout switches ----- */
export function resetToHero() {
  state.started = false;
  dom.thread.innerHTML = "";
  dom.chat.hidden = true;
  dom.dockWrap.hidden = true;
  dom.hero.hidden = false;
  clearImage();
  dom.promptEl.value = "";
  autoGrow(dom.promptEl);
}
function enterChat() {
  if (state.started) return;
  state.started = true;
  dom.hero.hidden = true;
  dom.chat.hidden = false;
  dom.dockWrap.hidden = false;
  dom.dockInput.focus();
}

/* ----- open / new / delete ----- */
export function openChat(id) {
  const c = state.chats.find((x) => x.id === id);
  if (!c) return;
  state.activeId = id;
  state.history = c.messages;
  if (state.history.length) {
    state.started = true;
    dom.hero.hidden = true;
    dom.chat.hidden = false;
    dom.dockWrap.hidden = false;
    renderThread();
  } else {
    resetToHero();
  }
  renderRecents();
}
export function newChat() {
  let empty = state.chats.find((c) => c.messages.length === 0);
  if (!empty) {
    empty = { id: uid(), title: "New chat", messages: [], updatedAt: Date.now() };
    state.chats.unshift(empty);
  }
  state.activeId = empty.id;
  state.history = empty.messages;
  resetToHero();
  renderRecents();
  closeSidebarMobile();
}
export function deleteChat(id) {
  state.chats = state.chats.filter((c) => c.id !== id);
  saveStore();
  if (id === state.activeId) {
    const next = state.chats.find((c) => c.messages.length > 0);
    if (next) openChat(next.id);
    else newChat();
  } else {
    renderRecents();
  }
}

/* ----- streamed reply ----- */
function ariaReply() {
  const typing = addTyping();
  const t0 = (window.performance || Date).now();
  let msg = null, bodyEl = null;

  streamReply(state.history, {
    onError: function (why) {
      typing.remove();
      addMessage("aria", "That didn't go through — " + why);
    },
    onOpen: function () {
      typing.remove();
      msg = addMessage("aria", "");
      bodyEl = msg.querySelector(".body");
    },
    onToken: function (full) {
      bodyEl.textContent = full;   // fast plain text while streaming
      scrollThread();
    },
    onDone: function (full) {
      if (full.trim()) {
        const secs = (((window.performance || Date).now() - t0) / 1000).toFixed(1);
        bodyEl.innerHTML = renderMarkdown(full);
        addMeta(msg, full, secs);
        wireCopy(msg, full);
        state.history.push({ role: "assistant", content: full });
        persist();
      } else {
        bodyEl.textContent = "That didn't go through — empty reply.";
      }
    },
    onNetworkError: function () {
      typing.remove();
      addMessage("aria",
        "Can't reach the backend. If you opened this as a local file, run it with " +
        "“vercel dev” or deploy to Vercel so /api/chat is live.");
    },
  });
}

/* handle a submitted message from either composer */
export function send(text) {
  text = (text || "").trim();
  const image = state.pendingImage;
  if (!text && !image) return;
  enterChat();

  addMessage("user", text, image);

  if (image) {
    const parts = [];
    if (text) parts.push({ type: "text", text: text });
    parts.push({ type: "image_url", image_url: { url: image } });
    state.history.push({ role: "user", content: parts });
  } else {
    state.history.push({ role: "user", content: text });
  }

  clearImage();
  persist();
  ariaReply();
}
