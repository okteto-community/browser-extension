# Contributing to the Okteto Chrome Extension

Thanks for your interest in contributing! This document covers everything you need to get the extension running locally, make changes, and publish a new release.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 25+
- [Google Chrome](https://www.google.com/chrome/) 88+
- An Okteto instance with a valid Personal Access Token (for manual end-to-end testing)

---

## Local development setup

### 1. Clone the repository

```bash
git clone https://github.com/okteto-community/browser-extension.git
cd browser-extension
```

### 2. Install dependencies

```bash
npm install
```

### 3. Load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the root folder of this repository (the one containing `manifest.json`).

The Okteto icon will appear in your Chrome toolbar. After making code changes, click the **refresh icon** on the extension card in `chrome://extensions` to reload it.

---

## Running tests

```bash
npm test
```

Tests live in the `tests/` directory and use [Jest](https://jestjs.io/). The test suite covers:

- **`tests/api.test.js`** — GraphQL API client: fetching spaces, authentication errors, token expiry (401), network failures, and malformed responses.
- **`tests/background.test.js`** — Background service worker: header injection logic, rule creation/removal, and storage interactions.

### Watch mode

```bash
npx jest --watch
```

---

## Project structure

```
.
├── manifest.json        # Chrome extension manifest (v3)
├── background.js        # Service worker — manages declarativeNetRequest rules
├── api.js               # GraphQL client for the Okteto API
├── popup.html           # Extension popup markup
├── popup.js             # Popup logic (settings, space selection, toggle)
├── popup.css            # Popup styles
├── icons/               # Extension icons (16px, 48px, 128px)
├── tests/               # Jest test suite
└── .github/workflows/
    └── release.yml      # Release pipeline
```

---

## Making changes

- **Header injection logic** → `background.js`
- **Okteto API calls** → `api.js`
- **Popup UI / settings** → `popup.html`, `popup.js`, `popup.css`

All PRs should include or update tests where relevant. The release workflow blocks on a failing test run.

---

## Publishing a release

Releases are fully automated via GitHub Actions. To publish a new version:

1. Make sure all changes are merged into `main`.
2. Create and push a semver tag:

   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

3. The [release workflow](../.github/workflows/release.yml) will:
   - Run the full test suite (fails fast if any test fails)
   - Patch `manifest.json` with the tag version
   - Package the extension into a zip (only production files)
   - Create a GitHub Release with the zip attached and auto-generated release notes

You can also trigger the workflow manually from the **Actions** tab in GitHub using `workflow_dispatch`.

---

## Code style

There is no enforced linter at the moment — just keep things consistent with the existing code. When in doubt, prefer clarity over cleverness.
