# Contributing to the Okteto Chrome Extension

Thanks for your interest in contributing! This document covers everything you need to get the extension running locally, make changes, and publish a new release.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (CI runs 22)
- [Google Chrome](https://www.google.com/chrome/) 102+
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
npm test              # jest
npm run lint          # eslint
npm run validate:manifest
```

Tests live in the `tests/` directory and use [Jest](https://jestjs.io/). The test suite covers:

- **`tests/api.test.js`** — GraphQL API client: fetching spaces, authentication errors, token expiry (401), network failures, timeouts, malformed responses, and instance URL / domain parsing.
- **`tests/background.test.js`** — Background service worker: header injection logic, the scope of the injection rule, rule creation/removal, and storage interactions.
- **`tests/popup.test.js`** — Popup (jsdom, against the real `popup.html`): credential handling, host permission requests, and the popup ⇄ service worker state handshake.

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
├── schema.json          # Managed-storage (admin policy) schema
├── icons/               # Extension icons (16px, 48px, 128px)
├── scripts/
│   └── validate-manifest.js  # Manifest checks run in CI and at release time
├── tests/               # Jest test suite
└── .github/workflows/
    ├── ci.yml           # Lint, manifest validation, tests
    └── release.yml      # Release pipeline
```

### Injection scope

The extension must never inject the `baggage` header outside the domains the
user configured: the namespace identifies a person and an internal environment,
and `baggage` is a standard header other tools rely on. Concretely, that means
`manifest.json` keeps `host_permissions` empty (access is requested per domain
at runtime via `optional_host_permissions`) and the dynamic rule always carries
a non-empty `condition.requestDomains`. Both are enforced by
`npm run validate:manifest` and by tests — please don't loosen them.

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

   Only plain `vX.Y.Z` tags are accepted — pre-release tags such as `v1.2.0-rc1`
   produce a version string Chrome refuses to load, so the workflow rejects them.

3. The [release workflow](../.github/workflows/release.yml) will:
   - Check out the tag itself (not the branch it was dispatched from)
   - Run lint and the full test suite (fails fast if anything fails)
   - Patch `manifest.json` with the tag version and re-validate it
   - Package the extension into a zip (only production files) and compute its SHA-256
   - Create a GitHub Release with the zip, its checksum, and auto-generated release notes

You can also trigger the workflow manually from the **Actions** tab in GitHub using `workflow_dispatch`.

---

## Code style

`npm run lint` runs ESLint and is enforced in CI. Beyond that, keep things
consistent with the existing code. When in doubt, prefer clarity over cleverness.
