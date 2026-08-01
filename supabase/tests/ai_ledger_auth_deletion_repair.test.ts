import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/202607290008_ai_ledger_auth_deletion_repair.sql", import.meta.url),
  "utf8"
);

describe("AI ledger Auth deletion repair migration", () => {
  it("decouples immutable ledger history from cascading and set-null mutations", () => {
    expect(migration).toContain("drop constraint if exists ai_credit_ledger_user_id_fkey");
    expect(migration).toContain("drop constraint if exists ai_credit_ledger_subscription_id_fkey");
    expect(migration).toContain("drop constraint if exists ai_credit_ledger_conversation_id_fkey");
    expect(migration).toContain("drop constraint if exists ai_credit_ledger_request_id_fkey");
    expect(migration).not.toMatch(/ai_credit_ledger[\s\S]*foreign key \(user_id\)[\s\S]*on delete cascade/i);
  });

  it("keeps normal ledger updates and deletes blocked", () => {
    expect(migration).toContain("if tg_op = 'DELETE'");
    expect(migration).toContain("raise exception 'Credit ledger entries are immutable.'");
    expect(migration).toContain("update_blocked := position('immutable'");
    expect(migration).toContain("delete_blocked := position('immutable'");
  });

  it("restricts smoke cleanup to the service role and approved email pattern", () => {
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("^zentel-ai-smoke-[0-9]+@example[.]com$");
    expect(migration).toContain("Tutor and Admin accounts cannot use smoke-test cleanup.");
    expect(migration).toContain("Student enrolments exist; cleanup is refused.");
    expect(migration).toContain("Verified financial records exist; cleanup is refused.");
    expect(migration).toContain("revoke all on function public.maintain_zentel_smoke_account(uuid, text, boolean) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.maintain_zentel_smoke_account(uuid, text, boolean) to service_role");
  });

  it("preserves historical financial identifiers and supports idempotent cleanup", () => {
    expect(migration).toContain("ai_subscriptions add column if not exists historical_user_id uuid");
    expect(migration).toContain("ai_topup_purchases add column if not exists historical_user_id uuid");
    expect(migration).toContain("already_cleaned");
    expect(migration).toContain("zentel_smoke_cleanup_audit");
  });
});
