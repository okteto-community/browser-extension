# Okteto Chrome Extension _(beta)_

A Chrome extension that injects a `baggage: okteto-divert=<namespace>` header into every browser request, enabling traffic diversion to a specific Okteto development environment.

> **Beta:** This extension is under active development. Expect rough edges and breaking changes.

---

## Installation

Chrome extensions in development are loaded as _unpacked_ extensions — no Chrome Web Store required.

### 1. Get the files

Clone or download this repository to your machine:

```bash
git clone https://github.com/okteto/okteto-chrome-extension.git
```

### 2. Open Chrome Extensions

Navigate to `chrome://extensions` in your browser.

### 3. Enable Developer Mode

Toggle **Developer mode** on (top-right corner of the Extensions page).

### 4. Load the extension

Click **Load unpacked** and select the folder containing `manifest.json` (the root of this repository).

The Okteto icon will appear in your Chrome toolbar.

---

## Setup

1. Click the Okteto icon in the toolbar to open the popup.
2. Click the **gear icon** to open Settings.
3. Enter your **Okteto Instance URL** (e.g. `https://okteto.example.com`).
4. Enter your **Personal Access Token**.
   You can generate one from your Okteto dashboard under **Settings → Personal Access Tokens**.
5. Click **Save & Load Spaces** — your available development environments will be loaded from the server.

---

## Usage

1. Select a **Space** from the dropdown.
2. Toggle **Inject header** on.
3. All browser requests will now include:
   ```
   baggage: okteto-divert=<selected-space>
   ```
4. Toggle off at any time to stop injecting the header.

---

## Running tests

```bash
npm install
npm test
```

---

## Requirements

- Google Chrome 88+ (Manifest V3 support)
- An Okteto instance with a valid Personal Access Token
