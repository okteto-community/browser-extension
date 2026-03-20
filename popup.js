// ── DOM refs ────────────────────────────────────────────────────────────────
const select        = document.getElementById("namespace-select");
const toggle        = document.getElementById("enabled-toggle");
const statusDot     = document.getElementById("status-dot");
const statusText    = document.getElementById("status-text");
const headerPreview = document.getElementById("header-preview");
const headerValue   = document.getElementById("header-value");
const fetchStatus   = document.getElementById("fetch-status");
const refreshBtn    = document.getElementById("refresh-btn");

const settingsToggleBtn = document.getElementById("settings-toggle");
const settingsPanel     = document.getElementById("settings-panel");
const instanceUrlInput  = document.getElementById("instance-url");
const apiTokenInput     = document.getElementById("api-token");
const saveSettingsBtn   = document.getElementById("save-settings");
const settingsError     = document.getElementById("settings-error");

// ── GraphQL (logic lives in api.js) ─────────────────────────────────────────
// fetchSpaces and buildBaggageValue are loaded via api.js (included before this
// script in the extension, and imported directly in tests).

// ── UI helpers ───────────────────────────────────────────────────────────────
function updateUI(enabled, namespace) {
  const active = enabled && !!namespace;
  statusDot.classList.toggle("active", active);
  statusText.textContent = active ? "Active" : "Inactive";
  headerPreview.hidden = !active;
  if (active) {
    headerValue.textContent = `baggage: okteto-divert=${namespace}`;
  }
}

function setFetchStatus(msg, isError = false) {
  if (!msg) {
    fetchStatus.hidden = true;
    return;
  }
  fetchStatus.hidden = false;
  fetchStatus.textContent = msg;
  fetchStatus.className = `fetch-status${isError ? " error" : ""}`;
}

function showSettingsError(msg) {
  settingsError.hidden = !msg;
  settingsError.textContent = msg || "";
}

function populateSelect(spaces, selectedId) {
  // Keep the placeholder option
  select.innerHTML = '<option value="">— select space —</option>';
  spaces.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    if (id === selectedId) opt.selected = true;
    select.appendChild(opt);
  });
  select.disabled = spaces.length === 0;
}

function setRefreshing(busy) {
  refreshBtn.disabled = busy;
  refreshBtn.classList.toggle("spinning", busy);
}

// ── Load spaces ──────────────────────────────────────────────────────────────
async function loadSpaces(instanceUrl, token, selectedNamespace) {
  setRefreshing(true);
  setFetchStatus("Loading spaces…");
  try {
    const spaces = await fetchSpaces(instanceUrl, token);
    populateSelect(spaces, selectedNamespace);
    // If the previously selected namespace no longer exists, clear it
    if (selectedNamespace && !spaces.includes(selectedNamespace)) {
      await chrome.storage.local.set({ namespace: "" });
      selectedNamespace = "";
    }
    setFetchStatus(spaces.length ? "" : "No spaces found.");
    return spaces;
  } catch (err) {
    setFetchStatus(`Failed to load spaces: ${err.message}`, true);
    populateSelect([], selectedNamespace);
    if (err.authError) {
      settingsPanel.hidden = false;
      settingsToggleBtn.classList.add("active");
      showSettingsError(err.message);
      apiTokenInput.focus();
    }
    return [];
  } finally {
    setRefreshing(false);
  }
}

// ── Apply header state ───────────────────────────────────────────────────────
async function applyState(enabled, namespace) {
  updateUI(enabled, namespace);
  try {
    await chrome.runtime.sendMessage({ action: "setState", enabled, namespace });
  } catch {
    // service worker may be sleeping on first load; storage already updated
  }
}

// ── Auto-save settings fields on input ───────────────────────────────────────
instanceUrlInput.addEventListener("input", () => {
  const value = instanceUrlInput.value.trim();
  if (value) chrome.storage.local.set({ instanceUrl: value });
});

apiTokenInput.addEventListener("input", () => {
  const value = apiTokenInput.value.trim();
  if (value) chrome.storage.local.set({ token: value });
});

// ── Settings panel ───────────────────────────────────────────────────────────
settingsToggleBtn.addEventListener("click", () => {
  const isHidden = settingsPanel.hidden;
  settingsPanel.hidden = !isHidden;
  settingsToggleBtn.classList.toggle("active", !isHidden ? false : true);
});

saveSettingsBtn.addEventListener("click", async () => {
  const instanceUrl = instanceUrlInput.value.trim();
  const token       = apiTokenInput.value.trim();

  if (!instanceUrl || !token) {
    showSettingsError("Both Instance URL and Token are required.");
    return;
  }

  showSettingsError("");
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = "Saving…";

  try {
    // Validate by doing a real fetch
    const spaces = await fetchSpaces(instanceUrl, token);
    await chrome.storage.local.set({ instanceUrl, token });

    const { namespace, enabled } = await chrome.storage.local.get(["namespace", "enabled"]);
    populateSelect(spaces, namespace || "");
    select.disabled = false;
    settingsPanel.hidden = true;
    settingsToggleBtn.classList.remove("active");
    setFetchStatus("");
    updateUI(!!enabled, namespace || "");
  } catch (err) {
    showSettingsError(`Could not connect: ${err.message}`);
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = "Save & Load Spaces";
  }
});

// ── Refresh button ───────────────────────────────────────────────────────────
refreshBtn.addEventListener("click", async () => {
  const { instanceUrl, token, namespace, enabled } =
    await chrome.storage.local.get(["instanceUrl", "token", "namespace", "enabled"]);

  if (!instanceUrl || !token) {
    settingsPanel.hidden = false;
    settingsToggleBtn.classList.add("active");
    return;
  }

  await loadSpaces(instanceUrl, token, namespace || "");
  updateUI(!!enabled, select.value);
});

// ── Namespace change ─────────────────────────────────────────────────────────
select.addEventListener("change", async () => {
  const namespace = select.value;
  const enabled   = toggle.checked;
  await chrome.storage.local.set({ namespace });
  await applyState(enabled, namespace);
});

// ── Toggle change ────────────────────────────────────────────────────────────
toggle.addEventListener("change", async () => {
  const enabled   = toggle.checked;
  const namespace = select.value;
  await chrome.storage.local.set({ enabled });
  await applyState(enabled, namespace);
});

// ── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  const { instanceUrl, token, namespace, enabled } =
    await chrome.storage.local.get(["instanceUrl", "token", "namespace", "enabled"]);

  const ns = namespace || "";
  const en = !!enabled;

  toggle.checked = en;

  if (!instanceUrl || !token) {
    // First-time setup: open settings panel automatically
    settingsPanel.hidden = false;
    settingsToggleBtn.classList.add("active");
    select.disabled = true;
    updateUI(false, "");
    return;
  }

  // Pre-fill settings fields (token masked by input type=password)
  instanceUrlInput.value = instanceUrl;
  apiTokenInput.value    = token;

  // Load spaces from server
  await loadSpaces(instanceUrl, token, ns);

  // Restore toggle state
  updateUI(en, select.value);
})();
