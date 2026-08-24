/* Message rendering — builds the chat bubbles and their copy/speak/meta controls. */

import { dom, flashButton } from "./dom.js";
import { renderMarkdown } from "./markdown.js";
import { toggleSpeak } from "./speech.js";

/* keep the newest message in view */
export function scrollThread() {
  dom.chat.scrollTop = dom.chat.scrollHeight;
}

/* create + append a message bubble; returns the outer element.
   imageURL (optional) shows a thumbnail inside a user bubble. */
export function addMessage(role, text, imageURL) {
  const isUser = role === "user";
  const wrap = document.createElement("div");
  wrap.className =
    "msg " + role + " flex flex-col w-full group " +
    (isUser ? "items-end" : "items-start");

  const panel = document.createElement("div");
  panel.className = isUser
    ? "user-bubble px-6 py-4 rounded-2xl rounded-tr-sm max-w-[85%] md:max-w-[70%]"
    : "glass-panel px-6 py-5 rounded-2xl rounded-tl-sm max-w-full md:max-w-[85%] text-on-surface";

  if (isUser) {
    panel.innerHTML =
      '<div class="font-label-caps text-[10px] text-white/70 mb-1 tracking-wider uppercase">You</div>';
  } else {
    panel.innerHTML =
      '<div class="flex items-center gap-2 mb-3 border-b border-outline-variant/20 pb-2">' +
        '<span class="material-symbols-outlined text-primary" style="font-size:16px;">smart_toy</span>' +
        '<div class="font-label-caps text-[10px] text-on-surface-variant tracking-wider uppercase">Boring Dev</div>' +
      '</div>';
  }

  const body = document.createElement("div");
  body.className = "body" + (isUser ? " whitespace-pre-wrap" : "");
  body.textContent = text;
  panel.appendChild(body);

  if (imageURL) {
    const img = document.createElement("img");
    img.className = "sent-image";
    img.src = imageURL;
    img.alt = "attached image";
    panel.appendChild(img);
  }

  wrap.appendChild(panel);
  dom.thread.appendChild(wrap);
  scrollThread();
  return wrap;
}

/* three-dot typing indicator; return the node so we can replace it */
export function addTyping() {
  const wrap = document.createElement("div");
  wrap.className = "msg aria flex flex-col items-start w-full";
  wrap.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  dom.thread.appendChild(wrap);
  scrollThread();
  return wrap;
}

/* add the copy / speak (+ optional speed) footer to an assistant message */
export function addMeta(msg, rawText, secs) {
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML =
    (secs ? '<span class="speed">⚡ ' + secs + "s</span>" : "") +
    '<button class="copy-msg" type="button">copy</button>' +
    '<button class="speak-btn" type="button">speak</button>';
  (msg.querySelector(".glass-panel") || msg).appendChild(meta);
}

/* wire up code-block + message copy + speak buttons inside a rendered message */
export function wireCopy(msg, rawText) {
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
  const speakBtn = msg.querySelector(".speak-btn");
  if (speakBtn) {
    speakBtn.addEventListener("click", function () { toggleSpeak(speakBtn, rawText); });
  }
}

export { renderMarkdown };
