/* Voice features — text-to-speech (speechSynthesis) + speech-to-text (SpeechRecognition).
   Both are browser-native and client-side; no backend involved. */

import { flashButton, autoGrow } from "./dom.js";

/* ----- text-to-speech ----- */
let speakingBtn = null;

function stripForSpeech(md) {
  return String(md)
    .replace(/```[\s\S]*?```/g, ". code block. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((?:.*?)\)/g, "$1")
    .replace(/[*#>_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function resetSpeakBtn(btn) {
  if (!btn) return;
  btn.classList.remove("speaking");
  btn.textContent = "speak";
}
export function toggleSpeak(btn, text) {
  const synth = window.speechSynthesis;
  if (!synth) { flashButton(btn, "no audio"); return; }
  if (speakingBtn === btn) { synth.cancel(); resetSpeakBtn(btn); speakingBtn = null; return; }
  synth.cancel();
  resetSpeakBtn(speakingBtn);
  const u = new SpeechSynthesisUtterance(stripForSpeech(text));
  u.rate = 1.02;
  u.onend = function () { resetSpeakBtn(btn); if (speakingBtn === btn) speakingBtn = null; };
  u.onerror = u.onend;
  speakingBtn = btn;
  btn.classList.add("speaking");
  btn.textContent = "stop";
  synth.speak(u);
}

/* ----- speech-to-text (voice input) ----- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, listeningBtn = null, recogTarget = null, baseText = "";

function stopMicUI() {
  if (listeningBtn) { listeningBtn.classList.remove("listening"); listeningBtn = null; }
  recogTarget = null;
}
function initRecog() {
  const r = new SR();
  r.lang = "en-US";
  r.interimResults = true;
  r.continuous = false;
  r.onresult = function (e) {
    let txt = "";
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    if (recogTarget) {
      recogTarget.value = (baseText ? baseText + " " : "") + txt;
      autoGrow(recogTarget);
    }
  };
  r.onend = stopMicUI;
  r.onerror = stopMicUI;
  return r;
}
function toggleMic(btn, targetEl) {
  if (listeningBtn) { try { recog.stop(); } catch (e) {} return; }
  if (!recog) recog = initRecog();
  recogTarget = targetEl;
  baseText = (targetEl.value || "").trim();
  listeningBtn = btn;
  btn.classList.add("listening");
  try { recog.start(); } catch (e) { stopMicUI(); }
  targetEl.focus();
}
export function initMics() {
  document.querySelectorAll(".mic").forEach(function (btn) {
    if (!SR) { btn.hidden = true; return; }  // unsupported browser → hide the mic
    const target = document.getElementById(btn.getAttribute("data-target"));
    btn.addEventListener("click", function () { toggleMic(btn, target); });
  });
}
