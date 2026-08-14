/**
 * Tests for background.js — the service worker that manages the
 * declarativeNetRequest rule for the baggage header.
 */

// ── Chrome API mock ───────────────────────────────────────────────────────────

let storedData = {};
let addedRules  = [];
let removedIds  = [];
let updateCalls = [];
let updateShouldFail = null;
let revokedDomains = [];
const messageListeners   = [];
const installedListeners = [];
const startupListeners   = [];
const permissionRemovedListeners = [];

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
    updateDynamicRules: jest.fn((options) => {
      updateCalls.push(options);
      if (updateShouldFail) return Promise.reject(new Error(updateShouldFail));
      const { addRules = [], removeRuleIds = [] } = options;
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
  permissions: {
    contains: jest.fn(({ origins }) =>
      Promise.resolve(!revokedDomains.some((d) => origins.includes(`*://${d}/*`)))
    ),
    onRemoved: { addListener: (fn) => permissionRemovedListeners.push(fn) },
  },
};

// Load the module after mocks are in place
require("../background");

const DOMAINS = ["okteto.example.com"];

// ── helpers ───────────────────────────────────────────────────────────────────

function fireInstalled() {
  return Promise.all(installedListeners.map((fn) => fn()));
}

function fireStartup() {
  return Promise.all(startupListeners.map((fn) => fn()));
}

function firePermissionRemoved() {
  return Promise.all(permissionRemovedListeners.map((fn) => fn()));
}

function fireMessage(msg) {
  return new Promise((resolve) => {
    const handled = messageListeners.map((fn) => fn(msg, {}, resolve));
    // No listener kept the channel open → nothing will call sendResponse.
    if (!handled.some((r) => r === true)) resolve(undefined);
  });
}

beforeEach(() => {
  storedData = {};
  addedRules = [];
  removedIds = [];
  updateCalls = [];
  updateShouldFail = null;
  revokedDomains = [];
  jest.clearAllMocks();
});

// ── onInstalled / onStartup ──────────────────────────────────────────────────

describe("state restoration", () => {
  test("onInstalled adds the baggage rule when enabled", async () => {
    storedData = { enabled: true, namespace: "movies-catalog", domains: DOMAINS };

    await fireInstalled();

    expect(removedIds).toContain(1);
    expect(addedRules).toHaveLength(1);
    expect(addedRules[0].action.requestHeaders[0]).toMatchObject({
      header: "baggage",
      operation: "set",
      value: "okteto-divert=movies-catalog",
    });
  });

  test.each([
    ["disabled",          { enabled: false, namespace: "movies-catalog", domains: DOMAINS }],
    ["namespace missing", { enabled: true,  namespace: "",               domains: DOMAINS }],
    ["domains missing",   { enabled: true,  namespace: "movies-catalog", domains: [] }],
    ["domains unset",     { enabled: true,  namespace: "movies-catalog" }],
  ])("removes the rule only when %s", async (_label, state) => {
    storedData = state;

    await fireInstalled();

    expect(removedIds).toContain(1);
    expect(addedRules).toHaveLength(0);
  });

  test("onStartup restores the rule from storage", async () => {
    storedData = { enabled: true, namespace: "okteto-admin", domains: DOMAINS };

    await fireStartup();

    expect(addedRules).toHaveLength(1);
    expect(addedRules[0].action.requestHeaders[0].value).toBe(
      "okteto-divert=okteto-admin"
    );
  });
});

// ── revoked host access ──────────────────────────────────────────────────────

describe("revoked host access", () => {
  test("drops revoked domains from the rule and from storage", async () => {
    storedData = {
      enabled: true,
      namespace: "movies-catalog",
      domains: ["okteto.example.com", "apps.example.com"],
    };
    revokedDomains = ["apps.example.com"];

    await firePermissionRemoved();

    expect(addedRules).toHaveLength(1);
    expect(addedRules[0].condition.requestDomains).toEqual(["okteto.example.com"]);
    expect(storedData.domains).toEqual(["okteto.example.com"]);
  });

  test("removes the rule when access to every domain is revoked", async () => {
    storedData = { enabled: true, namespace: "movies-catalog", domains: DOMAINS };
    revokedDomains = [...DOMAINS];

    await firePermissionRemoved();

    expect(removedIds).toContain(1);
    expect(addedRules).toHaveLength(0);
    expect(storedData.domains).toEqual([]);
  });
});

// ── injection scope ──────────────────────────────────────────────────────────

describe("injection scope", () => {
  test("rule is limited to the configured domains", async () => {
    await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "movies-catalog",
      domains: ["okteto.example.com", "apps.example.com"],
    });

    expect(addedRules[0].condition.requestDomains).toEqual([
      "okteto.example.com",
      "apps.example.com",
    ]);
  });

  test("rule never matches every host", async () => {
    await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "movies-catalog",
      domains: DOMAINS,
    });

    const { condition } = addedRules[0];
    expect(condition.requestDomains.length).toBeGreaterThan(0);
    expect(condition.urlFilter).toBeUndefined();
    expect(condition.initiatorDomains).toBeUndefined();
  });

  test("rule covers all expected resource types", async () => {
    await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "x",
      domains: DOMAINS,
    });

    expect(addedRules[0].condition.resourceTypes).toEqual([
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
    ]);
  });
});

// ── message handler ───────────────────────────────────────────────────────────

describe("setState message", () => {
  test("adds the rule and persists state", async () => {
    const response = await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "full-environment",
      domains: DOMAINS,
    });

    expect(response).toEqual({ ok: true });
    expect(addedRules).toHaveLength(1);
    expect(addedRules[0].action.requestHeaders[0].value).toBe(
      "okteto-divert=full-environment"
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      enabled: true,
      namespace: "full-environment",
      domains: DOMAINS,
    });
  });

  test("removes the rule when disabled", async () => {
    const response = await fireMessage({
      action: "setState",
      enabled: false,
      namespace: "full-environment",
      domains: DOMAINS,
    });

    expect(response).toEqual({ ok: true });
    expect(addedRules).toHaveLength(0);
    expect(removedIds).toContain(1);
  });

  test("removes and adds in a single atomic update", async () => {
    await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "x",
      domains: DOMAINS,
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].removeRuleIds).toEqual([1]);
    expect(updateCalls[0].addRules).toHaveLength(1);
  });

  test("rule uses correct priority and ID", async () => {
    await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "x",
      domains: DOMAINS,
    });

    expect(addedRules[0].id).toBe(1);
    expect(addedRules[0].priority).toBe(1);
  });

  test("rejects a namespace that could forge header content", async () => {
    const response = await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "evil\r\nX-Injected: 1",
      domains: DOMAINS,
    });

    expect(response).toMatchObject({ ok: false });
    expect(response.error).toMatch(/Invalid space name/);
    expect(addedRules).toHaveLength(0);
  });

  test("reports failures instead of persisting a state that was not applied", async () => {
    updateShouldFail = "MAX_NUMBER_OF_DYNAMIC_RULES exceeded";

    const response = await fireMessage({
      action: "setState",
      enabled: true,
      namespace: "x",
      domains: DOMAINS,
    });

    expect(response).toEqual({
      ok: false,
      error: "MAX_NUMBER_OF_DYNAMIC_RULES exceeded",
    });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test("ignores unknown messages without holding the channel open", async () => {
    const sendResponse = jest.fn();

    const returned = messageListeners.map((fn) =>
      fn({ action: "unknown" }, {}, sendResponse)
    );

    expect(returned.every((r) => r !== true)).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();
    expect(chrome.declarativeNetRequest.updateDynamicRules).not.toHaveBeenCalled();
  });
});
