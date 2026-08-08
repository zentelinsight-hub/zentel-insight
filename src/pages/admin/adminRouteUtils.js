const validAdminSections = new Set([
  "overview",
  "accounts",
  "staff",
  "academics",
  "finance",
  "programmes",
  "enrolments",
  "classrooms",
  "zentel-ai",
  "live-classes",
  "timetable",
  "announcements",
  "assignments",
  "resources",
  "articles",
  "payments",
  "certificates",
  "notifications",
  "support",
  "audit",
  "profile",
  "settings",
  "more"
]);

export function resolveAdminSection(section, portalId) {
  const routeSection = portalId ? "accounts" : section || "overview";
  const requestedSection = ["people", "students", "tutors"].includes(routeSection) ? "accounts" : routeSection;
  return validAdminSections.has(requestedSection) ? requestedSection : "overview";
}

export function resolveAdminRoute(pathname, forcedSection = "") {
  if (forcedSection) return { section: forcedSection, portalId: "", roomId: "" };

  const parts = String(pathname || "")
    .replace(/^\/admin\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  const section = parts[0] || "overview";

  if (section === "accounts" && parts[1]) {
    return { section: "accounts", portalId: parts[1], roomId: "" };
  }
  if (section === "classrooms" && parts.at(-1) === "chat") {
    return { section: "classroom-chat", portalId: "", roomId: parts[1] || "all" };
  }

  return { section: resolveAdminSection(section, ""), portalId: "", roomId: "" };
}
