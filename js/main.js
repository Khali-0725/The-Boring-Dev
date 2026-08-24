/* Entry point — wires the composers, theme toggle, chips, and boots the store. */

import { dom, autoGrow } from "./dom.js";
import { state, loadStore } from "./state.js";
import { initAttach } from "./image.js";
import { initMics } from "./speech.js";
import { initSidebar } from "./sidebar.js";
import { send, openChat, newChat } from "./chat.js";

/* ----- theme toggle (default dark; .light flips the CSS tokens) ----- */
function syncThemeButton() {
  const light = document.documentElement.classList.contains("light");
  dom.themeBtn.setAttribute("aria-pressed", String(!light));
  dom.themeBtn.title = light ? "Switch to dark mode" : "Switch to light mode";
}
dom.themeBtn.addEventListener("click", function () {
  const light = document.documentElement.classList.toggle("light");
  try { localStorage.setItem("bd-theme", light ? "light" : "dark"); } catch (e) {}
  syncThemeButton();
});
syncThemeButton();

/* ----- composers ----- */
function enterToSend(inputEl, formEl) {
  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });
}

dom.promptEl.addEventListener("input", function () { autoGrow(dom.promptEl); });
dom.composer.addEventListener("submit", function (e) {
  e.preventDefault();
  send(dom.promptEl.value);
  dom.promptEl.value = "";
  autoGrow(dom.promptEl);
});
enterToSend(dom.promptEl, dom.composer);

dom.dockInput.addEventListener("input", function () { autoGrow(dom.dockInput); });
dom.dock.addEventListener("submit", function (e) {
  e.preventDefault();
  send(dom.dockInput.value);
  dom.dockInput.value = "";
  autoGrow(dom.dockInput);
});
enterToSend(dom.dockInput, dom.dock);

/* ----- suggestion chips ----- */
dom.chips.addEventListener("click", function (e) {
  const chip = e.target.closest(".chip");
  if (chip) send(chip.textContent);
});

/* ----- clicking the logo/wordmark goes home ----- */
if (dom.homeLink) {
  dom.homeLink.addEventListener("click", function (e) { e.preventDefault(); newChat(); });
}

/* ----- boot ----- */
initAttach();
initMics();
initSidebar();

loadStore();
state.chats.sort((a, b) => b.updatedAt - a.updatedAt);
const recent = state.chats.find((c) => c.messages.length > 0);
if (recent) openChat(recent.id);
else newChat();
