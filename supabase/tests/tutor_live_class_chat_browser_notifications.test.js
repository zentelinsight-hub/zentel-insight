import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../migrations/202608120001_tutor_live_class_chat_browser_notifications.sql", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../src/components/portal/PortalShell.jsx", import.meta.url), "utf8");
const push = readFileSync(new URL("../../src/services/pushNotifications.js", import.meta.url), "utf8");

describe("Tutor live class ambiguity repair", () => {
  it("uses an actor identifier distinct from tutor_id columns", () => {
    expect(migration).toContain("actor_tutor_id uuid := auth.uid()");
    expect(migration).toContain("assignment.tutor_id = actor_tutor_id");
    expect(migration).toContain("session.tutor_id = actor_tutor_id");
    expect(migration).not.toContain("declare\n  tutor_id uuid");
  });
});

describe("Realtime browser notifications", () => {
  it("keeps chat out of portal notifications", () => {
    expect(migration).toContain("drop trigger if exists program_chat_messages_notify_members");
    expect(migration).toContain("notification_type = 'classroom_message'");
  });

  it("shows committed incoming chat messages immediately", () => {
    expect(shell).toContain('table === "program_chat_messages"');
    expect(shell).toContain('payload?.eventType === "INSERT"');
    expect(shell).toContain("showDeviceNotification");
    expect(shell).toContain("zentel-chat-");
  });

  it("requires the browser permission and an enabled device subscription", () => {
    expect(push).toContain('Notification.permission !== "granted"');
    expect(push).toContain("registration.pushManager.getSubscription()");
    expect(push).toContain("registration.showNotification");
  });
});
