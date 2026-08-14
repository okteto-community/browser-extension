// Popup logic. The background service worker owns the {enabled, namespace,
// domains} state: everything here goes through a setState message and only
// touches the UI once the background confirms the rule was applied.

// api.js is loaded as a plain script before this one in the extension, and
// required directly in tests.
const api =
  typeof module !== "undefined"
    ? require("./api")
    : {
        fetchSpaces,
        normalizeInstanceUrl,
        defaultDomainsFor,
        parseDomains,
        originPatternsFor,
        permissionOriginsFor,
      };

// ── DOM refs ────────────────────────────────────────────────────────────────
const ui = {};

function bindDom() {
  ui.select        = document.getElementById("namespace-select");
  ui.toggle        = document.getElementById("enabled-toggle");
  ui.statusDot     = document.getElementById("status-dot");
  ui.statusText    = document.getElementById("status-text");
  ui.headerPreview = document.getElementById("header-preview");
  ui.headerValue   = document.getElementById("header-value");
  ui.fetchStatus   = document.getElementById("fetch-status");
  ui.refreshBtn    = document.getElementById("refresh-btn");

  ui.settingsToggleBtn = document.getElementById("settings-toggle");
  ui.settingsPanel     = document.getElementById("settings-panel");
  ui.instanceUrlInput  = document.getElementById("instance-url");
  ui.apiTokenInput     = document.getElementById("api-token");
  ui.tokenHint         = document.getElementById("token-hint");
  ui.domainsInput      = document.getElementById("domains");
  ui.saveSettingsBtn   = document.getElementById("save-settings");
  ui.clearSettingsBtn  = document.getElementById("clear-settings");
  ui.settingsError     = document.getElementById("settings-error");
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function updateUI(enabled, namespace) {
  const active = enabled && !!namespace;
  ui.statusDot.classList.toggle("active", active);
  ui.statusText.textContent = active ? "Active" : "Inactive";
  ui.headerPreview.hidden = !active;
  if (active) {
    ui.headerValue.textContent = `baggage: okteto-divert=${namespace}`;
  }
}

function setFetchStatus(msg, isError = false) {
  if (!msg) {
    ui.fetchStatus.hidden = true;
    ui.fetchStatus.textContent = "";
    return;
  }
  ui.fetchStatus.hidden = false;
  ui.fetchStatus.textContent = msg;
  ui.fetchStatus.className = `fetch-status${isError ? " error" : ""}`;
}

function showSettingsError(msg) {
  ui.settingsError.hidden = !msg;
  ui.settingsError.textContent = msg || "";
}

function openSettings(open = true) {
  ui.settingsPanel.hidden = !open;
  ui.settingsToggleBtn.classList.toggle("active", open);
}

function populateSelect(spaces, selectedId) {
  // Keep the placeholder option
  ui.select.innerHTML = '<option value="">— select space —</option>';
  spaces.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    if (id === selectedId) opt.selected = true;
    ui.select.appendChild(opt);
  });
  ui.select.disabled = spaces.length === 0;
}

function setRefreshing(busy) {
  ui.refreshBtn.disabled = busy;
  ui.refreshBtn.classList.toggle("spinning", busy);
}

// ── State ────────────────────────────────────────────────────────────────────
async function readState() {
  const state = await chrome.storage.local.get([
    "instanceUrl",
    "token",
    "namespace",
    "enabled",
    "domains",
  ]);
  return {
    instanceUrl: state.instanceUrl || "",
    token: state.token || "",
    namespace: state.namespace || "",
    enabled: !!state.enabled,
    domains: state.domains || [],
  };
}

/**
 * Ask the background to apply a state and reflect the *result* in the UI.
 * A failure never leaves the popup claiming the header is being injected.
 * @returns {Promise<boolean>} whether the rule was applied
 */
async function applyState(enabled, namespace, domains) {
  let res;
  try {
    res = await chrome.runtime.sendMessage({
      action: "setState",
      enabled,
      namespace,
      domains,
    });
  } catch (err) {
    res = { ok: false, error: err.message };
  }

  if (!res?.ok) {
    updateUI(false, "");
    if (ui.toggle) ui.toggle.checked = false;
    setFetchStatus(
      `Could not apply header settings: ${res?.error || "background worker unavailable"}`,
      true
    );
    return false;
  }

  updateUI(enabled, namespace);
  return true;
}

// ── Load spaces ──────────────────────────────────────────────────────────────
async function loadSpaces(instanceUrl, token, state) {
  setRefreshing(true);
  setFetchStatus("Loading spaces…");
  try {
    const spaces = await api.fetchSpaces(instanceUrl, token);
    let selected = state.namespace;
    // If the previously selected namespace no longer exists, stop injecting it.
    if (selected && !spaces.includes(selected)) {
      selected = "";
      await applyState(false, "", state.domains);
      if (ui.toggle) ui.toggle.checked = false;
    }
    populateSelect(spaces, selected);
    setFetchStatus(spaces.length ? "" : "No spaces found.");
    return spaces;
  } catch (err) {
    setFetchStatus(`Failed to load spaces: ${err.message}`, true);
    populateSelect([], "");
    if (err.authError) {
      openSettings(true);
      showSettingsError(err.message);
      ui.apiTokenInput.focus();
    }
    return [];
  } finally {
    setRefreshing(false);
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────
async function onSaveSettings() {
  const stored = await readState();

  let instanceUrl;
  let domains;
  try {
    instanceUrl = api.normalizeInstanceUrl(ui.instanceUrlInput.value);
    const raw = ui.domainsInput.value.trim();
    domains = raw
      ? api.parseDomains(raw)
      : api.defaultDomainsFor(instanceUrl);
  } catch (err) {
    showSettingsError(err.message);
    return false;
  }

  // An empty token field means "keep the saved one" — the saved token is never
  // written back into the DOM.
  const token = ui.apiTokenInput.value.trim() || stored.token;
  if (!token) {
    showSettingsError("A Personal Access Token is required.");
    return false;
  }
  if (!domains.length) {
    showSettingsError("At least one domain is required.");
    return false;
  }

  showSettingsError("");
  ui.saveSettingsBtn.disabled = true;
  ui.saveSettingsBtn.textContent = "Saving…";

  try {
    // Host access must be granted before the rule can modify anything or the
    // instance can be queried, and the request has to happen while the user
    // gesture is still live.
    const granted = await chrome.permissions.request({
      origins: api.permissionOriginsFor(instanceUrl, domains),
    });
    if (!granted) {
      showSettingsError(
        "Chrome access to these domains is required to inject the header."
      );
      return false;
    }

    // Validate the credentials before storing them.
    const spaces = await api.fetchSpaces(instanceUrl, token);
    await chrome.storage.local.set({ instanceUrl, token });

    const namespace = spaces.includes(stored.namespace) ? stored.namespace : "";
    const applied = await applyState(stored.enabled, namespace, domains);

    populateSelect(spaces, namespace);
    ui.apiTokenInput.value = "";
    ui.tokenHint.hidden = false;
    ui.domainsInput.value = domains.join(", ");
    if (applied) {
      openSettings(false);
      setFetchStatus(spaces.length ? "" : "No spaces found.");
    }
    return applied;
  } catch (err) {
    showSettingsError(`Could not connect: ${err.message}`);
    return false;
  } finally {
    ui.saveSettingsBtn.disabled = false;
    ui.saveSettingsBtn.textContent = "Save & Load Spaces";
  }
}

async function onClearSettings() {
  const { instanceUrl, domains } = await readState();
  await applyState(false, "", []);
  await chrome.storage.local.remove(["instanceUrl", "token"]);
  const origins = api.permissionOriginsFor(instanceUrl, domains);
  if (origins.length) {
    try {
      await chrome.permissions.remove({ origins });
    } catch {
      // Permission may already be gone; the rule is off either way.
    }
  }

  ui.instanceUrlInput.value = "";
  ui.apiTokenInput.value = "";
  ui.domainsInput.value = "";
  ui.tokenHint.hidden = true;
  ui.toggle.checked = false;
  populateSelect([], "");
  ui.select.disabled = true;
  setFetchStatus("");
  showSettingsError("");
  openSettings(true);
}

async function onRefresh() {
  const state = await readState();
  if (!state.instanceUrl || !state.token) {
    openSettings(true);
    return;
  }
  await loadSpaces(state.instanceUrl, state.token, state);
  updateUI(state.enabled, ui.select.value);
}

async function onSelectChange() {
  const { enabled, domains } = await readState();
  await applyState(enabled, ui.select.value, domains);
}

async function onToggleChange() {
  const { domains } = await readState();
  if (ui.toggle.checked && !domains.length) {
    openSettings(true);
    showSettingsError("Configure the domains to inject into first.");
    ui.toggle.checked = false;
    return;
  }
  await applyState(ui.toggle.checked, ui.select.value, domains);
}

function wireEvents() {
  ui.settingsToggleBtn.addEventListener("click", () =>
    openSettings(ui.settingsPanel.hidden)
  );
  ui.saveSettingsBtn.addEventListener("click", onSaveSettings);
  ui.clearSettingsBtn.addEventListener("click", onClearSettings);
  ui.refreshBtn.addEventListener("click", onRefresh);
  ui.select.addEventListener("change", onSelectChange);
  ui.toggle.addEventListener("change", onToggleChange);
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  bindDom();
  wireEvents();

  const state = await readState();
  ui.toggle.checked = state.enabled;
  ui.instanceUrlInput.value = state.instanceUrl;
  ui.domainsInput.value = state.domains.join(", ");
  ui.tokenHint.hidden = !state.token;

  if (!state.instanceUrl || !state.token) {
    // First-time setup: open settings panel automatically
    openSettings(true);
    ui.select.disabled = true;
    updateUI(false, "");
    return;
  }

  await loadSpaces(state.instanceUrl, state.token, state);
  updateUI(state.enabled, ui.select.value);
}

if (typeof module !== "undefined") {
  module.exports = { init, applyState, loadSpaces, onSaveSettings, onClearSettings };
} else {
  init();
}
