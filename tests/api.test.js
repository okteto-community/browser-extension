/**
 * Tests for api.js — the pure GraphQL/header logic.
 * `fetch` is mocked; no browser or chrome.* APIs needed.
 */

const {
  fetchSpaces,
  buildBaggageValue,
  normalizeInstanceUrl,
  defaultDomainsFor,
  parseDomains,
  originPatternsFor,
  permissionOriginsFor,
  mergeManagedConfig,
  SPACES_QUERY,
} = require("../api");

// ── helpers ──────────────────────────────────────────────────────────────────

const originalFetch = global.fetch;

function mockFetch(status, body) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  // mockFetch assigns rather than spies, so it has to be undone explicitly.
  global.fetch = originalFetch;
});

// ── fetchSpaces ───────────────────────────────────────────────────────────────

describe("fetchSpaces", () => {
  const INSTANCE = "https://okteto.example.com";
  const TOKEN    = "my-secret-token";

  test("returns space IDs on a successful response", async () => {
    mockFetch(200, {
      data: {
        spaces: [
          { id: "full-environment", owner: "okteto-admin" },
          { id: "movies-catalog",   owner: "okteto-admin" },
          { id: "movies-rentals",   owner: "okteto-admin" },
          { id: "okteto-admin",     owner: "okteto-admin" },
        ],
      },
    });

    const spaces = await fetchSpaces(INSTANCE, TOKEN);
    expect(spaces).toEqual([
      "full-environment",
      "movies-catalog",
      "movies-rentals",
      "okteto-admin",
    ]);
  });

  test("posts to /graphql with correct headers and body", async () => {
    mockFetch(200, { data: { spaces: [] } });

    await fetchSpaces(INSTANCE, TOKEN);

    expect(fetch).toHaveBeenCalledWith(
      "https://okteto.example.com/graphql",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        }),
        body: SPACES_QUERY,
      })
    );
  });

  test("strips trailing slash from instance URL", async () => {
    mockFetch(200, { data: { spaces: [] } });

    await fetchSpaces("https://okteto.example.com/", TOKEN);

    expect(fetch).toHaveBeenCalledWith(
      "https://okteto.example.com/graphql",
      expect.anything()
    );
  });

  test("throws authError on 401", async () => {
    mockFetch(401, {});

    await expect(fetchSpaces(INSTANCE, TOKEN)).rejects.toMatchObject({
      authError: true,
      message: expect.stringContaining("Token expired or invalid"),
    });
  });

  test("throws authError on 403", async () => {
    mockFetch(403, {});

    await expect(fetchSpaces(INSTANCE, TOKEN)).rejects.toMatchObject({
      authError: true,
    });
  });

  test("throws generic error on other non-2xx status", async () => {
    mockFetch(500, {});

    const err = await fetchSpaces(INSTANCE, TOKEN).catch((e) => e);
    expect(err.authError).toBeFalsy();
    expect(err.message).toMatch(/500/);
  });

  test("throws a helpful error when the response is not JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
    });

    await expect(fetchSpaces(INSTANCE, TOKEN)).rejects.toThrow(/did not return JSON/);
  });

  test.each([
    ["data is null", { data: null }],
    ["spaces is null", { data: { spaces: null } }],
    ["body is empty", {}],
  ])("throws instead of crashing when %s", async (_label, body) => {
    mockFetch(200, body);

    await expect(fetchSpaces(INSTANCE, TOKEN)).rejects.toThrow(/no spaces returned/);
  });

  test("skips entries without an id", async () => {
    mockFetch(200, { data: { spaces: [{ id: "a" }, {}, { id: "" }, null] } });

    await expect(fetchSpaces(INSTANCE, TOKEN)).resolves.toEqual(["a"]);
  });

  test("surfaces network failures with the instance URL", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchSpaces(INSTANCE, TOKEN)).rejects.toThrow(
      /Could not reach https:\/\/okteto.example.com/
    );
  });

  test("times out instead of hanging forever", async () => {
    global.fetch = jest.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        })
    );

    await expect(
      fetchSpaces(INSTANCE, TOKEN, { timeoutMs: 10 })
    ).rejects.toThrow(/No response from https:\/\/okteto.example.com/);
  });

  test("refuses to send the token over plain http", async () => {
    mockFetch(200, { data: { spaces: [] } });

    await expect(fetchSpaces("http://okteto.example.com", TOKEN)).rejects.toThrow(
      /must use https/
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("throws when GraphQL response contains errors array", async () => {
    mockFetch(200, {
      errors: [{ message: "Unauthorized" }],
    });

    await expect(fetchSpaces(INSTANCE, TOKEN)).rejects.toThrow("Unauthorized");
  });

  test("returns empty array when spaces list is empty", async () => {
    mockFetch(200, { data: { spaces: [] } });

    const spaces = await fetchSpaces(INSTANCE, TOKEN);
    expect(spaces).toEqual([]);
  });
});

// ── buildBaggageValue ─────────────────────────────────────────────────────────

describe("buildBaggageValue", () => {
  test("formats the baggage header correctly", () => {
    expect(buildBaggageValue("okteto-admin")).toBe("okteto-divert=okteto-admin");
    expect(buildBaggageValue("movies-catalog")).toBe("okteto-divert=movies-catalog");
  });
});

// ── URL and domain handling ──────────────────────────────────────────────────

describe("normalizeInstanceUrl", () => {
  test.each([
    ["https://okteto.example.com",   "https://okteto.example.com"],
    ["https://okteto.example.com/",  "https://okteto.example.com"],
    ["  https://okteto.example.com/ ", "https://okteto.example.com"],
    ["http://localhost:8080",        "http://localhost:8080"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeInstanceUrl(input)).toBe(expected);
  });

  test.each([
    ["", /required/],
    ["okteto.example.com", /full URL/],
    ["http://okteto.example.com", /https/],
    ["ftp://okteto.example.com", /https/],
    ["javascript:alert(1)", /https/],
  ])("rejects %s", (input, message) => {
    expect(() => normalizeInstanceUrl(input)).toThrow(message);
  });
});

describe("parseDomains", () => {
  test("accepts comma, space and newline separated hosts", () => {
    expect(parseDomains("a.example.com, b.example.com\nc.example.com")).toEqual([
      "a.example.com",
      "b.example.com",
      "c.example.com",
    ]);
  });

  test("normalizes URLs, wildcards and case, and deduplicates", () => {
    expect(
      parseDomains("https://Okteto.Example.com/path, *.okteto.example.com")
    ).toEqual(["okteto.example.com"]);
  });

  test("returns an empty list for empty input", () => {
    expect(parseDomains("  ")).toEqual([]);
  });

  test.each(["not_a_domain!", "*", "exam_ple.com,,", "-example.com"])(
    "rejects %s",
    (input) => {
      // A bad entry must never be silently dropped: dropping it could widen or
      // silently narrow the injection scope.
      expect(() => parseDomains(input)).toThrow(/not a valid domain/);
    }
  );
});

describe("defaultDomainsFor", () => {
  test("uses the instance hostname", () => {
    expect(defaultDomainsFor("https://okteto.example.com/")).toEqual([
      "okteto.example.com",
    ]);
  });

  test("returns nothing for an unparseable URL", () => {
    expect(defaultDomainsFor("nonsense")).toEqual([]);
  });
});

describe("originPatternsFor", () => {
  test("covers each domain and its subdomains", () => {
    expect(originPatternsFor(["example.com"])).toEqual([
      "*://example.com/*",
      "*://*.example.com/*",
    ]);
  });

  test("never produces an all-hosts pattern", () => {
    const patterns = originPatternsFor(["a.com", "b.com"]);
    expect(patterns).toHaveLength(4);
    expect(patterns).not.toContain("<all_urls>");
    expect(patterns.every((p) => p.includes(".com/"))).toBe(true);
  });
});

describe("permissionOriginsFor", () => {
  test("adds the instance origin to the configured domains", () => {
    expect(
      permissionOriginsFor("https://okteto.example.com", ["apps.example.dev"])
    ).toEqual([
      "*://apps.example.dev/*",
      "*://*.apps.example.dev/*",
      "https://okteto.example.com/*",
    ]);
  });

  test("does not duplicate an already covered origin", () => {
    const origins = permissionOriginsFor("https://okteto.example.com", [
      "okteto.example.com",
    ]);
    expect(origins.filter((o) => o === "https://okteto.example.com/*")).toHaveLength(1);
  });
});

// ── mergeManagedConfig ───────────────────────────────────────────────────────

describe("mergeManagedConfig", () => {
  const POLICY = {
    instanceUrl: "https://okteto.corp.example",
    domains: ["apps.corp.example"],
  };

  test("returns the local state untouched when there is no policy", () => {
    expect(
      mergeManagedConfig({}, { instanceUrl: "https://a.example", domains: ["a.example"] })
    ).toEqual({
      instanceUrl: "https://a.example",
      domains: ["a.example"],
      locked: { instanceUrl: false, domains: false },
    });
  });

  test("seeds an unconfigured profile from the policy", () => {
    expect(mergeManagedConfig(POLICY, {})).toEqual({
      instanceUrl: "https://okteto.corp.example",
      domains: ["apps.corp.example"],
      locked: { instanceUrl: false, domains: false },
    });
  });

  test("lets the user's saved settings win by default", () => {
    const merged = mergeManagedConfig(POLICY, {
      instanceUrl: "https://mine.example",
      domains: ["mine.example"],
    });
    expect(merged.instanceUrl).toBe("https://mine.example");
    expect(merged.domains).toEqual(["mine.example"]);
  });

  test("enforces and locks the policy when overrides are disallowed", () => {
    expect(
      mergeManagedConfig(
        { ...POLICY, allowUserOverride: false },
        { instanceUrl: "https://mine.example", domains: ["mine.example"] }
      )
    ).toEqual({
      instanceUrl: "https://okteto.corp.example",
      domains: ["apps.corp.example"],
      locked: { instanceUrl: true, domains: true },
    });
  });

  test("ignores policy values that would not pass user validation", () => {
    const merged = mergeManagedConfig(
      {
        instanceUrl: "http://okteto.corp.example",
        domains: ["not_a_domain!"],
        allowUserOverride: false,
      },
      { instanceUrl: "https://mine.example", domains: ["mine.example"] }
    );
    expect(merged.instanceUrl).toBe("https://mine.example");
    expect(merged.domains).toEqual(["mine.example"]);
    expect(merged.locked).toEqual({ instanceUrl: false, domains: false });
  });

  test("normalizes policy values the same way the popup does", () => {
    const merged = mergeManagedConfig(
      { instanceUrl: "https://okteto.corp.example/", domains: ["https://Apps.Corp.Example/x"] },
      {}
    );
    expect(merged.instanceUrl).toBe("https://okteto.corp.example");
    expect(merged.domains).toEqual(["apps.corp.example"]);
  });
});

// ── SPACES_QUERY ──────────────────────────────────────────────────────────────

describe("SPACES_QUERY", () => {
  test("is valid JSON", () => {
    expect(() => JSON.parse(SPACES_QUERY)).not.toThrow();
  });

  test("contains the spaces operation", () => {
    const parsed = JSON.parse(SPACES_QUERY);
    expect(parsed.operationName).toBe("spaces");
    expect(parsed.query).toContain("spaces");
    expect(parsed.query).toContain("id");
    expect(parsed.query).toContain("owner");
  });
});
