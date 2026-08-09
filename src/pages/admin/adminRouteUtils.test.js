import { describe, expect, it } from "vitest";
import { resolveAdminRoute } from "./adminRouteUtils";

describe("resolveAdminRoute", () => {
  it("keeps a searched account open under the wildcard Admin route", () => {
    expect(resolveAdminRoute("/admin/accounts/ZIS-ABCD-2345")).toEqual({
      section: "accounts",
      portalId: "ZIS-ABCD-2345",
      roomId: ""
    });
  });

  it("opens the requested classroom chat instead of returning to Overview", () => {
    expect(resolveAdminRoute("/admin/classrooms/room-1/chat")).toEqual({
      section: "classroom-chat",
      portalId: "",
      roomId: "room-1"
    });
  });

  it("recognises Academics and More as standalone destinations", () => {
    expect(resolveAdminRoute("/admin/academics").section).toBe("academics");
    expect(resolveAdminRoute("/admin/more").section).toBe("more");
  });

  it("keeps a Payment Details route inside the Payments workspace", () => {
    expect(resolveAdminRoute("/admin/payments/9af3bc0d-400a-4a8d-88e4-fb4e289a5a29")).toEqual({
      section: "payments",
      portalId: "",
      roomId: "",
      paymentId: "9af3bc0d-400a-4a8d-88e4-fb4e289a5a29"
    });
  });
});
