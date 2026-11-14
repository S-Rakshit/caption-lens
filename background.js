const DEFAULT_SETTINGS = {
  backgroundColor: "#ffffff", backgroundOpacity: 25, fontColor: "#1d1d1f", fontSize: 13,
  wordBackgroundColor: "#e9f2ff", wordBackgroundOpacity: 25, wordColor: "#0a84ff",
  popupBackgroundColor: "#6e6e73", popupBackgroundOpacity: 25, popupFontColor: "#f5f5f7",
  outlineStyle: "none", outlineColor: "#ffffff", outlineOpacity: 0, outlineWidth: 0,
  popupOutlineStyle: "none", popupOutlineColor: "#ffffff", popupOutlineOpacity: 0, popupOutlineWidth: 0,
  cacheLimit: 1000, minimumWordLength: 3
};
const SETTINGS_KEY = "captionLensSettings";
const INDEX_KEY = "captionLensCacheIndex";
const PREFIX = "captionLensResult:";
const LAYOUT_KEY = "captionLensLayoutV2";
let cacheIndex;

chrome.action.onClicked.addListener(toggleActiveYouTubeTab);
chrome.commands.onCommand.addListener((command) => { if (command === "toggle-caption-lens") toggleActiveYouTubeTab(); });

function toggleActiveYouTubeTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) => {
    if (tab?.id && tab.url?.startsWith("https://www.youtube.com/watch")) chrome.tabs.sendMessage(tab.id, { type: "CAPTION_LENS_TOGGLE" }).catch(() => {});
  });
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message.type === "CAPTION_LENS_LOOKUP") lookupWord(message.word).then((entry) => reply({ ok: true, entry })).catch(() => reply({ ok: false }));
  else if (message.type === "CAPTION_LENS_GET_SETTINGS") getSettings().then((settings) => reply({ settings }));
  else if (message.type === "CAPTION_LENS_SAVE_SETTINGS") saveSettings(message.settings).then((settings) => reply({ ok: true, settings })).catch(() => reply({ ok: false }));
  else if (message.type === "CAPTION_LENS_GET_LAYOUT") chrome.storage.session.get(LAYOUT_KEY).then((stored) => reply({ layout: stored[LAYOUT_KEY] }));
  else if (message.type === "CAPTION_LENS_SAVE_LAYOUT") chrome.storage.session.set({ [LAYOUT_KEY]: message.layout }).then(() => reply({ ok: true }));
  else if (message.type === "CAPTION_LENS_OPEN_OPTIONS") chrome.runtime.openOptionsPage().then(() => reply({ ok: true }));
  else return;
  return true;
});

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
}

async function saveSettings(next) {
  const settings = {
    backgroundColor: color(next.backgroundColor, DEFAULT_SETTINGS.backgroundColor),
    backgroundOpacity: clamp(Number(next.backgroundOpacity), 0, 100),
    fontColor: color(next.fontColor, DEFAULT_SETTINGS.fontColor),
    fontSize: clamp(Number(next.fontSize), 11, 24),
    wordBackgroundColor: color(next.wordBackgroundColor, DEFAULT_SETTINGS.wordBackgroundColor),
    wordBackgroundOpacity: clamp(Number(next.wordBackgroundOpacity), 0, 100),
    wordColor: color(next.wordColor, DEFAULT_SETTINGS.wordColor),
    popupBackgroundColor: color(next.popupBackgroundColor, DEFAULT_SETTINGS.popupBackgroundColor),
    popupBackgroundOpacity: clamp(Number(next.popupBackgroundOpacity), 0, 100),
    popupFontColor: color(next.popupFontColor, DEFAULT_SETTINGS.popupFontColor),
    outlineStyle: ["none", "solid", "dashed"].includes(next.outlineStyle) ? next.outlineStyle : DEFAULT_SETTINGS.outlineStyle,
    outlineColor: color(next.outlineColor, DEFAULT_SETTINGS.outlineColor),
    outlineOpacity: clamp(Number(next.outlineOpacity), 0, 100),
    outlineWidth: clamp(Number(next.outlineWidth), 0, 6),
    popupOutlineStyle: ["none", "solid", "dashed"].includes(next.popupOutlineStyle) ? next.popupOutlineStyle : DEFAULT_SETTINGS.popupOutlineStyle,
    popupOutlineColor: color(next.popupOutlineColor, DEFAULT_SETTINGS.popupOutlineColor),
    popupOutlineOpacity: clamp(Number(next.popupOutlineOpacity), 0, 100),
    popupOutlineWidth: clamp(Number(next.popupOutlineWidth), 0, 6),
    cacheLimit: clamp(Number(next.cacheLimit), 25, 1000),
    minimumWordLength: clamp(Number(next.minimumWordLength), 3, 12)
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  await trimCache(settings.cacheLimit);
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/watch*" });
  await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: "CAPTION_LENS_SETTINGS_UPDATED", settings }).catch(() => {})));
  return settings;
}

async function lookupWord(rawWord) {
  const word = String(rawWord || "").trim().toLowerCase();
  if (!word) throw new Error("Missing word");
  const key = `${PREFIX}${word}`;
  const stored = await chrome.storage.local.get(key);
  if (stored[key]?.meanings) return stored[key];
  const data = await fetchDictionaryData(word);
  await saveCachedResult(word, data);
  return data;
}

async function index() {
  if (cacheIndex) return cacheIndex;
  const stored = await chrome.storage.local.get(INDEX_KEY);
  cacheIndex = Array.isArray(stored[INDEX_KEY]) ? stored[INDEX_KEY] : [];
  return cacheIndex;
}

async function saveCachedResult(word, data) {
  const savedIndex = await index();
  const existing = savedIndex.indexOf(word);
  if (existing >= 0) savedIndex.splice(existing, 1);
  savedIndex.push(word);
  await chrome.storage.local.set({ [`${PREFIX}${word}`]: data });
  await trimCache((await getSettings()).cacheLimit);
}

async function trimCache(limit) {
  const savedIndex = await index();
  const removed = savedIndex.splice(0, Math.max(0, savedIndex.length - limit));
  await chrome.storage.local.set({ [INDEX_KEY]: savedIndex });
  if (removed.length) await chrome.storage.local.remove(removed.map((word) => `${PREFIX}${word}`));
}

async function fetchDictionaryData(word) {
  const dictionary = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`).then((response) => response.ok ? response.json() : []).catch(() => []);
  const related = Promise.all([
    fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=5`).then((response) => response.ok ? response.json() : []),
    fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=5`).then((response) => response.ok ? response.json() : [])
  ]).catch(() => [[], []]);
  const [entries, [synonyms, antonyms]] = await Promise.all([dictionary, related]);
  const meanings = entries?.flatMap((entry) => entry.meanings || []).map((meaning) => ({
    partOfSpeech: meaning.partOfSpeech || "",
    definitions: (meaning.definitions || []).map((definition) => ({ definition: definition.definition || "", example: definition.example || "" }))
  })) || [];
  const firstMeaning = meanings[0];
  const definition = firstMeaning?.definitions?.[0];
  return {
    word,
    partOfSpeech: firstMeaning?.partOfSpeech || "",
    definition: definition?.definition || "Definition unavailable.",
    example: definition?.example || "",
    meanings,
    synonyms: unique([...(entries?.flatMap((entry) => entry.meanings || []).flatMap((meaning) => meaning.synonyms || []) || []), ...synonyms.map((item) => item.word)]),
    antonyms: unique([...(entries?.flatMap((entry) => entry.meanings || []).flatMap((meaning) => meaning.antonyms || []) || []), ...antonyms.map((item) => item.word)])
  };
}

function unique(words) { return [...new Set(words.filter(Boolean).map((word) => word.toLowerCase()))].slice(0, 5); }
function clamp(value, min, max) { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min; }
function color(value, fallback) { return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
