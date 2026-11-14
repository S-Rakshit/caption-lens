const DEFAULTS = {
  backgroundColor: "#ffffff", backgroundOpacity: 25, fontColor: "#1d1d1f", fontSize: 13,
  wordBackgroundColor: "#e9f2ff", wordBackgroundOpacity: 25, wordColor: "#0a84ff",
  popupBackgroundColor: "#6e6e73", popupBackgroundOpacity: 25, popupFontColor: "#f5f5f7",
  outlineStyle: "none", outlineColor: "#ffffff", outlineOpacity: 0, outlineWidth: 0,
  popupOutlineStyle: "none", popupOutlineColor: "#ffffff", popupOutlineOpacity: 0, popupOutlineWidth: 0,
  cacheLimit: 1000, minimumWordLength: 3
};
const form = document.querySelector("#settings-form");
const toast = document.querySelector("#toast");
const previewCard = document.querySelector("#preview-card");
const previewPopup = document.querySelector("#preview-popup");

chrome.runtime.sendMessage({ type: "CAPTION_LENS_GET_SETTINGS" }).then(({ settings }) => fill(settings));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = values();
  const response = await chrome.runtime.sendMessage({ type: "CAPTION_LENS_SAVE_SETTINGS", settings });
  if (response?.ok) { fill(response.settings); showToast("Settings saved."); }
  else showToast("Couldn’t save settings.");
});

document.querySelector("#reset").addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ type: "CAPTION_LENS_SAVE_SETTINGS", settings: DEFAULTS });
  if (response?.ok) { fill(response.settings); showToast("Default settings restored and saved."); }
});

form.querySelectorAll('input[type="range"]').forEach((input) => input.addEventListener("input", () => { input.nextElementSibling.textContent = input.value; updatePreview(); }));
form.addEventListener("change", updatePreview);

function fill(settings) {
  for (const [name, value] of Object.entries(settings)) {
    if (form.elements[name]) form.elements[name].value = value;
  }
  form.querySelectorAll('input[type="range"]').forEach((input) => input.nextElementSibling.textContent = input.value);
  updatePreview();
}

function values() {
  return Object.fromEntries(new FormData(form).entries());
}

function showToast(message) {
  toast.textContent = message;
  setTimeout(() => { if (toast.textContent === message) toast.textContent = ""; }, 3000);
}

function updatePreview() {
  const setting = { ...DEFAULTS, ...values() };
  previewCard.style.backgroundColor = rgba(setting.backgroundColor, setting.backgroundOpacity);
  previewCard.style.color = setting.fontColor;
  previewCard.style.border = `${setting.outlineWidth}px ${setting.outlineStyle} ${rgba(setting.outlineColor, setting.outlineOpacity)}`;
  previewCard.style.fontSize = `${setting.fontSize}px`;
  previewCard.querySelectorAll("span").forEach((word) => { word.style.backgroundColor = rgba(setting.wordBackgroundColor, setting.wordBackgroundOpacity); word.style.color = setting.wordColor; });
  previewPopup.style.backgroundColor = rgba(setting.popupBackgroundColor, setting.popupBackgroundOpacity);
  previewPopup.style.color = setting.popupFontColor;
  previewPopup.style.border = `${setting.popupOutlineWidth}px ${setting.popupOutlineStyle} ${rgba(setting.popupOutlineColor, setting.popupOutlineOpacity)}`;
}

function rgba(hex, opacity) {
  const value = parseInt(hex.slice(1), 16);
  return `rgb(${value >> 16} ${(value >> 8) & 255} ${value & 255} / ${opacity}%)`;
}
