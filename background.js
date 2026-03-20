const RULE_ID = 1;

async function updateRule(enabled, namespace) {
  // Always remove existing rule first
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
  });

  if (enabled && namespace) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
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
            urlFilter: "|https*",
            resourceTypes: [
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
            ],
          },
        },
      ],
    });
  }
}

// Restore state on service worker startup
chrome.runtime.onInstalled.addListener(async () => {
  const { enabled, namespace } = await chrome.storage.local.get([
    "enabled",
    "namespace",
  ]);
  await updateRule(!!enabled, namespace || null);
});

chrome.runtime.onStartup.addListener(async () => {
  const { enabled, namespace } = await chrome.storage.local.get([
    "enabled",
    "namespace",
  ]);
  await updateRule(!!enabled, namespace || null);
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "setState") {
    const { enabled, namespace } = message;
    chrome.storage.local
      .set({ enabled, namespace })
      .then(() => updateRule(enabled, namespace))
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep message channel open for async response
  }
});
