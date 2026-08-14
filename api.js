// Pure logic shared between popup.js and tests.
// No DOM, no chrome.* references here.

const SPACES_QUERY = JSON.stringify({
  query: "query spaces {\n  spaces {\n    id\n    owner\n  }\n}",
  operationName: "spaces",
});

const FETCH_TIMEOUT_MS = 15000;

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Validate an Okteto instance URL and return it without a trailing slash.
 * Only https is accepted, except for loopback hosts used in local development.
 * @param {string} input
 * @returns {string} normalized origin-qualified URL, e.g. "https://okteto.example.com"
 * @throws {Error} when the URL is unparseable or uses an insecure scheme
 */
function normalizeInstanceUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Instance URL is required.");

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Instance URL must be a full URL, e.g. https://okteto.example.com");
  }

  const isLoopback = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new Error("Instance URL must use https (http is only allowed for localhost).");
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}

/**
 * Hostnames the header should be injected into, derived from the instance URL.
 * declarativeNetRequest's requestDomains matches subdomains too, so the instance
 * host also covers the development environments hosted under it.
 * @param {string} instanceUrl
 * @returns {string[]}
 */
function defaultDomainsFor(instanceUrl) {
  try {
    return [new URL(instanceUrl).hostname.toLowerCase()];
  } catch {
    return [];
  }
}

/**
 * Parse a user-supplied domain allowlist (comma or newline separated).
 * Accepts bare hostnames and full URLs; rejects wildcards and anything that is
 * not a hostname, so a typo can never widen the injection scope.
 * @param {string} input
 * @returns {string[]} deduplicated, lowercased hostnames
 * @throws {Error} on an entry that is not a valid hostname
 */
function parseDomains(input) {
  const entries = String(input || "")
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const domains = [];
  for (const entry of entries) {
    let host = entry;
    if (host.includes("://")) {
      try {
        host = new URL(host).hostname.toLowerCase();
      } catch {
        throw new Error(`"${entry}" is not a valid domain.`);
      }
    }
    host = host.replace(/^\*\./, "").replace(/\/.*$/, "");
    if (!HOSTNAME_RE.test(host)) {
      throw new Error(`"${entry}" is not a valid domain.`);
    }
    if (!domains.includes(host)) domains.push(host);
  }
  return domains;
}

/**
 * Match patterns to request host permissions for, covering each domain and its
 * subdomains.
 * @param {string[]} domains
 * @returns {string[]}
 */
function originPatternsFor(domains) {
  return domains.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]);
}

/**
 * Fetch the list of space IDs from an Okteto instance.
 * @param {string} instanceUrl  e.g. "https://okteto.example.com"
 * @param {string} token        Personal access token
 * @param {{timeoutMs?: number, signal?: AbortSignal}} [options]
 * @returns {Promise<string[]>} Array of space IDs
 */
async function fetchSpaces(instanceUrl, token, options = {}) {
  const base = normalizeInstanceUrl(instanceUrl);
  const url = `${base}/graphql`;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: SPACES_QUERY,
      signal: options.signal ?? controller?.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`No response from ${base} after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw new Error(`Could not reach ${base}: ${err.message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    const err = new Error(
      "Token expired or invalid. Please update your Personal Access Token."
    );
    err.authError = true;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Server returned ${res.status} ${res.statusText}`);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(
      `${base} did not return JSON. Check that the Instance URL points at an Okteto instance.`
    );
  }

  if (json?.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  const spaces = json?.data?.spaces;
  if (!Array.isArray(spaces)) {
    throw new Error("Unexpected response from the Okteto API: no spaces returned.");
  }

  return spaces.map((s) => s?.id).filter((id) => typeof id === "string" && id !== "");
}

/**
 * Build the baggage header value for a given namespace.
 * @param {string} namespace
 * @returns {string}
 */
function buildBaggageValue(namespace) {
  return `okteto-divert=${namespace}`;
}

// Export for Node/Jest; no-op in browser (popup.js uses the functions directly)
if (typeof module !== "undefined") {
  module.exports = {
    fetchSpaces,
    buildBaggageValue,
    normalizeInstanceUrl,
    defaultDomainsFor,
    parseDomains,
    originPatternsFor,
    SPACES_QUERY,
    FETCH_TIMEOUT_MS,
  };
}
