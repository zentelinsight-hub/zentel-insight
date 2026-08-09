import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const statusSql = readFileSync(new URL("../migrations/202608090002_admin_status_room_conflict_repair.sql", import.meta.url), "utf8");
const staffSql = readFileSync(new URL("../migrations/202608090003_staff_auth_classification_repair.sql", import.meta.url), "utf8");
const pushSql = readFileSync(new URL("../migrations/202608090004_web_push_delivery_foundation.sql", import.meta.url), "utf8");
const feedSql = readFileSync(new URL("../migrations/202608090005_technology_feed_source_identity.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

describe("Phase 3 critical backend repairs", () => {
  it("uses the legitimate partial unique identity for legacy programme rooms", () => {
    expect(statusSql).toMatch(/on conflict \(program_id\) where classroom_id is null do update/i);
    expect(statusSql).not.toMatch(/on conflict \(program_id\) do update/i);
  });

  it("classifies Admin-provisioned Staff as inactive Staff during Auth creation", () => {
    expect(staffSql).toMatch(/zentel_role'.*in \('staff', 'tutor'\)/is);
    expect(staffSql).toContain("New Staff account pending Admin activation");
    expect(staffSql).toContain("trusted_status text := 'inactive'");
  });
});

describe("Web Push delivery foundation", () => {
  it("persists subscriptions per authenticated user without exposing the outbox", () => {
    expect(pushSql).toContain("alter table public.web_push_subscriptions enable row level security");
    expect(pushSql).toContain("user_id = auth.uid()");
    expect(pushSql).toContain("revoke all on public.push_notification_outbox from public, anon, authenticated");
  });

  it("deduplicates notification delivery and never embeds a service key", () => {
    expect(pushSql).toContain("unique (notification_id, user_id)");
    expect(pushSql).toMatch(/on conflict \(notification_id, user_id\) do nothing/i);
    expect(pushSql).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/);
  });

  it("handles push display and deep-link clicks in the service worker", () => {
    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain("openWindow(target)");
  });
});

describe("Technology feed source identity", () => {
  it("adds source icon and domain fields without replacing existing media", () => {
    expect(feedSql).toContain("source_icon_url text");
    expect(feedSql).toContain("source_domain text");
    expect(feedSql).not.toMatch(/drop column|delete from/i);
  });
});
