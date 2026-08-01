import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/202608010004_classroom_chat_resolution.sql", import.meta.url),
  "utf8"
);
const compatibilityMigration = readFileSync(
  new URL("../migrations/202608010005_classroom_chat_compatibility.sql", import.meta.url),
  "utf8"
);
const selfHealMigration = readFileSync(
  new URL("../migrations/202608010006_classroom_chat_self_heal.sql", import.meta.url),
  "utf8"
);

describe("classroom chat resolution migration", () => {
  it("creates and maintains one chat room per classroom", () => {
    expect(migration).toMatch(/create trigger classrooms_sync_chat_room/i);
    expect(migration).toMatch(/on conflict \(classroom_id\) where classroom_id is not null/i);
  });

  it("keeps Tutor chat membership synchronized with classroom assignments", () => {
    expect(migration).toMatch(/create trigger tutor_classroom_assignments_sync_chat/i);
    expect(migration).toMatch(/insert into public\.program_chat_members/i);
  });

  it("returns only exact authorised classroom rooms", () => {
    expect(migration).toMatch(/create or replace function public\.get_classroom_chat_access/i);
    expect(migration).toMatch(/room\.classroom_id is not null/i);
    expect(migration).toMatch(/public\.is_eligible_for_program_chat\(room\.id, current_user_id\)/i);
  });

  it("routes older frontend bundles through the classroom resolver", () => {
    expect(compatibilityMigration).toMatch(/create or replace function public\.get_programme_chat_access/i);
    expect(compatibilityMigration).toMatch(/from public\.get_classroom_chat_access/i);
  });

  it("repairs active legacy enrolments before loading Chat", () => {
    expect(selfHealMigration).toMatch(/from public\.enrolments enrolment/i);
    expect(selfHealMigration).toMatch(/insert into public\.classroom_memberships/i);
    expect(selfHealMigration).toMatch(/insert into public\.program_chat_members/i);
    expect(selfHealMigration).toMatch(/else now\(\)/i);
  });
});
