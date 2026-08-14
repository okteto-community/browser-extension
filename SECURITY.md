# Security policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/okteto-community/browser-extension/security/advisories/new)
rather than opening a public issue. We aim to acknowledge reports within three
business days.

## What this extension handles

- **A Personal Access Token** for your Okteto instance, stored in
  `chrome.storage.local`. Chrome does not encrypt extension storage: anyone with
  access to the browser profile on disk can read it. Use the popup's
  **Clear saved credentials** button on shared machines, and revoke the token
  from your Okteto dashboard if a machine is lost.
- **The `baggage: okteto-divert=<space>` request header**, which is injected
  only into the domains you configure and only after you grant Chrome host
  access to them. It is never sent to any other site.

The extension makes no network requests other than the GraphQL call to the
instance URL you configure, and only over https (http is accepted for
`localhost` during development).
