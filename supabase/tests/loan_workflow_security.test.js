import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(new URL("../migrations/202608080007_secure_loan_workflow.sql", import.meta.url), "utf8");
const adminAction = readFileSync(new URL("../functions/admin-loan-action/index.ts", import.meta.url), "utf8");

describe("Secure Student loan workflow", () => {
  it("keeps KYC private and service-only", () => {
    expect(migrationSql).toContain("revoke all on schema private from public, anon, authenticated");
    expect(migrationSql).toContain("extensions.pgp_sym_encrypt(applicant_nin");
    expect(migrationSql).toContain("extensions.pgp_sym_encrypt(applicant_bvn");
    expect(migrationSql).toContain("grant execute on function public.service_get_loan_kyc(uuid) to service_role");
    expect(migrationSql).not.toMatch(/grant\s+(select|all).*private\.loan_kyc_records.*authenticated/i);
  });

  it("enforces cooldown, authoritative overdue checks, and loan-specific restoration", () => {
    expect(migrationSql).toContain("now() + interval '60 days'");
    expect(migrationSql).toContain("result.due_date >= current_date or outstanding <= 0");
    expect(migrationSql).toContain("p.status_reason = 'Loan overdue: ' || result.application_number");
    expect(migrationSql).toContain("update public.loan_account_suspensions set active = false");
  });

  it("purges KYC through the Storage API and restricted service RPC", () => {
    expect(adminAction).toContain('assertVerifiedAdmin(request)');
    expect(adminAction).toContain('.storage.from("loan-kyc").remove(paths)');
    expect(adminAction).toContain('rpc("service_finalize_loan_decision"');
    expect(migrationSql).toContain("delete from private.loan_kyc_records where application_id = target_application_id");
    expect(migrationSql).toContain("kyc_status = 'purged'");
  });
});
