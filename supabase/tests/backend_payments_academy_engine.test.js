import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../migrations/202608010002_backend_payments_academy_engine.sql", import.meta.url);
const sql = readFileSync(migrationUrl, "utf8");

describe("backend payments and academy migration", () => {
  it("keeps payment initialization backend-only", () => {
    expect(sql).toContain("payments_backend_initialization_only");
    expect(sql).toContain("Payment initialization must be completed by the secure payment service.");
    expect(sql).toContain("initialization_request_id");
  });

  it("makes financial history immutable and restricts payment deletion", () => {
    expect(sql).toContain("payment_transactions_immutable");
    expect(sql).toContain("Payment transaction history is immutable.");
    expect(sql).toContain("references public.payments(id) on delete restrict");
  });

  it("scopes academic reads and writes to classroom roles", () => {
    expect(sql).toContain("public.is_student_in_classroom");
    expect(sql).toContain("public.is_tutor_for_classroom");
    expect(sql).toContain("public.is_verified_admin_session()");
    expect(sql).toContain("submit_assessment_attempt");
    expect(sql).toContain("save_assessment_grade");
  });

  it("uses the complete five-part grading model", () => {
    const categories = ["assignment", "quiz", "test", "project", "attendance"];
    categories.forEach((category) => expect(sql).toContain(`'${category}'`));
    expect(sql).toContain("Grading weights must total 100 percent.");
  });
});
