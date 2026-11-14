# Caption Lens

A minimal Chrome extension for learning from the current English YouTube caption.

## What it does

Click the extension icon on a YouTube watch page. Caption Lens shows useful words from the live caption. Hovering a word fetches and shows a quick definition; clicking it shows available synonyms, antonyms, and an example.

## Resource limits

- Inactive until the user clicks the extension icon.
- No lookup happens until a word is hovered or clicked.
- Dictionary results are saved persistently, with a default global limit of 1,000 words; the oldest result is removed when the limit is reached. The cap is adjustable from 25–1,000.
- No expiry timer, caption history, account, or backend.
- The card size and location are retained for the current browser session only. Appearance and resource settings persist across browser restarts.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a YouTube video, turn on English captions, then click the Caption Lens toolbar icon.

Press `Option + C` on macOS or `Alt + C` on Windows to toggle Caption Lens. Change that shortcut at `chrome://extensions/shortcuts`.

Dictionary data comes from Free Dictionary API with Datamuse used to supplement related words. Both sources can omit data for particular words.
