import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  assessEngagementStream,
  createProject,
  decideFinding,
  getSummary,
  listProjects,
  getProjectOverview,
  listExpiring,
  listOpenRequests,
  messageFromBody,
  updateDocumentTags,
  uploadDocuments,
} from "./api";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

const project = {
  id: "p1",
  name: "Demo",
  template_id: "vvs",
  delete_after: null,
  delete_overdue: false,
  created_at: "2026-11-16T10:00:00Z",
};

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
    await expect(decideFinding("f1", { status: "found", comment: "ok" })).rejects.toBeInstanceOf(ApiError);
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

describe("retention date", () => {
  it("sends delete_after only when a date is given", async () => {
    const fn = mockFetch(async () => Response.json(project, { status: 201 }));
    await createProject("Demo", "vvs", "2027-05-01");
    expect(JSON.parse(fn.mock.calls[0][1]?.body as string)).toEqual({
      name: "Demo",
      template_id: "vvs",
      delete_after: "2027-05-01",
    });
  });
});


describe("simulated sign-in token", () => {
  it("sends the stored token, and sends no name with a decision", async () => {
    const store: Record<string, string> = { "readiness.session": "tok123" };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => void (store[k] = v),
        removeItem: (k: string) => void delete store[k],
      },
    });
    const fn = mockFetch(async () => new Response("{}", { status: 422 }));
    await expect(decideFinding("f1", { status: "found", comment: "ok" })).rejects.toBeInstanceOf(ApiError);
    const init = fn.mock.calls[0][1];
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tok123");
    expect(JSON.parse(init?.body as string)).toEqual({ status: "found", comment: "ok" });
  });

  it("sends no Authorization header when nobody is signed in", async () => {
    const fn = mockFetch(async () => Response.json([project]));
    await listProjects();
    expect(new Headers(fn.mock.calls[0][1]?.headers).get("Authorization")).toBeNull();
  });
});

describe("assessEngagementStream", () => {
  const finding = {
    id: "f1",
    engagement_id: "e1",
    requirement_code: "VVS-01",
    requirement_title: "F-skattsedel",
    mandatory: true,
    model_status: "found",
    ai_status: "found",
    human_status: null,
    evidence: [],
    valid_until: null,
    notes: "",
    provider: "scripted",
    provider_label: "Simulated",
    model: "fixture",
    prompt_version: "assess-v2",
    latest_request: null,
    created_at: "2026-11-16T10:00:00Z",
  };
  const lines = (...events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";

  it("reports progress and returns the findings", async () => {
    mockFetch(async () =>
      new Response(
        lines(
          { type: "start", total: 2 },
          { type: "working", index: 1, total: 2, code: "VVS-01", title: "F-skattsedel" },
          { type: "working", index: 2, total: 2, code: "VVS-02", title: "Registration" },
          { type: "done", findings: [finding] },
        ),
      ),
    );
    const seen: unknown[] = [];
    const result = await assessEngagementStream("e1", (p) => seen.push(p));
    expect(seen).toEqual([
      { index: 0, total: 2, title: "" },
      { index: 1, total: 2, title: "F-skattsedel" },
      { index: 2, total: 2, title: "Registration" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("handles a line split across chunks", async () => {
    const text = lines({ type: "start", total: 1 }, { type: "done", findings: [] });
    const half = Math.floor(text.length / 2);
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text.slice(0, half)));
        controller.enqueue(encoder.encode(text.slice(half)));
        controller.close();
      },
    });
    mockFetch(async () => new Response(stream));
    await expect(assessEngagementStream("e1", () => {})).resolves.toEqual([]);
  });

  it("throws the backend's message for an error event", async () => {
    mockFetch(async () =>
      new Response(
        lines({ type: "start", total: 1 }, { type: "error", status: 503, message: "Ollama is not running." }),
      ),
    );
    await expect(assessEngagementStream("e1", () => {})).rejects.toMatchObject({
      status: 503,
      message: "Ollama is not running.",
    });
  });

  it("throws for plain JSON errors before the stream starts", async () => {
    mockFetch(async () =>
      Response.json({ message: "Upload at least one document before assessing." }, { status: 400 }),
    );
    await expect(assessEngagementStream("e1", () => {})).rejects.toThrow(/Upload at least one/);
  });

  it("says nothing was saved if the stream ends without a result", async () => {
    mockFetch(async () => new Response(lines({ type: "start", total: 1 })));
    await expect(assessEngagementStream("e1", () => {})).rejects.toThrow(/Nothing was saved/);
  });

  it("rejects an event with the wrong shape", async () => {
    mockFetch(async () => new Response(lines({ type: "working", index: "one" })));
    await expect(assessEngagementStream("e1", () => {})).rejects.toThrow(/unexpected format/);
  });
});

describe("recording a decision", () => {
  const body = (fn: ReturnType<typeof mockFetch>) => JSON.parse(fn.mock.calls[0][1]?.body as string);

  it("sends the reason and request_upload only when chosen, and no name", async () => {
    const fn = mockFetch(async () => new Response("{}", { status: 422 }));
    await expect(
      decideFinding("f1", {
        status: "expired",
        comment: "",
        reason: "expired",
        requestUpload: { sendEmail: true },
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(body(fn)).toEqual({
      status: "expired",
      comment: "",
      reason: "expired",
      request_upload: { send_email: true },
    });
  });

  it("can give a reason without asking for a new upload", async () => {
    const fn = mockFetch(async () => new Response("{}", { status: 422 }));
    await expect(
      decideFinding("f1", { status: "partial", comment: "", reason: "incomplete" }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(body(fn)).toEqual({ status: "partial", comment: "", reason: "incomplete" });
  });

  it("can confirm with no reason and no comment", async () => {
    const fn = mockFetch(async () => new Response("{}", { status: 422 }));
    await expect(decideFinding("f1", { status: "found", comment: "" })).rejects.toBeInstanceOf(ApiError);
    expect(body(fn)).toEqual({ status: "found", comment: "" });
  });

  it("shows the backend's message when the rule is broken", async () => {
    mockFetch(async () =>
      Response.json(
        { detail: "Choose a reason when you change the result or ask for a new upload." },
        { status: 422 },
      ),
    );
    await expect(decideFinding("f1", { status: "partial", comment: "" })).rejects.toThrow(/Choose a reason/);
  });
});

describe("expiring documents", () => {
  const item = {
    finding_id: "f1",
    project_id: "p1",
    project_name: "Hamnen 4",
    engagement_id: "e1",
    subcontractor_name: "Exempelrör AB",
    requirement_code: "VVS-03",
    requirement_title: "Liability insurance",
    valid_until: "2026-11-26",
    days_left: 9,
    tier: "urgent",
    status: "found",
    new_upload_requested: false,
    reminder: {
      kind: "before_expiry",
      to: "k@exempel.example",
      subject: "Reminder: Liability insurance runs out on 2026-11-26",
      body: "Hello",
    },
  };
  it("parses the list, including an item with no reminder", async () => {
    mockFetch(async () => Response.json([item, { ...item, finding_id: "f2", reminder: null }]));
    const got = await listExpiring();
    expect(got).toHaveLength(2);
    expect(got[1].reminder).toBeNull();
  });
  it("rejects an unknown tier", async () => {
    mockFetch(async () => Response.json([{ ...item, tier: "critical" }]));
    await expect(listExpiring()).rejects.toThrow(/unexpected format/);
  });
});

describe("open requests", () => {
  it("parses the dashboard list", async () => {
    const item = {
      request_id: "r1",
      project_id: "p1",
      project_name: "Hamnen 4",
      engagement_id: "e1",
      subcontractor_name: "Exempelrör AB",
      requirement_code: "VVS-03",
      requirement_title: "Liability insurance",
      reason_label: "The document has expired",
      email_recorded: true,
      requested_by: "Test PM (demo)",
      created_at: "2026-11-16T10:00:00",
    };
    mockFetch(async () => Response.json([item]));
    await expect(listOpenRequests()).resolves.toEqual([item]);
  });

  it("rejects a list with the wrong shape", async () => {
    mockFetch(async () => Response.json([{ request_id: 1 }]));
    await expect(listOpenRequests()).rejects.toThrow(/unexpected format/);
  });
});

describe("summary", () => {
  const summary = {
    title: "Documentation summary: Exempelrör AB on Hamnen 4",
    intro: "Based on 5 uploaded documents and 7 requirements in the VVS template.",
    groups: [
      {
        status: "found",
        label: "Documents show evidence",
        items: [{ code: "VVS-01", title: "F-skattsedel", reviewed_by_person: false, note: "" }],
      },
    ],
    not_reviewed_count: 7,
    not_reviewed_text: "7 requirements not yet reviewed by a person.",
    assessed_by: "Simulated (fixture)",
    disclaimer: "This summary describes what the uploaded documents show. It is not an approval. A person must review and decide.",
  };

  it("parses a summary", async () => {
    mockFetch(async () => Response.json(summary));
    await expect(getSummary("e1")).resolves.toEqual(summary);
  });

  it("rejects an unknown status", async () => {
    const bad = { ...summary, groups: [{ ...summary.groups[0], status: "approved" }] };
    mockFetch(async () => Response.json(bad));
    await expect(getSummary("e1")).rejects.toThrow(/unexpected format/);
  });
});

describe("project overview", () => {
  const eng = {
    engagement_id: "e1",
    subcontractor_name: "Exempelrör AB",
    document_count: 2,
    glance: "awaiting_decision",
    counts: { found: 3, partial: 0, missing: 1, unclear: 0, expired: 0, not_assessed: 3 },
    awaiting_decision: 4,
    open_requests: 0,
    requirements: [
      { code: "VVS-01", title: "Tax", mandatory: true, status: "found", decided: false, decided_by: null, open_request: false },
      { code: "VVS-04", title: "Env", mandatory: false, status: null, decided: false, decided_by: null, open_request: false },
    ],
  };
  it("parses the overview, including a requirement that is not assessed yet", async () => {
    const fn = mockFetch(async () => Response.json({ project_id: "p1", engagements: [eng] }));
    const got = await getProjectOverview("p1");
    expect(fn.mock.calls[0][0]).toContain("/projects/p1/overview");
    expect(got.engagements[0].requirements[1].status).toBeNull();
  });
  it("rejects an unknown glance state", async () => {
    mockFetch(async () => Response.json({ project_id: "p1", engagements: [{ ...eng, glance: "approved" }] }));
    await expect(getProjectOverview("p1")).rejects.toThrow(/unexpected format/);
  });
});

describe("document tags", () => {
  const doc = {
    id: "d1",
    filename: "f-skatt.pdf",
    page_count: 1,
    redaction_count: 0,
    warnings: [],
    requirement_codes: ["VVS-01"],
    created_at: "2026-11-18T10:00:00Z",
  };
  const upload = { files: [{ filename: "f-skatt.pdf", status: "accepted", document_id: "d1", warnings: [] }] };

  it("sends the tags with an upload only when one file has a choice", async () => {
    const fn = mockFetch(async () => Response.json(upload, { status: 201 }));
    const file = new File(["x"], "f-skatt.pdf", { type: "application/pdf" });
    await uploadDocuments("e1", [file], [["VVS-01"]]);
    const form = (fn.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.get("tags")).toBe(JSON.stringify([["VVS-01"]]));
    await uploadDocuments("e1", [file], [[]]);
    expect(((fn.mock.calls[1][1] as RequestInit).body as FormData).has("tags")).toBe(false);
    await uploadDocuments("e1", [file]);
    expect(((fn.mock.calls[2][1] as RequestInit).body as FormData).has("tags")).toBe(false);
  });

  it("changes the tags of a document", async () => {
    const fn = mockFetch(async () => Response.json(doc));
    const got = await updateDocumentTags("d1", ["VVS-01"]);
    expect(got.requirement_codes).toEqual(["VVS-01"]);
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ requirement_codes: ["VVS-01"] });
  });

  it("rejects a document without its tags field", async () => {
    const old: Partial<typeof doc> = { ...doc };
    delete old.requirement_codes;
    mockFetch(async () => Response.json(old));
    await expect(updateDocumentTags("d1", [])).rejects.toThrow(/unexpected format/);
  });
});
