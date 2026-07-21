/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/authContextCore";
import { ThemeProvider } from "../context/ThemeContext";
import { PortalLayout, PortalOverview, PortalProfile, PortalSection } from "./Portal";
import { saveStudentProgramPreference } from "../services/portal/portalRepository";

const hookMocks = vi.hoisted(() => ({
  useProgramCatalog: vi.fn(),
  usePortalPageContent: vi.fn(),
  useStudentDashboard: vi.fn(),
  useStudentProfile: vi.fn(),
  useStudentEnrolments: vi.fn(),
  useStudentTimetable: vi.fn(),
  useStudentAnnouncements: vi.fn(),
  useStudentAssignments: vi.fn(),
  useStudentResources: vi.fn(),
  usePortalArticles: vi.fn(),
  useStudentPayments: vi.fn(),
  useStudentCertificates: vi.fn(),
  useStudentNotifications: vi.fn(),
  useStudentPreferences: vi.fn(),
  useStudentProgramPreference: vi.fn(),
  useStudentSupportTickets: vi.fn()
}));

vi.mock("../hooks/portal/usePortalData", () => hookMocks);

vi.mock("../services/authService", () => ({
  claimMyEnrolments: vi.fn(async () => ({ ok: true })),
  requestPasswordReset: vi.fn(async () => ({ ok: true, message: "sent" }))
}));

vi.mock("../services/portal/portalRepository", async () => {
  const actual = await vi.importActual("../services/portal/portalRepository");
  return {
    ...actual,
    createSupportTicket: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    markNotificationRead: vi.fn(),
    saveStudentProgramPreference: vi.fn(),
    updateStudentProfile: vi.fn()
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
      payments: "Payments",
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
  saveStudentProgramPreference.mockResolvedValue({
    id: "preference-1",
    user_id: user.id,
    program_id: "program-1"
  });
  hookMocks.useStudentDashboard.mockReturnValue(query({
    activeEnrolments: [],
    pendingAssignments: [],
    resources: [],
    payments: [],
    certificates: [],
    unreadNotifications: [],
    timetable: [],
    resolvedProgramme: { id: "program-1", title: "Graphic Design" },
    resolvedTrack: null,
    programmeSource: "self_selected",
    needsProgrammeSelection: false,
    upcomingClass: null,
    todayClass: null,
    announcements: []
  }));
  hookMocks.useStudentProfile.mockReturnValue(query(profile));
  hookMocks.useStudentEnrolments.mockReturnValue(query([]));
  hookMocks.useProgramCatalog.mockReturnValue(query([
    { id: "program-1", title: "Graphic Design", short_description: "Design foundations" }
  ]));
  hookMocks.useStudentTimetable.mockReturnValue(query({
    records: [],
    resolvedProgramme: { id: "program-1", title: "Graphic Design" },
    resolvedTrack: null,
    source: "self_selected",
    needsProgrammeSelection: false,
    todayClass: null,
    nextClass: null
  }));
  hookMocks.useStudentAnnouncements.mockReturnValue(query([]));
  hookMocks.useStudentAssignments.mockReturnValue(query([]));
  hookMocks.useStudentResources.mockReturnValue(query([]));
  hookMocks.usePortalArticles.mockReturnValue(query([]));
  hookMocks.useStudentPayments.mockReturnValue(query([]));
  hookMocks.useStudentCertificates.mockReturnValue(query([]));
  hookMocks.useStudentNotifications.mockReturnValue(query([]));
  hookMocks.useStudentPreferences.mockReturnValue(query({
    email_notifications: true,
    portal_reminders: true,
    session_security_warnings: true
  }));
  hookMocks.useStudentProgramPreference.mockReturnValue(query({
    id: "preference-1",
    user_id: user.id,
    program_id: "program-1",
    selection_source: "self_selected",
    programs: { id: "program-1", title: "Graphic Design" }
  }));
  hookMocks.useStudentSupportTickets.mockReturnValue(query([]));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Portal routes", () => {
  it("opens and closes the portal drawer cleanly", () => {
    renderPortal("/portal");

    const menuButton = screen.getByRole("button", { name: "Open portal menu" });

    fireEvent.click(menuButton);

    const drawer = document.querySelector(".portal-mobile-drawer");
    expect(drawer).toHaveClass("open");
    expect(document.body).toHaveClass("portal-menu-open");
    expect(document.querySelector(".portal-drawer-backdrop")).toBeInTheDocument();

    fireEvent.click(document.querySelector(".portal-drawer-backdrop"));

    expect(document.querySelector(".portal-mobile-drawer")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("portal-menu-open");

    fireEvent.click(screen.getByRole("button", { name: "Open portal menu" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.querySelector(".portal-mobile-drawer")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("portal-menu-open");
  });

  it.each([
    ["/portal", "Student Dashboard", "useStudentDashboard"],
    ["/portal/profile", "Student Profile", "useStudentProfile"],
    ["/portal/my-courses", "My Courses", "useStudentEnrolments"],
    ["/portal/timetable", "Class Timetable", "useStudentTimetable"],
    ["/portal/announcements", "Announcements", "useStudentAnnouncements"],
    ["/portal/assignments", "Assignments", "useStudentAssignments"],
    ["/portal/resources", "Learning Resources", "useStudentResources"],
    ["/portal/payments", "Payments", "useStudentPayments"],
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

  it("requires programme selection only when no active programme or preference exists", async () => {
    hookMocks.useStudentProgramPreference.mockReturnValue(query(null));

    renderPortal("/portal");

    expect(await screen.findByRole("heading", { name: "Choose Your Programme" })).toBeInTheDocument();

    cleanup();
    hookMocks.useStudentEnrolments.mockReturnValue(query([
      {
        id: "enrolment-1",
        user_id: user.id,
        status: "active",
        program_id: "program-1",
        programs: { id: "program-1", title: "Graphic Design" }
      }
    ]));

    renderPortal("/portal");

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Choose Your Programme" })).not.toBeInTheDocument());
  });

  it("saves the self-selected programme preference from onboarding", async () => {
    hookMocks.useStudentProgramPreference.mockReturnValue(query(null));
    hookMocks.useProgramCatalog.mockReturnValue(query([
      { id: "program-1", title: "Graphic Design", short_description: "Design foundations" },
      { id: "program-2", title: "Data Analysis", short_description: "Data reporting" }
    ]));

    renderPortal("/portal");

    await screen.findByRole("heading", { name: "Choose Your Programme" });
    fireEvent.change(screen.getByPlaceholderText("Type a programme name"), { target: { value: "Data" } });
    fireEvent.click(screen.getByRole("option", { name: /Data Analysis/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Programme" }));

    await waitFor(() => expect(saveStudentProgramPreference).toHaveBeenCalledWith(user.id, { program_id: "program-2" }));
  });
});
