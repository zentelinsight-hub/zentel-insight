import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../migrations/202608010001_portal_classroom_realtime_ai_no_trials.sql", import.meta.url),
  "utf8"
);

describe("portal classroom and account migration", () => {
  it("repairs visible IDs from the authoritative account role", () => {
    expect(migration).toMatch(/role_record\.role = 'student'.*portal_id !~ '\^ZIS-/s);
    expect(migration).toMatch(/role_record\.role = 'tutor'.*portal_id !~ '\^ZIT-/s);
    expect(migration).toContain("Portal ID is immutable.");
  });

  it("requires an explicit server-timed Student chat membership", () => {
    expect(migration).toMatch(/create or replace function public\.join_programme_chat/);
    expect(migration).toMatch(/joined_at = now\(\)/);
    expect(migration).toMatch(/message_created_at >= member\.joined_at/);
    expect(migration).toMatch(/Only Students use Join Chat/);
  });

  it("protects classroom events, reactions, unread state and retention", () => {
    expect(migration).toContain("chat-room:");
    expect(migration).toContain("realtime.broadcast_changes");
    expect(migration).toMatch(/unique \(message_id, user_id, reaction\)/);
    expect(migration).toMatch(/last_read_at timestamptz/);
    expect(migration).toMatch(/interval '7 days'/);
  });

  it("keeps free trials disabled at the database boundary", () => {
    expect(migration).toMatch(/trial_enabled = false/);
    expect(migration).toMatch(/trial_credits = 0/);
    expect(migration).toMatch(/revoke all on function public\.ai_claim_trial\(\) from public, anon, authenticated/);
  });
});
