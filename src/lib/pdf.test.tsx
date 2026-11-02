import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { renderMarkSheet, renderReceipt } from "./pdf";

const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-";
const base = { studentName: "A B", enrollmentNo: "E1", term: "Sem I", division: null, publishedAt: null, hash: "abc", verifyUrl: "https://x/verify/abc" };
const course = { code: "HIS101", title: "History", credits: 4, percent: 90, letter: "O", grade_point: 10 };

describe("PDF documents", () => {
  it("renders a UG mark sheet", async () => {
    expect(isPdf(await renderMarkSheet({ ...base, tier: "undergraduate", courses: [course], percentage: 90, sgpa: 10, cgpa: 10, creditsEarned: 4, creditsRegistered: 4 }))).toBe(true);
  });
  it("renders an HS report card", async () => {
    expect(isPdf(await renderMarkSheet({ ...base, tier: "higher_secondary", courses: [course], percentage: 90, division: "First Division", sgpa: null, cgpa: null, creditsEarned: null, creditsRegistered: null }))).toBe(true);
  });
  it("renders a receipt", async () => {
    expect(isPdf(await renderReceipt({ receiptNo: "DCC/2026-27/000001", studentName: "A B", enrollmentNo: "E1", amount: 1500, mode: "bank_transfer", reference: "R1", paidOn: "2026-11-02", code: "ABC", verifyUrl: "https://x", voided: false }))).toBe(true);
  });
});
