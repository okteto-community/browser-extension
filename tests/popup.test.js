/**
 * @jest-environment jsdom
 *
 * Tests for popup.js — settings, credential handling and the popup ⇄ service
 * worker state handshake. The real popup.html is used so the tests break if the
 * markup and the script drift apart.
 */

const fs = require("fs");
const path = require("path");

const HTML = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");

let api;
let storedData;
let managedData;
let sendMessage;
let permissionsRequest;
let permissionsRemove;
let popup;

function setupChrome() {
  storedData = {};
  managedData = {};
  sendMessage = jest.fn().mockResolvedValue({ ok: true });
  permissionsRequest = jest.fn().mockResolvedValue(true);
  permissionsRemove = jest.fn().mockResolvedValue(true);

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
        remove: jest.fn((keys) => {
          keys.forEach((k) => delete storedData[k]);
          return Promise.resolve();
        }),
      },
      managed: { get: jest.fn(() => Promise.resolve(managedData)) },
    },
    runtime: { sendMessage },
    permissions: { request: permissionsRequest, remove: permissionsRemove },
  };
}

function mockSpaces(spaces) {
  jest.spyOn(api, "fetchSpaces").mockResolvedValue(spaces);
}

function $(id) {
  return document.getElementById(id);
}

const SETTINGS = {
  instanceUrl: "https://okteto.example.com",
  token: "pat-123",
  domains: ["okteto.example.com"],
};

beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = HTML;
  setupChrome();
  // Required after resetModules so the spies below patch the same instance of
  // api.js that popup.js sees.
  api = require("../api");
  popup = require("../popup");
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── init ─────────────────────────────────────────────────────────────────────

describe("init", () => {
  test("opens settings and disables the space picker when unconfigured", async () => {
    await popup.init();

    expect($("settings-panel").hidden).toBe(false);
    expect($("namespace-select").disabled).toBe(true);
    expect($("status-text").textContent).toBe("Inactive");
  });

  test("never writes the saved token back into the DOM", async () => {
    storedData = { ...SETTINGS };
    mockSpaces(["movies-catalog"]);

    await popup.init();

    expect($("api-token").value).toBe("");
    expect($("token-hint").hidden).toBe(false);
    expect(document.body.innerHTML).not.toContain(SETTINGS.token);
    expect($("instance-url").value).toBe(SETTINGS.instanceUrl);
    expect($("domains").value).toBe("okteto.example.com");
  });

  test("restores the active state from storage", async () => {
    storedData = { ...SETTINGS, enabled: true, namespace: "movies-catalog" };
    mockSpaces(["movies-catalog", "movies-rentals"]);

    await popup.init();

    expect($("enabled-toggle").checked).toBe(true);
    expect($("namespace-select").value).toBe("movies-catalog");
    expect($("status-text").textContent).toBe("Active");
    expect($("header-value").textContent).toBe(
      "baggage: okteto-divert=movies-catalog"
    );
  });
});

// ── stale namespace ──────────────────────────────────────────────────────────

describe("loadSpaces", () => {
  test("stops injecting a namespace that no longer exists", async () => {
    storedData = { ...SETTINGS, enabled: true, namespace: "deleted-space" };
    mockSpaces(["movies-catalog"]);

    await popup.init();

    expect(sendMessage).toHaveBeenCalledWith({
      action: "setState",
      enabled: false,
      namespace: "",
      domains: SETTINGS.domains,
    });
    expect($("enabled-toggle").checked).toBe(false);
    expect($("status-text").textContent).toBe("Inactive");
  });

  test("reopens settings on an auth error", async () => {
    storedData = { ...SETTINGS };
    const err = new Error("Token expired or invalid.");
    err.authError = true;
    jest.spyOn(api, "fetchSpaces").mockRejectedValue(err);

    await popup.init();

    expect($("settings-panel").hidden).toBe(false);
    expect($("settings-error").textContent).toMatch(/Token expired/);
    expect($("fetch-status").textContent).toMatch(/Failed to load spaces/);
  });
});

// ── state handshake ──────────────────────────────────────────────────────────

describe("applyState", () => {
  test("shows Active only after the background confirms", async () => {
    storedData = { ...SETTINGS };
    mockSpaces(["movies-catalog"]);
    await popup.init();

    const applied = await popup.applyState(true, "movies-catalog", SETTINGS.domains);

    expect(applied).toBe(true);
    expect($("status-text").textContent).toBe("Active");
  });

  test.each([
    ["the background reports a failure", () => sendMessage.mockResolvedValue({ ok: false, error: "quota exceeded" })],
    ["the message channel fails",        () => sendMessage.mockRejectedValue(new Error("no receiver"))],
  ])("stays Inactive and surfaces the error when %s", async (_label, arrange) => {
    storedData = { ...SETTINGS };
    mockSpaces(["movies-catalog"]);
    await popup.init();
    arrange();

    const applied = await popup.applyState(true, "movies-catalog", SETTINGS.domains);

    expect(applied).toBe(false);
    expect($("status-text").textContent).toBe("Inactive");
    expect($("enabled-toggle").checked).toBe(false);
    expect($("fetch-status").textContent).toMatch(/Could not apply header settings/);
  });
});

// ── settings ─────────────────────────────────────────────────────────────────

describe("saving settings", () => {
  async function fillAndSave({ url, token, domains }) {
    await popup.init();
    $("instance-url").value = url;
    $("api-token").value = token ?? "";
    $("domains").value = domains ?? "";
    return popup.onSaveSettings();
  }

  test("requests host access only for the configured domains", async () => {
    mockSpaces(["movies-catalog"]);

    await fillAndSave({ url: SETTINGS.instanceUrl, token: "pat-123" });

    expect(permissionsRequest).toHaveBeenCalledWith({
      origins: [
        "*://okteto.example.com/*",
        "*://*.okteto.example.com/*",
        "https://okteto.example.com/*",
      ],
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ domains: ["okteto.example.com"] })
    );
  });

  test("also requests the instance origin when the domains exclude it", async () => {
    mockSpaces(["movies-catalog"]);

    await fillAndSave({
      url: SETTINGS.instanceUrl,
      token: "pat-123",
      domains: "apps.example.dev",
    });

    // Without the instance origin the GraphQL fetch would be blocked by CORS.
    expect(permissionsRequest).toHaveBeenCalledWith({
      origins: [
        "*://apps.example.dev/*",
        "*://*.apps.example.dev/*",
        "https://okteto.example.com/*",
      ],
    });
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ domains: ["apps.example.dev"] })
    );
  });

  test("does not save credentials when host access is denied", async () => {
    mockSpaces(["movies-catalog"]);
    permissionsRequest.mockResolvedValue(false);

    const saved = await fillAndSave({ url: SETTINGS.instanceUrl, token: "pat-123" });

    expect(saved).toBe(false);
    expect(storedData.token).toBeUndefined();
    expect($("settings-error").textContent).toMatch(/access to these domains/);
  });

  test("does not save credentials that fail validation", async () => {
    jest.spyOn(api, "fetchSpaces").mockRejectedValue(new Error("Server returned 500"));

    const saved = await fillAndSave({ url: SETTINGS.instanceUrl, token: "bad-token" });

    expect(saved).toBe(false);
    expect(storedData.token).toBeUndefined();
    expect(storedData.instanceUrl).toBeUndefined();
    expect($("settings-error").textContent).toMatch(/Could not connect/);
  });

  test("rejects a plain-http instance URL before any request is made", async () => {
    const fetchSpies = jest.spyOn(api, "fetchSpaces");

    const saved = await fillAndSave({ url: "http://okteto.example.com", token: "pat-123" });

    expect(saved).toBe(false);
    expect(fetchSpies).not.toHaveBeenCalled();
    expect(permissionsRequest).not.toHaveBeenCalled();
    expect($("settings-error").textContent).toMatch(/https/);
  });

  test("rejects an invalid domain list", async () => {
    const fetchSpies = jest.spyOn(api, "fetchSpaces");

    const saved = await fillAndSave({
      url: SETTINGS.instanceUrl,
      token: "pat-123",
      domains: "not_a_domain!",
    });

    expect(saved).toBe(false);
    expect(fetchSpies).not.toHaveBeenCalled();
    expect($("settings-error").textContent).toMatch(/not a valid domain/);
  });

  test("keeps the saved token when the field is left blank", async () => {
    storedData = { ...SETTINGS };
    mockSpaces(["movies-catalog"]);

    await popup.init();
    $("instance-url").value = "https://okteto.example.com";
    $("api-token").value = "";
    const saved = await popup.onSaveSettings();

    expect(saved).toBe(true);
    expect(api.fetchSpaces).toHaveBeenLastCalledWith(
      SETTINGS.instanceUrl,
      SETTINGS.token
    );
    expect(storedData.token).toBe(SETTINGS.token);
  });

  test("drops a selected space that the new instance does not have", async () => {
    storedData = { ...SETTINGS, enabled: true, namespace: "old-space" };
    mockSpaces(["movies-catalog"]);

    await popup.init();
    sendMessage.mockClear();
    $("instance-url").value = "https://other.example.com";
    $("api-token").value = "pat-456";
    $("domains").value = "other.example.com";
    await popup.onSaveSettings();

    expect(sendMessage).toHaveBeenCalledWith({
      action: "setState",
      enabled: true,
      namespace: "",
      domains: ["other.example.com"],
    });
  });
});

describe("clearing settings", () => {
  test("removes credentials, revokes host access and disables the rule", async () => {
    storedData = { ...SETTINGS, enabled: true, namespace: "movies-catalog" };
    mockSpaces(["movies-catalog"]);
    await popup.init();
    sendMessage.mockClear();

    await popup.onClearSettings();

    expect(sendMessage).toHaveBeenCalledWith({
      action: "setState",
      enabled: false,
      namespace: "",
      domains: [],
    });
    expect(storedData.token).toBeUndefined();
    expect(storedData.instanceUrl).toBeUndefined();
    expect(permissionsRemove).toHaveBeenCalledWith({
      origins: [
        "*://okteto.example.com/*",
        "*://*.okteto.example.com/*",
        "https://okteto.example.com/*",
      ],
    });
    expect($("instance-url").value).toBe("");
    expect($("api-token").value).toBe("");
    expect($("enabled-toggle").checked).toBe(false);
    expect($("settings-panel").hidden).toBe(false);
  });

  test("keeps enforced policy values in the fields", async () => {
    managedData = {
      instanceUrl: "https://okteto.corp.example",
      domains: ["apps.corp.example"],
      allowUserOverride: false,
    };
    storedData = { ...SETTINGS };
    mockSpaces(["movies-catalog"]);
    await popup.init();

    await popup.onClearSettings();

    expect($("instance-url").value).toBe("https://okteto.corp.example");
    expect($("domains").value).toBe("apps.corp.example");
  });
});

// ── managed (policy) configuration ──────────────────────────────────────────

describe("managed configuration", () => {
  test("prefills the settings but leaves them editable by default", async () => {
    managedData = {
      instanceUrl: "https://okteto.corp.example",
      domains: ["apps.corp.example", "api.corp.example"],
    };

    await popup.init();

    expect($("instance-url").value).toBe("https://okteto.corp.example");
    expect($("domains").value).toBe("apps.corp.example, api.corp.example");
    expect($("instance-url").readOnly).toBe(false);
    expect($("managed-hint").hidden).toBe(true);
  });

  test("locks the fields and ignores DOM edits when overrides are disallowed", async () => {
    managedData = {
      instanceUrl: "https://okteto.corp.example",
      domains: ["apps.corp.example"],
      allowUserOverride: false,
    };
    mockSpaces(["movies-catalog"]);

    await popup.init();
    expect($("instance-url").readOnly).toBe(true);
    expect($("domains").readOnly).toBe(true);
    expect($("managed-hint").hidden).toBe(false);

    // A read-only input is a UI affordance only; the policy still wins.
    $("instance-url").value = "https://evil.example.com";
    $("domains").value = "evil.example.com";
    $("api-token").value = "pat-123";
    const saved = await popup.onSaveSettings();

    expect(saved).toBe(true);
    expect(storedData.instanceUrl).toBe("https://okteto.corp.example");
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ domains: ["apps.corp.example"] })
    );
  });

  test("a locally saved instance wins when overrides are allowed", async () => {
    managedData = { instanceUrl: "https://okteto.corp.example" };
    storedData = { ...SETTINGS };
    mockSpaces(["movies-catalog"]);

    await popup.init();

    expect($("instance-url").value).toBe(SETTINGS.instanceUrl);
  });

  test("survives a profile with no managed storage at all", async () => {
    chrome.storage.managed.get.mockRejectedValue(new Error("not supported"));

    await expect(popup.readManagedConfig()).resolves.toEqual({});
    await expect(popup.init()).resolves.toBeUndefined();
  });
});
