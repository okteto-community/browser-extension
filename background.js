const RULE_ID = 1;

// Kubernetes namespace / Okteto space IDs. Also guarantees the value can never
// break out of the header (no CR, LF, comma or semicolon).
const NAMESPACE_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "media",
  "websocket",
  "other",
];

function buildRule(namespace, domains) {
  return {
    id: RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        {
          header: "baggage",
          operation: "set",
          value: `okteto-divert=${namespace}`,
        },
      ],
    },
    condition: {
      // Scope the header to the configured Okteto domains only. requestDomains
      // also matches their subdomains, and omitting it would broadcast the
      // namespace to every site the user visits.
      requestDomains: domains,
      resourceTypes: RESOURCE_TYPES,
    },
  };
}

/**
 * Install or remove the baggage rule. Remove + add happen in a single atomic
 * updateDynamicRules call so there is never a window with a stale rule.
 * @param {boolean} enabled
 * @param {string|null} namespace
 * @param {string[]} domains
 */
async function updateRule(enabled, namespace, domains = []) {
  const active = !!enabled && !!namespace && domains.length > 0;

  if (active && !NAMESPACE_RE.test(namespace)) {
    throw new Error(`Invalid space name: ${namespace}`);
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: active ? [buildRule(namespace, domains)] : [],
  });
}

async function applyStoredState() {
  const { enabled, namespace, domains } = await chrome.storage.local.get([
    "enabled",
    "namespace",
    "domains",
  ]);
  await updateRule(!!enabled, namespace || null, domains || []);
}

// Restore state on service worker startup
chrome.runtime.onInstalled.addListener(applyStoredState);
chrome.runtime.onStartup.addListener(applyStoredState);

// The rule only applies where host access was granted, so revoking a domain
// must also shrink the rule.
if (chrome.permissions?.onRemoved) {
  chrome.permissions.onRemoved.addListener(applyStoredState);
}

// Handle messages from popup. The background is the single writer of the
// {enabled, namespace, domains} state: the popup never writes it directly.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action !== "setState") return;

  const { enabled, namespace, domains } = message;
  Promise.resolve()
    .then(() => updateRule(enabled, namespace, domains || []))
    .then(() =>
      chrome.storage.local.set({
        enabled: !!enabled,
        namespace: namespace || "",
        domains: domains || [],
      })
    )
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true; // keep message channel open for async response
});
