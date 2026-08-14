---
name: testing-header-injection
description: How to end-to-end test the Okteto browser extension's declarativeNetRequest baggage-header injection, either with an offline fake-domain harness or against a real Okteto instance (demo.okteto.dev).
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

## Real-instance harness (against a live Okteto instance)
Use this when you must exercise the real https path and the real GraphQL API
(the offline harness cannot). Verified against `demo.okteto.dev` with the
`okteto` CLI 3.22.0.

1. Authenticate the CLI. Bind the org secrets through the exec tool's `env`
   (`OKTETO_CONTEXT`, `OKTETO_TOKEN`) so they never get printed:
   ```bash
   okteto context use "$OKTETO_CONTEXT" --token "$OKTETO_TOKEN"
   okteto namespace create devin-baggage-test
   ```
2. Deploy the header-echo app in [`okteto-real/`](./okteto-real) next to this
   skill:
   ```bash
   cd .agents/skills/testing-header-injection/okteto-real
   okteto deploy --wait --namespace devin-baggage-test
   ```
   `okteto.yaml` builds `echo/` (a `python:3.11-alpine` image running
   `echo/server.py`, which renders the received `baggage` header for the
   document and serves `fetch('/echo')` returning `{"headers": {...}}` so the
   XHR case is covered), then applies `k8s.yaml`. Okteto exports the built
   image as `$OKTETO_BUILD_ECHO_IMAGE`, which the deploy step substitutes into
   the manifest with `envsubst`. The `Service` carries
   `dev.okteto.com/auto-ingress: "true"` — that annotation is what produces the
   public endpoint.
3. Endpoint URL shape produced by auto-ingress:
   `https://<service>-<namespace>.<instance-domain>` — e.g.
   `https://echo-devin-baggage-test.demo.okteto.dev`. Note this is a
   **subdomain of the instance domain**, which is exactly the customer
   scenario. Sanity-check the ingress forwards arbitrary headers before
   involving the browser:
   ```bash
   curl -s -H "baggage: probe=1" https://echo-devin-baggage-test.demo.okteto.dev/echo
   ```
4. Popup settings: Instance URL `https://demo.okteto.dev`, PAT = the token
   (type it with `${OKTETO_TOKEN}` substitution so it is never logged), and
   **leave the Domains field blank** so it derives to `demo.okteto.dev`.
   Save & Load Spaces → Allow the host-permission prompt → the Space dropdown
   fills with the real namespaces (proof the real GraphQL API answered).
5. Teardown: `okteto namespace delete devin-baggage-test` (takes ~1-2 min;
   run it with a long timeout, it is not instantaneous).

## Gotchas
- After **Clear saved credentials**, re-saving the same domains may not
  re-prompt for host permissions within the same browsing session; verify
  revocation with `chrome.permissions.getAll()` rather than by the presence of
  a prompt.
- Chrome must be relaunched only if absolutely necessary; the unpacked
  extension survives reloads via the **Reload** button on the card.

- Load the exact commit under test. If several branches/worktrees of the
  extension exist on the box, check out the PR commit into its own directory
  (e.g. `git worktree add /home/ubuntu/ext-under-test <sha>`) and load *that*
  as unpacked — loading the wrong copy silently invalidates a whole recording.
- To prove absence of the header on an unrelated https site without DevTools
  trickery, browse `https://httpbin.org/headers`, which renders its own
  received request headers as JSON.
- `okteto namespace delete` can take a couple of minutes and streams progress;
  background it and poll rather than assuming it hung.

## Devin Secrets Needed
- Offline harness: none — any dummy PAT works.
- Real-instance harness: `OKTETO_CONTEXT` and `OKTETO_TOKEN` (org secrets),
  bound via the exec tool's `env`, never echoed.
