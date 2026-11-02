import { describe, expect, it } from "vitest";
import { detectTier, parseImportRow } from "./schemas";

const base = { enrollment_no: "E1", full_name: "A B", guardian_name: "G", guardian_phone: "+91 98765-43210" };

describe("detectTier", () => {
  it("honours an explicit alias", () => expect(detectTier({ tier: "PG" })).toBe("postgraduate"));
  it("rejects an unknown tier", () => expect(detectTier({ tier: "phd" })).toBeNull());
  it("infers from HS fields", () => expect(detectTier({ stream: "Arts" })).toBe("higher_secondary"));
  it("infers from UG fields", () => expect(detectTier({ degree: "BA" })).toBe("undergraduate"));
});

describe("parseImportRow", () => {
  it("accepts an HS row and normalizes the phone", () => {
    const r = parseImportRow({ ...base, "Class Level": "XI", stream: "Science", combination_subjects: "PCM; Bio" }, 2);
    expect(r.ok).toBe(true);
    if (r.ok && r.value.tier === "higher_secondary") {
      expect(r.value.guardian_phone).toBe("9876543210");
      expect(r.value.combination_subjects).toEqual(["PCM", "Bio"]);
    }
  });
  it("rejects UG semester 7", () => {
    const r = parseImportRow({ ...base, tier: "UG", degree: "BA", major_subject: "History", semester: "7" }, 3);
    expect(r.ok).toBe(false);
  });
  it("accepts UG semester 6 and rejects PG semester 5", () => {
    expect(parseImportRow({ ...base, tier: "UG", degree: "BA", major_subject: "History", semester: "6" }, 4).ok).toBe(true);
    expect(parseImportRow({ ...base, tier: "PG", department_code: "HIS", specialization: "Modern", previous_degree: "BA", semester: "5" }, 5).ok).toBe(false);
  });
  it("reports a bad guardian mobile", () => {
    const r = parseImportRow({ ...base, guardian_phone: "12345", stream: "Arts", class_level: "XI" }, 6);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain("mobile");
  });
});
