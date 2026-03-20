/**
 * Tests for api.js — the pure GraphQL/header logic.
 * `fetch` is mocked; no browser or chrome.* APIs needed.
 */

const { fetchSpaces, buildBaggageValue, SPACES_QUERY } = require("../api");

// ── helpers ──────────────────────────────────────────────────────────────────

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
