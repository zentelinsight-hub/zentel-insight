import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const statusRepairSql = readFileSync(
  new URL("../migrations/202608090002_admin_status_room_conflict_repair.sql", import.meta.url),
  "utf8"
);
const staffRepairSql = readFileSync(
  new URL("../migrations/202608090003_staff_auth_classification_repair.sql", import.meta.url),
  "utf8"
);

describe("Admin account status repair", () => {
  it("targets the legacy programme-room partial unique identity", () => {
    expect(statusRepairSql).toMatch(/on conflict \(program_id\) where classroom_id is null do update/i);
    expect(statusRepairSql).toMatch(/values \(selected_program\.id, null,/i);
    expect(statusRepairSql).not.toMatch(/on conflict \(program_id\) do update/i);
  });

  it("does not alter classroom-specific rooms or access policies", () => {
    expect(statusRepairSql).not.toMatch(/drop (constraint|index)/i);
    expect(statusRepairSql).not.toMatch(/create policy|drop policy/i);
  });
});

describe("Staff Auth classification repair", () => {
  it("trusts only Admin-provisioned Staff and Tutor metadata", () => {
    expect(staffRepairSql).toMatch(/zentel_role'.*in \('staff', 'tutor'\)/is);
    expect(staffRepairSql).toMatch(/zentel_provisioned_by'.*= 'admin'/is);
    expect(staffRepairSql).toContain("New Staff account pending Admin activation");
  });

  it("creates Staff as inactive and preserves the Admin exemption", () => {
    expect(staffRepairSql).toContain("trusted_status text := 'inactive'");
    expect(staffRepairSql).toContain("trusted_status := 'active'");
    expect(staffRepairSql).toMatch(/excluded\.role in \('admin', 'staff', 'tutor'\)/i);
  });
});
