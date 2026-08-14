# Managed configuration (for administrators)

Chrome lets administrators preconfigure the extension by policy, so users do
not have to type the Okteto instance URL or the list of domains. Only those two
settings are policy-provided; the Personal Access Token is always entered by
the user and stays on their machine.

## Settings

| Key | Type | Meaning |
| --- | --- | --- |
| `instanceUrl` | string | The Okteto instance to query for spaces. Must be `https`. |
| `domains` | array of strings | Hostnames whose requests (and their subdomains') get the `baggage` header. Defaults to the instance host. |
| `allowUserOverride` | boolean | Default `true`. When `false`, the two settings above are enforced and shown read-only in the popup. |

Invalid values are ignored — a policy `instanceUrl` of `http://…` or a domain
that is not a hostname is dropped rather than applied, so a typo can never
widen the injection scope. With `allowUserOverride` left at its default, the
policy only supplies the initial values and anything the user has already saved
wins.

The authoritative definition is [`schema.json`](../schema.json), which Chrome
uses to validate the policy.

## Deploying it

Combine with `ExtensionInstallForcelist` so the extension is installed and
configured with no user steps at all. `<extension-id>` is the Chrome Web Store
item ID.

**Chrome Enterprise / Google Admin console:** Devices → Chrome → Apps &
extensions → find the extension → *Policy for extensions*, and paste:

```json
{
  "instanceUrl": { "Value": "https://okteto.example.com" },
  "domains": { "Value": ["okteto.example.com", "apps.example.com"] },
  "allowUserOverride": { "Value": false }
}
```

**Linux** — `/etc/opt/chrome/policies/managed/okteto.json`:

```json
{
  "3rdparty": {
    "extensions": {
      "<extension-id>": {
        "instanceUrl": "https://okteto.example.com",
        "domains": ["okteto.example.com", "apps.example.com"],
        "allowUserOverride": false
      }
    }
  }
}
```

**macOS** — the same payload under the `com.google.Chrome` preference domain,
key `3rdparty` → `extensions` → `<extension-id>`, delivered as a
configuration profile.

**Windows** — registry key
`HKLM\SOFTWARE\Policies\Google\Chrome\3rdparty\extensions\<extension-id>\policy`,
with `instanceUrl` and `allowUserOverride` as values and `domains` as a JSON
array string.

## Verifying

1. Open `chrome://policy` and confirm the extension's policies are listed as
   *OK* — a red status means the value did not match `schema.json`.
2. Open the popup's settings: the fields are prefilled, and read-only with a
   "managed by your organization" note when `allowUserOverride` is `false`.
3. Enter a token and save. Chrome asks for access to the policy-provided
   domains only.
