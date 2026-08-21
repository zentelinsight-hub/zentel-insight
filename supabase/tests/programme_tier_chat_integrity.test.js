import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../migrations/202608210001_programme_tier_chat_integrity.sql", import.meta.url),
  "utf8"
);

describe("programme tier chat integrity migration", () => {
  it("enforces one active classroom and official room per programme tier", () => {
    expect(sql).toMatch(/classrooms_one_active_tier_idx[\s\S]*on public\.classrooms\(track_id\)[\s\S]*where status = 'active'/i);
    expect(sql).toMatch(/program_chat_rooms_one_active_tier_idx[\s\S]*on public\.program_chat_rooms\(track_id\)[\s\S]*where active and classroom_id is not null/i);
    expect(sql).toContain("program.title || ' — ' || level.level_name");
  });

  it("preserves duplicate room history while retiring duplicate active classrooms", () => {
    expect(sql).toMatch(/update public\.classrooms classroom[\s\S]*set status = 'completed'/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.program_chat_messages/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.program_chat_rooms/i);
  });

  it("moves a Student atomically and requires an explicit join in the new room", () => {
    expect(sql).toMatch(/create or replace function public\.admin_assign_student_programme/i);
    expect(sql).toMatch(/update public\.program_chat_members member[\s\S]*member\.role = 'student'/i);
    expect(sql).toMatch(/create or replace function public\.join_programme_chat/i);
    expect(sql).toMatch(/message_created_at >= member\.joined_at/i);
    expect(sql).toContain("'programme_chat_joined'");
  });

  it("allows one Tutor across many tiers but only one active Tutor per tier", () => {
    expect(sql).toContain("drop index if exists public.tutor_program_assignments_one_active_tutor_idx");
    expect(sql).toMatch(/tutor_classroom_assignments_one_active_classroom_idx[\s\S]*where active/i);
    expect(sql).toContain("End that assignment before assigning another Tutor");
    expect(sql).not.toMatch(/where tutor_id = target_tutor_id\s+and active = true;/i);
  });

  it("exposes a verified-Admin participant snapshot with chat state", () => {
    expect(sql).toMatch(/create or replace function public\.admin_get_tier_participants/i);
    expect(sql).toContain("public.is_verified_admin_session()");
    expect(sql).toContain("'Joined Chat'");
    expect(sql).toContain("'Not Joined'");
    expect(sql).toContain("'Chat Restricted'");
  });

  it("keeps Loan KYC private while allowing only unsubmitted own-file replacement", () => {
    expect(sql).toMatch(/create or replace function public\.can_delete_pending_loan_kyc/i);
    expect(sql).toContain("private.loan_kyc_records");
    expect(sql).toMatch(/not exists \([\s\S]*kyc\.passport_photo_path = object_name/i);
    expect(sql).toMatch(/on storage\.objects for delete to authenticated/i);
    expect(sql).not.toMatch(/on storage\.objects for select[\s\S]*loan-kyc/i);
  });
});
