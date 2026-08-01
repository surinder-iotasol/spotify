import { describe, it, expect } from "vitest";
import {
  parsePaginationParams,
  apiPaginatedResponse,
  type PaginationParams,
  type PaginatedResponse,
} from "./pagination";

/* ------------------------------------------------------------------ */
/*  parsePaginationParams                                              */
/* ------------------------------------------------------------------ */

describe("parsePaginationParams", () => {
  it("returns default page=1 and limit=20 when no query params are provided", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api");
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("parses explicit page and limit values", () => {
    const url = new URL("http://localhost/api?page=3&limit=50");
    const result: PaginationParams = parsePaginationParams(url);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(100);
  });

  it("clamps limit exceeding 100 to 100", () => {
    const url = "http://localhost/api?limit=500";
    const result: PaginationParams = parsePaginationParams(url);
    expect(result.limit).toBe(100);
  });

  it("clamps limit values below 1 up to 1", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api?limit=0");
    expect(result.limit).toBe(1);
  });

  it("clamps page values below 1 up to 1", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api?page=0");
    expect(result.page).toBe(1);
  });

  it("returns offset computed as (page - 1) * limit", () => {
    const url = new URL("http://localhost/api?page=5&limit=25");
    const result: PaginationParams = parsePaginationParams(url);
    expect(result.offset).toBe(100);
  });

  it("tolerates non-numeric page and limit by falling back to defaults", () => {
    const result: PaginationParams = parsePaginationParams(
      "http://localhost/api?page=abc&limit=xyz",
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("tolerates negative page and limit values", () => {
    const result: PaginationParams = parsePaginationParams(
      "http://localhost/api?page=-5&limit=-10",
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(1);
  });

  it("handles page with default limit", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api?page=2");
    expect(result.page).toBe(2);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(20);
  });

  it("handles limit with default page", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api?limit=10");
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(0);
  });

  it("clamps limit to 100 exactly when limit is 100", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api?limit=100");
    expect(result.limit).toBe(100);
  });

  it("clamps limit to 100 when limit exceeds 100 by 1", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api?limit=101");
    expect(result.limit).toBe(100);
  });

  it("works with URL string input without URL object", () => {
    const result: PaginationParams = parsePaginationParams(
      "http://example.com/items?page=1&limit=10",
    );
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("accepts URL object input", () => {
    const url = new URL("http://example.com/items?page=4&limit=30");
    const result: PaginationParams = parsePaginationParams(url);
    expect(result.page).toBe(4);
    expect(result.limit).toBe(30);
    expect(result.offset).toBe(90);
  });

  it("returns offset of 0 when page=1 and limit=20 (defaults)", () => {
    const result: PaginationParams = parsePaginationParams("http://localhost/api");
    expect(result.offset).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  apiPaginatedResponse                                               */
/* ------------------------------------------------------------------ */

describe("apiPaginatedResponse", () => {
  it("returns data, pagination, and meta fields", () => {
    const res: PaginatedResponse<{ id: string }> = apiPaginatedResponse(
      [{ id: "a" }],
      1,
      1,
      20,
    );
    expect(res.data).toEqual([{ id: "a" }]);
    expect(res.pagination).toBeDefined();
    expect(res.meta).toBeDefined();
    expect(res.meta.requestId).toBeDefined();
    expect(res.meta.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("calculates totalPage correctly", () => {
    const res: PaginatedResponse<number> = apiPaginatedResponse([], 100, 1, 20);
    expect(res.pagination.totalPages).toBe(5);
  });

  it("calculates totalPage rounding up for non-exact divisions", () => {
    const res: PaginatedResponse<number> = apiPaginatedResponse([], 101, 1, 20);
    expect(res.pagination.totalPages).toBe(6);
  });

  it("sets hasNextPage to true when page < totalPages", () => {
    const res: PaginatedResponse<unknown> = apiPaginatedResponse([], 100, 1, 20);
    expect(res.pagination.hasNextPage).toBe(true);
  });

  it("sets hasNextPage to false when page === totalPages", () => {
    const res: PaginatedResponse<unknown> = apiPaginatedResponse([], 100, 5, 20);
    expect(res.pagination.hasNextPage).toBe(false);
  });

  it("sets hasNextPage to false when page > totalPages (edge case)", () => {
    const res: PaginatedResponse<unknown> = apiPaginatedResponse([], 100, 10, 20);
    expect(res.pagination.hasNextPage).toBe(false);
  });

  it("sets hasPreviousPage to false when page === 1", () => {
    const res: PaginatedResponse<unknown> = apiPaginatedResponse([], 100, 1, 20);
    expect(res.pagination.hasPreviousPage).toBe(false);
  });

  it("sets hasPreviousPage to true when page > 1", () => {
    const res: PaginatedResponse<unknown> = apiPaginatedResponse([], 100, 3, 20);
    expect(res.pagination.hasPreviousPage).toBe(true);
  });

  it("echoes total, page, and limit into pagination object", () => {
    const res: PaginatedResponse<string> = apiPaginatedResponse(["a", "b"], 50, 2, 25);
    expect(res.pagination.total).toBe(50);
    expect(res.pagination.page).toBe(2);
    expect(res.pagination.limit).toBe(25);
  });

  it("handles empty data array with total=0", () => {
    const res: PaginatedResponse<never> = apiPaginatedResponse([], 0, 1, 20);
    expect(res.data).toEqual([]);
    expect(res.pagination.total).toBe(0);
    expect(res.pagination.totalPages).toBe(1);
  });

  it("handles single item with limit=20", () => {
    const res: PaginatedResponse<{ id: string }> = apiPaginatedResponse(
      [{ id: "single" }],
      1,
      1,
      20,
    );
    expect(res.data).toHaveLength(1);
    expect(res.pagination.total).toBe(1);
    expect(res.pagination.totalPages).toBe(1);
    expect(res.pagination.hasNextPage).toBe(false);
    expect(res.pagination.hasPreviousPage).toBe(false);
  });

  it("handles exactly 100 total items with limit=100", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const res: PaginatedResponse<number> = apiPaginatedResponse(items, 100, 1, 100);
    expect(res.pagination.totalPages).toBe(1);
    expect(res.pagination.hasNextPage).toBe(false);
  });

  it("handles 101 items with limit=100 correctly", () => {
    const items = Array.from({ length: 101 }, (_, i) => i);
    const res: PaginatedResponse<number> = apiPaginatedResponse(items, 101, 1, 100);
    expect(res.pagination.totalPages).toBe(2);
    expect(res.pagination.hasNextPage).toBe(true);
  });

  it("returns a fresh meta object each call", () => {
    const res1 = apiPaginatedResponse([], 0, 1, 20);
    const res2 = apiPaginatedResponse([], 0, 1, 20);
    expect(res1.meta).not.toBe(res2.meta);
    expect(res1.meta.requestId).not.toBe(res2.meta.requestId);
    expect(typeof res1.meta.timestamp).toBe("string");
    expect(typeof res2.meta.timestamp).toBe("string");
  });

  it("generates requestId only when crypto is available (no crash without it)", () => {
    const res: PaginatedResponse<string> = apiPaginatedResponse(["test"], 1, 1, 20);
    expect(res.meta.requestId).toBeDefined();
    expect(typeof res.meta.requestId).toBe("string");
    expect(res.meta.requestId.length).toBeGreaterThan(0);
  });

  it("generates timestamp as ISO-8601 string", () => {
    const res = apiPaginatedResponse([], 0, 1, 20);
    expect(res.meta.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });
});

/* ------------------------------------------------------------------ */
/*  Integration: query parameter parsing on dummy collection route     */
/* ------------------------------------------------------------------ */

describe("integration: parsePaginationParams on dummy collection route", () => {
  it("simulates Next.js route handler context with searchParams URL", () => {
    // Simulate what a Next.js route handler does:
    // const url = new URL(request.url);
    // const { page, limit, offset } = parsePaginationParams(url);
    const requestUrl = "http://localhost/api/v1/tracks?page=2&limit=10";
    const url = new URL(requestUrl);
    const params = parsePaginationParams(url);

    expect(params.page).toBe(2);
    expect(params.limit).toBe(10);
    expect(params.offset).toBe(10);

    const response = apiPaginatedResponse(
      Array.from({ length: 10 }, (_, i) => ({ id: `track-${i + 10}` })),
      42,
      params.page,
      params.limit,
    );

    expect(response.data).toHaveLength(10);
    expect(response.pagination.total).toBe(42);
    expect(response.pagination.totalPages).toBe(5);
    expect(response.pagination.hasNextPage).toBe(true);
    expect(response.pagination.hasPreviousPage).toBe(true);
  });

  it("applies default pagination when no query params present on a route", () => {
    const requestUrl = "http://localhost/api/v1/playlists";
    const url = new URL(requestUrl);
    const params = parsePaginationParams(url);

    expect(params.page).toBe(1);
    expect(params.limit).toBe(20);
    expect(params.offset).toBe(0);
  });

  it("clamps limit when route receives an excessive limit value", () => {
    const requestUrl = "http://localhost/api/v1/tracks?limit=1000";
    const url = new URL(requestUrl);
    const params = parsePaginationParams(url);

    expect(params.limit).toBe(100);
    expect(params.offset).toBe(0);
  });
});
