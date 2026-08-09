import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const staffSql = readFileSync(new URL("../migrations/202608080001_staff_case_security_foundation.sql", import.meta.url), "utf8");
const liveSql = readFileSync(new URL("../migrations/202608080002_external_live_class_workflow.sql", import.meta.url), "utf8");
const staffProvisionRepairSql = readFileSync(new URL("../migrations/202608090001_staff_provision_service_role_repair.sql", import.meta.url), "utf8");

describe("Staff case security migration", () => {
  it("limits Staff search to Student and Tutor records and rate limits searches", () => {
    expect(staffSql).toMatch(/r\.role in \('student', 'tutor'\)/);
    expect(staffSql).toContain("interval '2 minutes'");
    expect(staffSql).toMatch(/recent_count >= 20/);
    expect(staffSql).toContain("account_status = 'restricted'");
  });

  it("enforces one active case and capability-based case access", () => {
    expect(staffSql).toContain("staff_one_active_case_idx");
    expect(staffSql).toContain("staff_owns_active_case");
    expect(staffSql).toContain("staff_has_capability");
    expect(staffSql).not.toMatch(/grant\s+all\s+on\s+all\s+tables\s+to\s+authenticated/i);
  });
});

describe("External live-class migration", () => {
  it("accepts only validated Meet and Zoom URLs for new or changed sessions", () => {
    expect(liveSql).toContain("new.provider not in ('google_meet', 'zoom')");
    expect(liveSql).toContain("meet.google.com");
    expect(liveSql).toContain("%.zoom.us");
    expect(liveSql).toContain("^https://");
  });

  it("authorizes Tutor scheduling by active classroom assignment", () => {
    expect(liveSql).toContain("public.is_account_active(tutor_id)");
    expect(liveSql).toContain("public.tutor_classroom_assignments");
    expect(liveSql).toContain("live_class_enabled");
    expect(liveSql).toContain("actual_started_at");
    expect(liveSql).toContain("actual_ended_at");
  });
});

describe("Staff provisioning repair migration", () => {
  it("keeps provisioning service-only while avoiding request-setting and conflict ambiguity", () => {
    expect(staffProvisionRepairSql).toContain("coalesce(auth.role(), '') <> 'service_role'");
    expect(staffProvisionRepairSql).toContain("on conflict on constraint staff_capabilities_pkey");
    expect(staffProvisionRepairSql).toContain("from public, anon, authenticated");
    expect(staffProvisionRepairSql).toContain("to service_role");
    expect(staffProvisionRepairSql).not.toContain("request.jwt.claim.role");
  });
});
