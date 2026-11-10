import { afterEach, describe, expect, it, vi } from "vitest";

import { API_URL, getHealth } from "./api";

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHealth", () => {
  it("returns the parsed body when the backend answers ok", async () => {
    const fetchMock = mockFetch(async () => Response.json({ status: "ok" }));

    await expect(getHealth()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/health`);
  });

  it("rejects a response with the wrong shape", async () => {
    mockFetch(async () => Response.json({ status: "maybe" }));

    await expect(getHealth()).rejects.toThrow(/unexpected response/i);
  });

  it("rejects a 2xx response that is not JSON", async () => {
    mockFetch(async () => new Response("<!DOCTYPE html>", { status: 200 }));

    await expect(getHealth()).rejects.toThrow("/health: response is not JSON");
  });

  it("rejects a non-2xx response", async () => {
    mockFetch(async () => new Response("boom", { status: 500 }));

    await expect(getHealth()).rejects.toThrow(/HTTP 500/);
  });

  it("passes network errors through", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(getHealth()).rejects.toThrow("Failed to fetch");
  });
});
