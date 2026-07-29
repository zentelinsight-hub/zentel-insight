const validAdminSections = new Set([
  "overview",
  "accounts",
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
  "settings"
]);

export function resolveAdminSection(section, portalId) {
  const routeSection = portalId ? "accounts" : section || "overview";
  const requestedSection = ["people", "students", "tutors"].includes(routeSection) ? "accounts" : routeSection;
  return validAdminSections.has(requestedSection) ? requestedSection : "overview";
}
