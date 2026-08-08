/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/authContextCore";
import { ThemeProvider } from "../context/ThemeContext";
import { PortalLayout, PortalOverview, PortalProfile, PortalSection } from "./Portal";

const hookMocks = vi.hoisted(() => ({
  usePortalPageContent: vi.fn(),
  useStudentDashboard: vi.fn(),
  useStudentProfile: vi.fn(),
  useStudentEnrolments: vi.fn(),
  useStudentTimetable: vi.fn(),
  useStudentAnnouncements: vi.fn(),
  useStudentAssignments: vi.fn(),
  useStudentResources: vi.fn(),
  usePortalArticles: vi.fn(),
  useStudentActivePayments: vi.fn(),
  useStudentCertificates: vi.fn(),
  useStudentNotifications: vi.fn(),
  useStudentPreferences: vi.fn(),
  useStudentSupportTickets: vi.fn(),
  useStudentFeed: vi.fn()
}));

vi.mock("../hooks/portal/usePortalData", () => hookMocks);

vi.mock("../services/authService", () => ({
  claimMyEnrolments: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../services/portal/portalRepository", async () => {
  const actual = await vi.importActual("../services/portal/portalRepository");
  return {
    ...actual,
    createSupportTicket: vi.fn(),
    createStudentFeedPost: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    markNotificationRead: vi.fn(),
    replyToSupportTicket: vi.fn()
  };
});

const user = {
  id: "user-1",
  email: "learner@example.com",
  email_confirmed_at: "2026-07-17T00:00:00Z",
  created_at: "2026-07-17T00:00:00Z"
};

const profile = {
  id: "user-1",
  full_name: "Ada Learner",
  email: "learner@example.com",
  phone: "07000000000",
  date_of_birth: "2006-01-01",
  education_level: "Senior Secondary School",
  address: "Lagos",
  profile_completion: 100,
  created_at: "2026-07-17T00:00:00Z"
};

function query(data) {
  return { data, loading: false, error: "", refetch: vi.fn() };
}

function renderPortal(path) {
  return render(
    <AuthContext.Provider
      value={{
        authReady: true,
        authLoading: false,
        profileLoading: false,
        profileError: "",
        configured: true,
        loading: false,
        session: { user },
        user,
        profile,
        refreshProfile: vi.fn(),
        signOut: vi.fn()
      }}
    >
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/portal" element={<PortalLayout />}>
              <Route index element={<PortalOverview />} />
              <Route path="profile" element={<PortalProfile />} />
              <Route path="my-courses" element={<PortalSection page="my-courses" />} />
              <Route path="timetable" element={<PortalSection page="timetable" />} />
              <Route path="announcements" element={<PortalSection page="announcements" />} />
              <Route path="assignments" element={<PortalSection page="assignments" />} />
              <Route path="resources" element={<PortalSection page="resources" />} />
              <Route path="payments" element={<PortalSection page="payments" />} />
              <Route path="certificates" element={<PortalSection page="certificates" />} />
              <Route path="notifications" element={<PortalSection page="notifications" />} />
              <Route path="articles" element={<PortalSection page="articles" />} />
              <Route path="support" element={<PortalSection page="support" />} />
              <Route path="settings" element={<PortalSection page="settings" />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({
    matches: false,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  hookMocks.usePortalPageContent.mockImplementation((slug) => query({
    title: {
      dashboard: "Student Dashboard",
      profile: "Student Profile",
      "my-courses": "My Courses",
      timetable: "Class Timetable",
      announcements: "Announcements",
      assignments: "Assignments",
      resources: "Learning Resources",
      payments: "Active Payment",
      certificates: "Certificates",
      notifications: "Notifications",
      articles: "Learning Articles",
      support: "Support Tickets",
      settings: "Account Settings"
    }[slug],
    description: "Supabase-backed student content.",
    empty_title: "No records",
    empty_message: "Records are listed after they are available."
  }));
  hookMocks.useStudentDashboard.mockReturnValue(query({
    activeEnrolments: [],
    pendingAssignments: [],
    resources: [],
    activePayments: [],
    certificates: [],
    unreadNotifications: [],
    timetable: [],
    resolvedProgramme: { id: "program-1", title: "Graphic Design" },
    resolvedTrack: null,
    programmeSource: "official",
    needsProgrammeSelection: false,
    upcomingClass: null,
    todayClass: null,
    announcements: []
  }));
  hookMocks.useStudentProfile.mockReturnValue(query(profile));
  hookMocks.useStudentEnrolments.mockReturnValue(query([]));
  hookMocks.useStudentTimetable.mockReturnValue(query({
    records: [],
    resolvedProgramme: { id: "program-1", title: "Graphic Design" },
    resolvedTrack: null,
    source: "official",
    needsProgrammeSelection: false,
    todayClass: null,
    nextClass: null
  }));
  hookMocks.useStudentAnnouncements.mockReturnValue(query([]));
  hookMocks.useStudentAssignments.mockReturnValue(query([]));
  hookMocks.useStudentResources.mockReturnValue(query([]));
  hookMocks.usePortalArticles.mockReturnValue(query([]));
  hookMocks.useStudentActivePayments.mockReturnValue(query([]));
  hookMocks.useStudentCertificates.mockReturnValue(query([]));
  hookMocks.useStudentNotifications.mockReturnValue(query([]));
  hookMocks.useStudentPreferences.mockReturnValue(query({
    email_notifications: true,
    portal_reminders: true,
    session_security_warnings: true
  }));
  hookMocks.useStudentSupportTickets.mockReturnValue(query([]));
  hookMocks.useStudentFeed.mockReturnValue(query([]));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Portal routes", () => {
  it("uses persistent top navigation without a portal drawer", () => {
    renderPortal("/portal");

    expect(screen.getByRole("navigation", { name: "Student portal" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/portal");
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/portal/messages");
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/portal/more");
    expect(document.querySelector(".portal-sidebar")).not.toBeInTheDocument();
    expect(document.querySelector(".portal-mobile-drawer")).not.toBeInTheDocument();
  });

  it.each([
    ["/portal", "Home", "useStudentFeed"],
    ["/portal/profile", "Student Profile", "useStudentProfile"],
    ["/portal/my-courses", "My Courses", "useStudentEnrolments"],
    ["/portal/timetable", "Class Timetable", "useStudentTimetable"],
    ["/portal/announcements", "Announcements", "useStudentAnnouncements"],
    ["/portal/assignments", "Assignments", "useStudentAssignments"],
    ["/portal/resources", "Learning Resources", "useStudentResources"],
    ["/portal/payments", "Active Payment", "useStudentActivePayments"],
    ["/portal/certificates", "Certificates", "useStudentCertificates"],
    ["/portal/notifications", "Notifications", "useStudentNotifications"],
    ["/portal/articles", "Learning Articles", "usePortalArticles"],
    ["/portal/support", "Support Tickets", "useStudentSupportTickets"],
    ["/portal/settings", "Account Settings", null]
  ])("renders %s from the portal data layer", (path, heading, hookName) => {
    renderPortal(path);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    if (hookName) expect(hookMocks[hookName]).toHaveBeenCalled();
    expect(screen.queryByText(/signed-in learner/i)).not.toBeInTheDocument();
  });

  it("does not allow a Student to choose or change a programme", () => {
    renderPortal("/portal");
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Choose Your Programme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save programme/i })).not.toBeInTheDocument();
  });

  it("shows programme and credentials as Admin-managed in settings", () => {
    renderPortal("/portal/settings");
    expect(screen.getByRole("heading", { name: "Assigned programme" })).toBeInTheDocument();
    expect(screen.getByText(/assigned only by Zentel Insight Admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save Programme/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /password reset/i })).not.toBeInTheDocument();
  });
});
