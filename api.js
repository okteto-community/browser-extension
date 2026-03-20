// Pure logic shared between popup.js and tests.
// No DOM, no chrome.* references here.

const SPACES_QUERY = JSON.stringify({
  query: "query spaces {\n  spaces {\n    id\n    owner\n  }\n}",
  operationName: "spaces",
});

/**
 * Fetch the list of space IDs from an Okteto instance.
 * @param {string} instanceUrl  e.g. "https://okteto.example.com"
 * @param {string} token        Personal access token
 * @returns {Promise<string[]>} Array of space IDs
 */
async function fetchSpaces(instanceUrl, token) {
  const url = `${instanceUrl.replace(/\/$/, "")}/graphql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: SPACES_QUERY,
  });

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

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message);
  }

  return json.data.spaces.map((s) => s.id);
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
  module.exports = { fetchSpaces, buildBaggageValue, SPACES_QUERY };
}
