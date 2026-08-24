/* Element references + tiny DOM utilities shared across modules. */

const id = (x) => document.getElementById(x);

export const dom = {
  hero: id("hero"),
  chat: id("chat"),
  thread: id("thread"),
  composer: id("composer"),
  promptEl: id("prompt"),
  dock: id("dock"),
  dockWrap: id("dock-wrap"),
  dockInput: id("dock-input"),
  chips: id("chips"),
  themeBtn: id("theme-toggle"),
  menuBtn: id("menu-toggle"),
  sidebar: id("sidebar"),
  backdrop: id("backdrop"),
  newChatBtn: id("new-chat"),
  recentsEl: id("recents"),
  clearBtn: id("clear-data"),
  homeLink: id("home-link"),
};

/* auto-grow a textarea to fit its content (capped) */
export function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

/* briefly swap a button's label to confirm an action */
export function flashButton(btn, label) {
  const original = btn.textContent;
  btn.textContent = label;
  btn.classList.add("done");
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove("done");
  }, 1400);
}

export function truncate(s, n) {
  s = s.trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
