(() => {
  const STOP_WORDS = new Set(`a an the and or but if then than so of in on at to for from by with as into about over after before between through during is am are was were be been being do does did have has had having it its this that these those i you he she we they me him her us them my your his our their who whom what which when where why how not no yes can could should would will shall may might must very just also only own same such each every any all both few more most other some nor too s than`.split(" "));
  let enabled = false, lastCaption = "", timer, card, wordsEl, notice, popover, settings = {}, drag, resize, resizer, detailWord, detailEntry, detailCounts, pausedByLens = false, hoveringCardBody = false;
  const entries = new Map(), pending = new Map();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "CAPTION_LENS_TOGGLE") toggle();
    if (message.type === "CAPTION_LENS_SETTINGS_UPDATED") {
      settings = message.settings;
      if (card) { applySettings(); if (lastCaption) renderCaption(lastCaption); }
    }
  });

  async function toggle() {
    enabled = !enabled;
    if (!enabled) return removeCard();
    settings = (await chrome.runtime.sendMessage({ type: "CAPTION_LENS_GET_SETTINGS" })).settings;
    await ensureCard();
    readCaption();
  }

  async function ensureCard() {
    if (card) return;
    card = document.createElement("section");
    card.id = "caption-lens-card";
    card.innerHTML = `<div class="caption-lens-bar"><div class="caption-lens-words"></div><div class="caption-lens-actions"><button class="caption-lens-settings" aria-label="Caption Lens settings">•••</button><button class="caption-lens-dismiss" aria-label="Close Caption Lens">×</button></div></div><p class="caption-lens-notice" aria-live="polite"></p><i class="caption-lens-resize-handle nw" data-x="-1" data-y="-1"></i><i class="caption-lens-resize-handle n" data-x="0" data-y="-1"></i><i class="caption-lens-resize-handle ne" data-x="1" data-y="-1"></i><i class="caption-lens-resize-handle w" data-x="-1" data-y="0"></i><i class="caption-lens-resize-handle e" data-x="1" data-y="0"></i><i class="caption-lens-resize-handle sw" data-x="-1" data-y="1"></i><i class="caption-lens-resize-handle s" data-x="0" data-y="1"></i><i class="caption-lens-resize-handle se" data-x="1" data-y="1"></i>`;
    document.documentElement.append(card);
    wordsEl = card.querySelector(".caption-lens-words");
    notice = card.querySelector(".caption-lens-notice");
    card.querySelector(".caption-lens-dismiss").addEventListener("click", toggle);
    card.querySelector(".caption-lens-settings").addEventListener("click", () => chrome.runtime.sendMessage({ type: "CAPTION_LENS_OPEN_OPTIONS" }));
    card.addEventListener("pointerdown", beginDrag);
    card.addEventListener("pointermove", pauseForCardArea);
    card.addEventListener("pointerleave", () => { hoveringCardBody = false; scheduleHide(); });
    card.addEventListener("click", (event) => { if (!event.target.closest(".caption-lens-word")) hidePopover(); });
    card.querySelectorAll(".caption-lens-resize-handle").forEach((handle) => handle.addEventListener("pointerdown", beginResize));
    popover = document.createElement("aside");
    popover.id = "caption-lens-popover";
    popover.hidden = true;
    document.documentElement.append(popover);
    popover.addEventListener("mouseleave", scheduleHide);
    applySettings();
    if (!(await restoreLayout())) normalizeCardPosition();
    resizer = new ResizeObserver(saveLayout);
    resizer.observe(card);
  }

  function removeCard() {
    saveLayout(); resizer?.disconnect(); card?.remove(); popover?.remove();
    resumeVideo(); card = popover = resizer = null; lastCaption = "";
  }

  function readCaption() {
    if (!enabled) return;
    const text = [...document.querySelectorAll(".ytp-caption-segment")].map((segment) => segment.textContent.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (text && text !== lastCaption) renderCaption(text);
    if (!text && card) { wordsEl.replaceChildren(); setNotice(""); }
  }

  function renderCaption(text) {
    lastCaption = text;
    const words = usefulWords(text);
    wordsEl.replaceChildren(); hidePopover();
    if (!words.length) return setNotice("No useful words in this caption.");
    setNotice("");
    words.forEach((word) => {
      const button = document.createElement("button");
      button.className = "caption-lens-word"; button.textContent = word; button.dataset.word = word;
      button.addEventListener("mouseenter", () => showPreview(button));
      button.addEventListener("mouseleave", scheduleHide);
      button.addEventListener("click", () => showDetails(button));
      wordsEl.append(button);
    });
  }

  function usefulWords(text) {
    const words = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
    return [...new Set(words.map((word) => word.toLowerCase()))].filter((word) => word.length >= settings.minimumWordLength && !STOP_WORDS.has(word));
  }

  function getEntry(word) {
    if (entries.has(word)) return Promise.resolve(entries.get(word));
    if (pending.has(word)) return pending.get(word);
    const request = chrome.runtime.sendMessage({ type: "CAPTION_LENS_LOOKUP", word }).then((response) => {
      if (!response?.ok) throw new Error("Lookup failed");
      rememberEntry(word, response.entry); return response.entry;
    }).finally(() => pending.delete(word));
    pending.set(word, request); return request;
  }

  async function showPreview(button) {
    pauseVideo();
    showLoading(button);
    try {
      const entry = await getEntry(button.dataset.word);
      if (!button.matches(":hover")) return;
      popover.innerHTML = `<strong>${escape(entry.word)}</strong>${entry.partOfSpeech ? `<em>${escape(entry.partOfSpeech)}</em>` : ""}<p>${escape(entry.definition)}</p><small>Click for details</small>`;
      positionPopover(button);
    } catch (_) { hidePopover(); }
  }

  async function showDetails(button) {
    if (detailWord === button.dataset.word && !popover.hidden) return hidePopover();
    pauseVideo();
    showLoading(button);
    try {
      const entry = await getEntry(button.dataset.word);
      detailWord = button.dataset.word;
      detailEntry = entry;
      detailCounts = entry.meanings?.map(() => 3) || [3];
      renderDetails(button);
    } catch (_) { hidePopover(); setNotice("Couldn’t look up that word."); }
  }
  function renderDetails(button) {
      const entry = detailEntry;
      popover.innerHTML = `<button class="caption-lens-close" aria-label="Close definition">×</button><strong>${escape(entry.word)}</strong>${meaningList(entry)}${list("Similar", entry.synonyms)}${list("Opposite", entry.antonyms)}`;
      popover.querySelector("button").addEventListener("click", hidePopover); positionPopover(button);
      popover.querySelectorAll(".caption-lens-more").forEach((more) => more.addEventListener("click", () => {
        const index = Number(more.dataset.meaning);
        detailCounts[index] += 3;
        renderDetails(button);
      }));
  }

  function showLoading(button) { clearTimeout(timer); popover.innerHTML = "<small>Looking up meaning…</small>"; positionPopover(button); }
  function meaningList(entry) {
    const meanings = entry.meanings?.length ? entry.meanings : [{ partOfSpeech: entry.partOfSpeech, definitions: [{ definition: entry.definition, example: entry.example }] }];
    return `<div class="caption-lens-definitions">${meanings.map((meaning, meaningIndex) => {
      const visible = meaning.definitions.slice(0, detailCounts?.[meaningIndex] || 3);
      return `<section>${meaning.partOfSpeech ? `<em>${escape(meaning.partOfSpeech)}</em>` : ""}${visible.map((item, index) => `<p><b>${index + 1}.</b> ${escape(item.definition)}${item.example ? `<span class="caption-lens-example">“${escape(item.example)}”</span>` : ""}</p>`).join("")}${meaning.definitions.length > visible.length ? `<button class="caption-lens-more" data-meaning="${meaningIndex}">More</button>` : ""}</section>`;
    }).join("")}</div>`;
  }
  function rememberEntry(word, entry) {
    entries.set(word, entry);
    while (entries.size > settings.cacheLimit) entries.delete(entries.keys().next().value);
  }
  function list(label, values) { return values?.length ? `<div class="caption-lens-related"><b>${label}</b><span>${values.map(escape).join(" · ")}</span></div>` : ""; }
  function positionPopover(anchor) {
    if (!popover) return; const rect = anchor.getBoundingClientRect(), width = Math.min(310, innerWidth - 24), above = rect.top - 12, below = innerHeight - rect.bottom - 12, useAbove = above >= below;
    popover.hidden = false; popover.style.width = `${width}px`;
    popover.style.maxHeight = `${Math.max(120, Math.min(360, useAbove ? above : below))}px`;
    popover.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, rect.left + rect.width / 2 - width / 2))}px`;
    popover.style.top = `${useAbove ? Math.max(12, rect.top - popover.offsetHeight - 10) : rect.bottom + 10}px`;
  }
  function scheduleHide() { if (detailWord) return; clearTimeout(timer); timer = setTimeout(() => { if (!popover?.matches(":hover")) hidePopover(); }, 180); }
  function hidePopover() { if (popover) popover.hidden = true; detailWord = detailEntry = detailCounts = null; if (!hoveringCardBody && !popover?.matches(":hover")) resumeVideo(); }
  function setNotice(message) { notice.textContent = message; notice.hidden = !message; }

  function beginDrag(event) {
    if (event.button || event.target.closest("button, input, label, .caption-lens-settings-panel")) return;
    const rect = card.getBoundingClientRect(); drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    card.classList.add("caption-lens-dragging"); card.setPointerCapture(event.pointerId);
    card.addEventListener("pointermove", dragCard); card.addEventListener("pointerup", endDrag, { once: true });
  }
  function dragCard(event) {
    if (!drag) return;
    const left = Math.max(0, Math.min(innerWidth - card.offsetWidth, event.clientX - drag.x));
    const top = Math.max(0, Math.min(innerHeight - card.offsetHeight, event.clientY - drag.y));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px`, bottom: "auto", transform: "none" });
  }
  function endDrag() { drag = null; card.classList.remove("caption-lens-dragging"); card.removeEventListener("pointermove", dragCard); saveLayout(); }
  function beginResize(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const rect = card.getBoundingClientRect();
    resize = { centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2, x: Number(event.currentTarget.dataset.x), y: Number(event.currentTarget.dataset.y) };
    card.classList.add("caption-lens-resizing");
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", resizeCard, { capture: true, passive: false });
    window.addEventListener("pointerup", endResize, true);
    window.addEventListener("pointercancel", endResize, true);
    window.addEventListener("dragstart", preventResizeDrag, true);
  }
  function resizeCard(event) {
    if (!resize) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    const width = resize.x ? Math.max(230, Math.min(innerWidth, Math.abs(event.clientX - resize.centerX) * 2)) : rect.width;
    const height = resize.y ? Math.max(52, Math.min(innerHeight, Math.abs(event.clientY - resize.centerY) * 2)) : rect.height;
    Object.assign(card.style, { width: `${width}px`, height: `${height}px`, left: `${resize.centerX - width / 2}px`, top: `${resize.centerY - height / 2}px`, bottom: "auto", transform: "none" });
  }
  function endResize() { if (!resize) return; resize = null; card.classList.remove("caption-lens-resizing"); window.removeEventListener("pointermove", resizeCard, true); window.removeEventListener("pointerup", endResize, true); window.removeEventListener("pointercancel", endResize, true); window.removeEventListener("dragstart", preventResizeDrag, true); saveLayout(); }
  function preventResizeDrag(event) { event.preventDefault(); }
  async function restoreLayout() {
    const layout = (await chrome.runtime.sendMessage({ type: "CAPTION_LENS_GET_LAYOUT" })).layout; if (!layout) return false;
    Object.assign(card.style, { width: `${layout.width}px`, height: `${layout.height}px`, left: `${layout.left}px`, top: `${layout.top}px`, bottom: "auto", transform: "none" });
    return true;
  }
  function normalizeCardPosition() {
    const rect = card.getBoundingClientRect();
    Object.assign(card.style, { left: `${Math.round(rect.left)}px`, top: `${Math.round(rect.top)}px`, bottom: "auto", transform: "none" });
  }
  function saveLayout() {
    if (!card) return; const rect = card.getBoundingClientRect();
    chrome.runtime.sendMessage({ type: "CAPTION_LENS_SAVE_LAYOUT", layout: { width: Math.round(rect.width), height: Math.round(rect.height), left: Math.round(rect.left), top: Math.round(rect.top) } }).catch(() => {});
  }
  function applySettings() {
    card.style.backgroundColor = rgba(settings.backgroundColor, settings.backgroundOpacity);
    card.style.backdropFilter = settings.backgroundOpacity === 0 ? "none" : "blur(22px) saturate(150%)";
    card.style.borderStyle = settings.outlineStyle;
    card.style.borderColor = rgba(settings.outlineColor, settings.outlineOpacity);
    card.style.borderWidth = `${settings.outlineWidth}px`;
    card.style.setProperty("--caption-lens-color", settings.fontColor);
    card.style.setProperty("--caption-lens-font-size", `${settings.fontSize}px`);
    card.style.setProperty("--caption-lens-word-background", rgba(settings.wordBackgroundColor, settings.wordBackgroundOpacity));
    card.style.setProperty("--caption-lens-word-color", settings.wordColor);
    popover.style.backgroundColor = rgba(settings.popupBackgroundColor, settings.popupBackgroundOpacity);
    popover.style.color = settings.popupFontColor;
    popover.style.backdropFilter = settings.popupBackgroundOpacity === 0 ? "none" : "blur(20px)";
    popover.style.borderStyle = settings.popupOutlineStyle;
    popover.style.borderColor = rgba(settings.popupOutlineColor, settings.popupOutlineOpacity);
    popover.style.borderWidth = `${settings.popupOutlineWidth}px`;
  }
  function rgba(hex, opacity) { const value = parseInt(hex.slice(1), 16); return `rgb(${value >> 16} ${(value >> 8) & 255} ${value & 255} / ${opacity}%)`; }
  function video() { return document.querySelector("video.html5-main-video"); }
  function pauseVideo() { const player = video(); if (player && !player.paused) { player.pause(); pausedByLens = true; } }
  function resumeVideo() { const player = video(); if (pausedByLens && player?.paused) player.play().catch(() => {}); pausedByLens = false; }
  function pauseForCardArea(event) {
    hoveringCardBody = !event.target.closest(".caption-lens-actions, .caption-lens-resize-handle");
    if (hoveringCardBody) pauseVideo();
    else if (!detailWord) hidePopover();
  }
  function escape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]); }

  new MutationObserver(() => { if (enabled) { clearTimeout(timer); timer = setTimeout(readCaption, 180); } }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
