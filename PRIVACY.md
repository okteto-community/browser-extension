# Privacy Policy — Okteto Chrome Extension

_Last updated: 2026-08-14_

The Okteto browser extension adds a `baggage: okteto-divert=<space>` request
header to the domains you configure, so requests are routed to your Okteto
development environment. This policy describes what it does with your data.

## What the extension stores

All of it lives in `chrome.storage.local`, on your machine only:

| Data | Why | Where it goes |
| --- | --- | --- |
| Okteto instance URL | To query your instance for the list of spaces | Sent only to that instance |
| Personal Access Token | To authenticate that query | Sent only to that instance, as a `Bearer` token |
| Selected space name | To build the `baggage` header value | Sent only to the domains you configured |
| Configured domains | To scope the header injection and the host permissions | Never sent anywhere |
| Enabled/disabled flag | To remember whether injection is on | Never sent anywhere |

## What the extension sends, and to whom

- A single `POST <your instance>/graphql` request listing your spaces, sent to
  the instance URL **you** entered, authenticated with **your** token.
- The `baggage` header, added to requests the browser makes to the domains you
  configured (and their subdomains) while injection is enabled.

That is the complete list. The extension has no analytics, no telemetry, no
crash reporting, and no third-party services. Neither Okteto nor anyone else
receives your data from the extension: it never contacts any server other than
the instance you configured and the domains you configured.

## Host permissions

The extension requests access to specific domains at runtime, when you save
your settings, and to nothing by default. It asks for a broad optional pattern
in the manifest (`*://*/*`) only because Okteto is self-hosted — the domains
cannot be known when the extension is built — but Chrome only ever grants the
domains you actually entered, and the injection rule is limited to those same
domains. You can review and revoke this access at any time from
`chrome://extensions`.

## Data retention and deletion

Nothing is stored off your device, so there is nothing for us to retain or
delete. To erase everything locally, use **Clear saved credentials** in the
extension's settings (which also revokes the host permissions), or remove the
extension.

## Changes

Material changes to this policy will be published in this file and referenced
from the Chrome Web Store listing.

## Contact

Questions or reports: <security@okteto.com>, or open an issue at
<https://github.com/okteto-community/browser-extension/issues>. For security
issues, please follow [SECURITY.md](SECURITY.md).
