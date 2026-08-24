/* Image attachments — file picker, clipboard paste, preview, and client-side resize. */

import { state } from "./state.js";
import { dom } from "./dom.js";

const previews = [
  document.getElementById("preview-hero"),
  document.getElementById("preview-dock"),
];

/* shrink an image file to a small JPEG data URL (keeps the request light) */
export function fileToDataURL(file, maxDim, quality) {
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

export function renderPreview() {
  previews.forEach(function (p) {
    if (!p) return;
    if (state.pendingImage) {
      p.hidden = false;
      p.innerHTML = '<img alt="attachment" /><button type="button" class="remove">remove</button>';
      p.querySelector("img").src = state.pendingImage;
      p.querySelector(".remove").addEventListener("click", clearImage);
    } else {
      p.hidden = true;
      p.innerHTML = "";
    }
  });
}

export function clearImage() {
  state.pendingImage = null;
  renderPreview();
}

function accept(file) {
  if (!file) return;
  fileToDataURL(file, 1024, 0.8)
    .then(function (url) { state.pendingImage = url; renderPreview(); })
    .catch(function () {});
}

function handlePaste(e) {
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type && it.type.indexOf("image") === 0) {
      const file = it.getAsFile();
      if (file) { e.preventDefault(); accept(file); }
      return;
    }
  }
}

export function initAttach() {
  document.querySelectorAll(".attach").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const input = document.getElementById(btn.getAttribute("data-target"));
      if (input) input.click();
    });
  });
  document.querySelectorAll(".file-input").forEach(function (input) {
    input.addEventListener("change", function () {
      const file = input.files && input.files[0];
      input.value = ""; // allow re-picking the same file
      accept(file);
    });
  });
  dom.promptEl.addEventListener("paste", handlePaste);
  dom.dockInput.addEventListener("paste", handlePaste);
}
