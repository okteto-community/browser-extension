# Okteto Chrome Extension _(beta)_

A Chrome extension that injects a `baggage: okteto-divert=<namespace>` header into every browser request, enabling traffic diversion to a specific Okteto development environment.

> **Beta:** This extension is under active development. Expect rough edges and breaking changes.

---

## Installation

### Download the latest release

1. Go to the [Releases](https://github.com/okteto-community/browser-extension/releases) page and download the latest `okteto-extension-vX.Y.Z.zip`.
2. Unzip the file.
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder.

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

## Requirements

- Google Chrome 88+ (Manifest V3 support)
- An Okteto instance with a valid Personal Access Token

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, how to run tests, and how to publish a release.
