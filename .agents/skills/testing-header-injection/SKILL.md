---
name: testing-header-injection
description: How to end-to-end test the Okteto browser extension's declarativeNetRequest baggage-header injection locally, without a real Okteto instance.
---

# Testing the Okteto extension's header injection end to end

No build step. Load the repo root as an unpacked extension:
chrome://extensions → Developer mode ON → **Load unpacked**. In the GTK folder
picker, navigating with Ctrl+L is unreliable (inline autocomplete keeps
appending); instead use the Home / repos sidebar entries, single-click the
`browser-extension` folder row, then click **Open**. Note the extension ID
shown on the card.

## Driving the popup
Open `chrome-extension://<id>/popup.html` **as a normal tab**. It behaves like
the toolbar popup, does not close when focus moves, and
`chrome.permissions.request()` still shows the real Chrome prompt (click
**Allow**). This makes screenshots and recordings far easier.

## Local harness (no real Okteto instance needed)
1. `/etc/hosts`: point a fake instance domain, a subdomain, an unrelated domain
   and a suffix-lookalike at 127.0.0.1, e.g.
   `127.0.0.1 okteto.test app-ns.okteto.test other.test notokteto.test`
2. Run one HTTP server on a single port serving all of them. It should:
   - render the received `baggage` request header for the top-level document,
   - issue a `fetch('/echo')` from the page and render the header the XHR
     carried (subresource coverage is a separate DNR resourceType and must be
     checked separately),
   - answer `POST /graphql` with
     `{"data":{"spaces":[{"id":"myspace"},{"id":"other"}]}}` so the popup can
     load spaces with any dummy PAT.
3. Popup settings: Instance URL `http://localhost:<port>` (the URL validator
   only allows http for `localhost`/`127.0.0.1`), any PAT, and put the fake
   domain (`okteto.test`) in the **Domains** field. The Domains field is what
   scopes injection — the instance URL host is only its default.

## Inspecting the actual rule / permissions
chrome://extensions → the extension card → **service worker** → Console:
```js
(await chrome.declarativeNetRequest.getDynamicRules())
  .map(r => `rule ${r.id}: ${r.action.requestHeaders[0].header}: ${r.action.requestHeaders[0].value} | requestDomains=${JSON.stringify(r.condition.requestDomains)} | urlFilter=${r.condition.urlFilter} | resourceTypes=${r.condition.resourceTypes.length}`).join('\n')
(await chrome.permissions.getAll()).origins
```
Print results as template strings — expanded objects are hard to read in
screenshots.

## Things worth asserting
- Header present on the exact configured domain and on a subdomain of it
  (`requestDomains` matches subdomains — verified empirically on Chrome 137).
- Header present on XHR/fetch, not just `main_frame`.
- Header absent on an unrelated domain and on a suffix-lookalike host
  (`notokteto.test`) — matching is label-boundary based.
- Toggling off, and **Clear saved credentials**, must leave
  `getDynamicRules() == []` and `permissions.getAll().origins == []`.

## Gotchas
- After **Clear saved credentials**, re-saving the same domains may not
  re-prompt for host permissions within the same browsing session; verify
  revocation with `chrome.permissions.getAll()` rather than by the presence of
  a prompt.
- Chrome must be relaunched only if absolutely necessary; the unpacked
  extension survives reloads via the **Reload** button on the card.

## Devin Secrets Needed
None — the harness replaces the Okteto instance; any dummy PAT works.
