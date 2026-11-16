import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  createProject,
  decideFinding,
  listProjects,
  messageFromBody,
  uploadDocuments,
} from "./api";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

const project = { id: "p1", name: "Demo", template_id: "vvs", created_at: "2026-11-16T10:00:00Z" };

describe("messageFromBody", () => {
  it("prefers the backend's friendly message", () => {
    expect(messageFromBody({ message: "Upload at least one document." }, 400)).toBe(
      "Upload at least one document.",
    );
  });
  it("uses detail strings, and a plain sentence for validation lists", () => {
    expect(messageFromBody({ detail: "That template was not found." }, 404)).toBe(
      "That template was not found.",
    );
    expect(messageFromBody({ detail: [{ loc: ["body"] }] }, 422)).toMatch(/check the form/i);
  });
  it("never shows raw server text for a 500", () => {
    expect(messageFromBody("Traceback ...", 500)).toBe(
      "Something went wrong on our side. Nothing was saved.",
    );
  });
});

describe("request helpers", () => {
  it("parses a valid list", async () => {
    mockFetch(async () => Response.json([project]));
    await expect(listProjects()).resolves.toEqual([project]);
  });

  it("sends JSON with snake_case keys", async () => {
    const fn = mockFetch(async () => Response.json(project, { status: 201 }));
    await createProject("Demo", "vvs");
    const [, init] = fn.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ name: "Demo", template_id: "vvs" });
  });

  it("turns a network failure into a plain-language error", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(listProjects()).rejects.toThrow(/Cannot reach the backend/);
  });

  it("rejects a response with the wrong shape", async () => {
    mockFetch(async () => Response.json([{ id: 1 }]));
    await expect(listProjects()).rejects.toThrow(/unexpected format/);
  });

  it("throws ApiError with the backend message on 404", async () => {
    mockFetch(async () => Response.json({ detail: "That project was not found." }, { status: 404 }));
    await expect(listProjects()).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "That project was not found.",
    });
  });

  it("rejects a bad human status before sending is possible (types), and sends PATCH", async () => {
    const fn = mockFetch(async () => new Response("{}", { status: 422 }));
    await expect(decideFinding("f1", "found", "ok", "PM")).rejects.toBeInstanceOf(ApiError);
    expect(fn.mock.calls[0][1]?.method).toBe("PATCH");
  });
});

describe("uploadDocuments", () => {
  const file = new File(["%PDF-1.4"], "a.pdf", { type: "application/pdf" });

  it("returns per-file reasons from a 400 instead of throwing", async () => {
    const body = {
      files: [
        {
          filename: "a.pdf",
          status: "rejected",
          code: "encrypted",
          message: "a.pdf: The PDF is encrypted.",
          hint: "Remove the password protection and upload the copy again.",
          warnings: [],
        },
      ],
      message: "None of the files could be used. See the details below.",
    };
    mockFetch(async () => Response.json(body, { status: 400 }));
    const result = await uploadDocuments("e1", [file]);
    expect(result.files[0].status).toBe("rejected");
    expect(result.message).toMatch(/None of the files/);
  });

  it("sends the files as multipart form data under the name 'files'", async () => {
    const fn = mockFetch(async () =>
      Response.json({ files: [], message: null }, { status: 201 }),
    );
    await uploadDocuments("e1", [file]);
    const body = fn.mock.calls[0][1]?.body as FormData;
    expect(body.getAll("files")).toHaveLength(1);
  });

  it("still throws for a server failure", async () => {
    mockFetch(async () => Response.json({ message: "Something went wrong on our side." }, { status: 500 }));
    await expect(uploadDocuments("e1", [file])).rejects.toThrow(/went wrong/);
  });
});
