import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/202608110004_portal_feed_assignments_live_attendance.sql", import.meta.url), "utf8");
const liveTokenFunction = readFileSync(new URL("../functions/create-live-class-token/index.ts", import.meta.url), "utf8");
const feedFunction = readFileSync(new URL("../functions/student-tech-feed/index.ts", import.meta.url), "utf8");

describe("Portal community feed repair", () => {
  it("allows only active Students and Tutors to publish and upload feed media", () => {
    expect(migration).toContain("role_record.role::text in ('student', 'tutor')");
    expect(migration).toContain("profile.account_status = 'active'");
    expect(migration).toContain("Portal members can upload their feed media");
    expect(feedFunction).toContain('["student", "tutor"].includes(role)');
  });

  it("keeps verified Admin moderation authoritative", () => {
    expect(migration).toContain("public.is_verified_admin_session()");
    expect(migration).toContain("public.admin_list_student_feed_posts");
  });
});

describe("Live class attendance and performance repair", () => {
  it("accepts validated Meet, Zoom and YouTube links", () => {
    expect(migration).toContain("new.provider not in ('google_meet', 'zoom', 'youtube')");
    expect(migration).toContain("meet.google.com");
    expect(migration).toContain("%.zoom.us");
    expect(migration).toContain("youtu.be");
  });

  it("records Student joins and synchronizes them into academic attendance", () => {
    expect(liveTokenFunction).toContain('role === "student"');
    expect(liveTokenFunction).toContain('.from("live_class_attendance").upsert');
    expect(migration).toContain("sync_live_class_attendance_to_academy");
    expect(migration).toContain("attendance_records");
    expect(migration).toContain("partially_attended");
  });

  it("finalizes absences and notifies active classroom Students", () => {
    expect(migration).toContain("finalize_live_class_attendance");
    expect(migration).toContain("'absent'");
    expect(migration).toContain("notify_live_class_students");
    expect(migration).toContain("'/portal/live-classes'");
  });
});
