/**
 * Tests for background.js — the service worker that manages the
 * declarativeNetRequest rule for the baggage header.
 */

// ── Chrome API mock ───────────────────────────────────────────────────────────

let storedData = {};
let addedRules  = [];
let removedIds  = [];
const messageListeners  = [];
const installedListeners = [];
const startupListeners  = [];

global.chrome = {
  storage: {
    local: {
      get: jest.fn((keys) => {
        const result = {};
        keys.forEach((k) => { result[k] = storedData[k]; });
        return Promise.resolve(result);
      }),
      set: jest.fn((data) => {
        Object.assign(storedData, data);
        return Promise.resolve();
      }),
    },
  },
  declarativeNetRequest: {
    updateDynamicRules: jest.fn(({ addRules = [], removeRuleIds = [] }) => {
      removeRuleIds.forEach((id) => removedIds.push(id));
      addRules.forEach((r) => addedRules.push(r));
      return Promise.resolve();
    }),
  },
  runtime: {
    onInstalled: { addListener: (fn) => installedListeners.push(fn) },
    onStartup:   { addListener: (fn) => startupListeners.push(fn) },
    onMessage:   { addListener: (fn) => messageListeners.push(fn) },
  },
};

// Load the module after mocks are in place
require("../background");

// ── helpers ───────────────────────────────────────────────────────────────────

function resetRuleTracking() {
  addedRules.length  = 0;
  removedIds.length  = 0;
  chrome.declarativeNetRequest.updateDynamicRules.mockClear();
}

function fireInstalled() {
  return Promise.all(installedListeners.map((fn) => fn()));
}

function fireStartup() {
  return Promise.all(startupListeners.map((fn) => fn()));
}

function fireMessage(msg) {
  return new Promise((resolve) => {
    messageListeners.forEach((fn) => fn(msg, {}, resolve));
  });
}

beforeEach(() => {
  storedData = {};
  resetRuleTracking();
});

// ── onInstalled ───────────────────────────────────────────────────────────────

describe("onInstalled", () => {
  test("removes existing rule and adds baggage rule when enabled", async () => {
    storedData = { enabled: true, namespace: "movies-catalog" };

    await fireInstalled();

    expect(removedIds).toContain(1);
    expect(addedRules).toHaveLength(1);
    expect(addedRules[0].action.requestHeaders[0]).toMatchObject({
      header: "baggage",
      operation: "set",
      value: "okteto-divert=movies-catalog",
    });
  });

  test("removes rule only when disabled", async () => {
    storedData = { enabled: false, namespace: "movies-catalog" };

    await fireInstalled();

    expect(removedIds).toContain(1);
    expect(addedRules).toHaveLength(0);
  });

  test("removes rule only when namespace is missing", async () => {
    storedData = { enabled: true, namespace: "" };

    await fireInstalled();

    expect(removedIds).toContain(1);
    expect(addedRules).toHaveLength(0);
  });
});

// ── onStartup ────────────────────────────────────────────────────────────────

describe("onStartup", () => {
  test("restores baggage rule from storage", async () => {
    storedData = { enabled: true, namespace: "okteto-admin" };

    await fireStartup();

    expect(addedRules).toHaveLength(1);
    expect(addedRules[0].action.requestHeaders[0].value).toBe(
      "okteto-divert=okteto-admin"
    );
  });

  test("does not add rule when not enabled", async () => {
    storedData = { enabled: false, namespace: "okteto-admin" };

    await fireStartup();

    expect(addedRules).toHaveLength(0);
  });
});

// ── message handler ───────────────────────────────────────────────────────────

describe("setState message", () => {
  test("adds rule when enabled=true and namespace provided", async () => {
    const response = await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "full-environment",
    });

    expect(response).toEqual({ ok: true });
    expect(addedRules).toHaveLength(1);
    expect(addedRules[0].action.requestHeaders[0].value).toBe(
      "okteto-divert=full-environment"
    );
  });

  test("removes rule when enabled=false", async () => {
    const response = await fireMessage({
      action: "setState",
      enabled: false,
      namespace: "full-environment",
    });

    expect(response).toEqual({ ok: true });
    expect(addedRules).toHaveLength(0);
    expect(removedIds).toContain(1);
  });

  test("persists enabled and namespace to storage", async () => {
    await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "movies-rentals",
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, namespace: "movies-rentals" })
    );
  });

  test("rule covers all expected resource types", async () => {
    await fireMessage({ action: "setState", enabled: true, namespace: "x" });

    const rule = addedRules[0];
    expect(rule.condition.resourceTypes).toEqual(
      expect.arrayContaining([
        "main_frame",
        "xmlhttprequest",
        "websocket",
        "script",
        "stylesheet",
      ])
    );
  });

  test("rule uses correct priority and ID", async () => {
    await fireMessage({ action: "setState", enabled: true, namespace: "x" });

    expect(addedRules[0].id).toBe(1);
    expect(addedRules[0].priority).toBe(1);
  });

  test("ignores unknown action messages", async () => {
    // Should not throw or add rules
    const messageHandlerCount = messageListeners.length;
    expect(messageHandlerCount).toBeGreaterThan(0);

    // Simulate an unknown action — listeners return undefined (no sendResponse)
    messageListeners.forEach((fn) => fn({ action: "unknown" }, {}, jest.fn()));
    expect(addedRules).toHaveLength(0);
  });
});
