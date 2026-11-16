import { describe, expect, it } from "vitest";

import {
  ADDRESS_RULE,
  LIMITS,
  checkFiles,
  fieldErrors,
  isBlocking,
  isFictionalAddress,
  projectSchema,
  signInSchema,
  subcontractorSchema,
} from "./forms";

const MB = 1024 * 1024;
const pdf = (name: string, size = 1000) => ({ name, size, type: "application/pdf" });

describe("isFictionalAddress (same examples as the backend tests)", () => {
  it.each([
    "kontakt@exempelror.example",
    "a@b.test",
    "a@x.invalid",
    "a@host.localhost",
    "a@example.com",
    "a@sub.example.org",
    "A@EXAMPLE.NET",
  ])("accepts %s", (a) => expect(isFictionalAddress(a)).toBe(true));

  it.each(["person@gmail.com", "a@company.se", "a@notexample.com", "plainaddress", "a@b@c.example", ""])(
    "rejects %s",
    (a) => expect(isFictionalAddress(a)).toBe(false),
  );
});

describe("subcontractorSchema", () => {
  it("accepts a name with no email", () => {
    expect(subcontractorSchema.safeParse({ name: " Exempelrör AB ", contactEmail: "" }).success).toBe(true);
  });
  it("trims the name and requires it", () => {
    expect(subcontractorSchema.parse({ name: "  A  ", contactEmail: "" }).name).toBe("A");
    const r = subcontractorSchema.safeParse({ name: "   ", contactEmail: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).name).toBe("Enter the subcontractor's name.");
  });
  it("explains a real-looking address with the fictional-address rule", () => {
    const r = subcontractorSchema.safeParse({ name: "A", contactEmail: "pm@gmail.com" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).contactEmail).toBe(ADDRESS_RULE);
  });
  it("asks for a valid shape before the fictional rule", () => {
    const r = subcontractorSchema.safeParse({ name: "A", contactEmail: "not an email" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).contactEmail).toMatch(/email address/);
  });
});

describe("projectSchema", () => {
  const schema = projectSchema("2026-11-16");
  const ok = { name: "Harbour 4", templateId: "vvs", deleteAfter: "2027-05-16" };
  it("accepts today and later, and an empty date", () => {
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, deleteAfter: "2026-11-16" }).success).toBe(true);
    expect(schema.safeParse({ ...ok, deleteAfter: "" }).success).toBe(true);
  });
  it("rejects a past date with the backend's wording", () => {
    const r = schema.safeParse({ ...ok, deleteAfter: "2026-11-15" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).deleteAfter).toBe("The deletion date must be today or later.");
  });
  it("requires a name and a template", () => {
    const r = schema.safeParse({ name: " ", templateId: "", deleteAfter: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrors(r.error);
      expect(e.name).toBe("Enter a project name.");
      expect(e.templateId).toBe("Choose a template.");
    }
  });
  it("rejects names over the limit", () => {
    const r = schema.safeParse({ ...ok, name: "x".repeat(LIMITS.nameMax + 1) });
    expect(r.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("needs a user", () => {
    expect(signInSchema.safeParse({ userId: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ userId: "u1" }).success).toBe(true);
  });
});

describe("checkFiles", () => {
  const problems = (picked: Parameters<typeof checkFiles>[0], uploaded: Parameters<typeof checkFiles>[1] = []) =>
    checkFiles(picked, uploaded).map((c) => c.problem);

  it("accepts ordinary PDFs", () => {
    expect(problems([pdf("a.pdf"), pdf("b.pdf", 2000)])).toEqual([null, null]);
  });
  it("accepts a PDF by extension when the browser gives no type", () => {
    expect(problems([{ name: "A.PDF", size: 10 }])).toEqual([null]);
  });
  it("blocks other types, empty files and files over the size limit", () => {
    expect(problems([{ name: "n.txt", size: 10, type: "text/plain" }])).toEqual(["not_pdf"]);
    expect(problems([pdf("a.pdf", 0)])).toEqual(["empty"]);
    expect(problems([pdf("a.pdf", LIMITS.maxFileMb * MB + 1)])).toEqual(["too_big"]);
    expect(problems([pdf("a.pdf", LIMITS.maxFileMb * MB)])).toEqual([null]);
  });
  it("flags the second copy of the same file in one batch", () => {
    expect(problems([pdf("a.pdf"), pdf("a.pdf")])).toEqual([null, "duplicate_in_batch"]);
    expect(problems([pdf("a.pdf", 1), pdf("a.pdf", 2)])).toEqual([null, null]);
  });
  it("only warns about a file already uploaded (name and size)", () => {
    const c = checkFiles([pdf("a.pdf", 1000)], [{ name: "a.pdf", size: 1000 }]);
    expect(c[0].problem).toBe("already_uploaded");
    expect(isBlocking(c[0].problem)).toBe(false);
    expect(problems([pdf("a.pdf", 999)], [{ name: "a.pdf", size: 1000 }])).toEqual([null]);
  });
  it("matches by name alone when the size of the earlier upload is unknown", () => {
    expect(problems([pdf("a.pdf")], [{ name: "a.pdf" }])).toEqual(["already_uploaded"]);
  });
  it("blocks files beyond the per-upload limit", () => {
    const many = Array.from({ length: LIMITS.maxFiles + 2 }, (_, i) => pdf(`f${i}.pdf`, 100 + i));
    const result = problems(many);
    expect(result.slice(0, LIMITS.maxFiles).every((p) => p === null)).toBe(true);
    expect(result.slice(LIMITS.maxFiles)).toEqual(["too_many", "too_many"]);
  });
  it("isBlocking is true for every problem except a possible duplicate", () => {
    expect(isBlocking(null)).toBe(false);
    for (const p of ["not_pdf", "too_big", "empty", "duplicate_in_batch", "too_many"] as const) {
      expect(isBlocking(p)).toBe(true);
    }
  });
});
