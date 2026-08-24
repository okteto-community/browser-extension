# Publishing to the Chrome Web Store

Everything needed to get this extension listed, and the exact text to paste
into the dashboard so the listing matches what the code actually does.

## One-time setup

1. **Publisher account.** Register at the
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole) with a
   Google account and pay the one-time registration fee. Use a *group
   publisher* owned by Okteto rather than an individual's account — a listing
   tied to a personal account cannot be transferred easily and dies with the
   account.
2. **Verify the publisher** (email + domain) so the listing shows "Okteto"
   rather than an unverified address.
3. **Create the item** by uploading a release zip once, manually. This mints
   the extension ID that everything else (policy deployment, the publish
   workflow) refers to. Keep the ID stable: never create a second item for the
   same extension.

## Listing content

**Name:** Okteto

**Short description** (132 characters max):

> Route your browser traffic to your Okteto development environment.

**Detailed description:**

> Okteto lets you run and share development environments in Kubernetes. This
> extension routes your browser to a specific environment: pick one of your
> spaces and the extension adds the `baggage: okteto-divert=<space>` header to
> requests for the domains you configure, so your Okteto instance diverts them
> to that environment.
>
> - Choose which domains the header applies to. The extension asks Chrome for
>   access to those domains only, and never sends the header anywhere else.
> - Works with self-hosted Okteto: point it at your instance URL and add any
>   additional domains your applications are served from.
> - Toggle diversion on and off without changing anything in your cluster.
>
> Requires an Okteto instance and a Personal Access Token, which you can create
> from your Okteto dashboard under Settings → Personal Access Tokens.

**Category:** Developer Tools

**Assets:** the 128px icon (`icons/icon128.png`) plus at least one screenshot at
1280x800 or 640x400. Screenshot the popup with the space dropdown populated and
the header preview visible — that single screen is the whole product.

## Privacy tab

**Single purpose:**

> Adds an Okteto traffic-diversion header to requests for the domains the user
> configures, so their browsing is routed to their own Okteto development
> environment.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Stores the user's Okteto instance URL, Personal Access Token, selected space and configured domains locally, so the settings survive between browser sessions. Nothing is stored remotely. |
| `declarativeNetRequestWithHostAccess` | The extension's only function: adding the `baggage` request header. This variant is used deliberately instead of `declarativeNetRequest` so that rules apply only to hosts the user has granted access to. |
| Host permissions (`*://*/*`, optional) | Okteto is self-hosted, so the domains that must receive the header are only known to the user — they are entered in the extension's settings. Nothing is granted at install time: the extension requests access at runtime for exactly the domains the user typed, and the header rule is scoped to those same domains. |
| Remote code | None. All code is in the package; the extension loads no remote scripts. |

**Data usage:** declare *Authentication information* (the Personal Access
Token) and *Website content* (the configured domains) as collected but stored
locally and not transmitted to the developer or any third party, then certify:
not sold, not used for unrelated purposes, not used for creditworthiness.

**Privacy policy URL:**
<https://github.com/okteto-community/browser-extension/blob/main/PRIVACY.md>
(required, because the extension handles authentication information).

## Visibility

- **Unlisted** is the recommended default: customers install with one click
  from a link in the docs and get automatic updates, without the extension
  being publicly discoverable or subject to as much drive-by review noise.
- **Public** once the listing assets and the beta label are settled.
- Customers who manage their fleets can force-install it by extension ID with
  the `ExtensionInstallForcelist` policy; that works for unlisted items too.

## Review expectations

The broad optional host permission is the part reviewers push back on. It is
optional (nothing is granted at install time) and the justification above
states why the domain list cannot be known at build time — keep both facts in
the submission. Expect a longer review than a permission-free extension, and
budget for one round of clarification.

## Automated publishing

`release.yml` uploads and publishes the tagged zip when these four repository
secrets exist; without them the release still happens and the publish step is
skipped, so the workflow keeps working before the listing exists.

| Secret | How to get it |
| --- | --- |
| `CWS_EXTENSION_ID` | The item ID from the dashboard URL. |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` | An OAuth client (type: Desktop app) in a Google Cloud project with the Chrome Web Store API enabled. |
| `CWS_REFRESH_TOKEN` | Obtained once, with the client above, for the `https://www.googleapis.com/auth/chromewebstore` scope. |

To publish to trusted testers instead of everyone, set the repository variable
`CWS_PUBLISH_TARGET` to `trustedTesters`.
