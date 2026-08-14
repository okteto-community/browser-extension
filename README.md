# Okteto Chrome Extension _(beta)_

A Chrome extension that injects a `baggage: okteto-divert=<namespace>` header into requests to the Okteto domains you configure, enabling traffic diversion to a specific Okteto development environment.

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
3. Enter your **Okteto Instance URL** (e.g. `https://okteto.example.com`). It must use `https`.
4. Enter your **Personal Access Token**.
   You can generate one from your Okteto dashboard under **Settings → Personal Access Tokens**.
5. Enter the **domains to inject into** — comma separated, subdomains included. Defaults to the host of your instance URL.
6. Click **Save & Load Spaces**. Chrome will ask for access to those domains, and your available development environments will be loaded from the server.

Use **Clear saved credentials** to remove the token and revoke the domain access again.

---

## Usage

1. Select a **Space** from the dropdown.
2. Toggle **Inject header** on.
3. Requests to the configured domains (and their subdomains) will now include:
   ```
   baggage: okteto-divert=<selected-space>
   ```
   No other site ever receives the header. Note that it *replaces* any existing
   `baggage` header on those domains, which is why the scope is opt-in.
4. Toggle off at any time to stop injecting the header.

### Security notes

- The Personal Access Token is stored unencrypted in `chrome.storage.local`, like all Chrome extension storage. Clear it when you're done on a shared machine.
- Host access is requested per domain, so the extension cannot read or modify traffic to any other site.

---

## Requirements

- Google Chrome 102+ (Manifest V3 with optional host permissions)
- An Okteto instance with a valid Personal Access Token

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, how to run tests, and how to publish a release.
