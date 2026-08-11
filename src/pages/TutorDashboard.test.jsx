/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/authContextCore";
import { ThemeProvider } from "../context/ThemeContext";
import TutorDashboard from "./TutorDashboard";

vi.mock("../services/tutorService", () => ({
  getTutorDashboardData: vi.fn(async () => ({
    profile: { full_name: "Test Tutor", title: "Mr" },
    tutorProfile: null,
    assignments: [],
    officialStudents: [],
    preferenceStudents: [],
    timetable: [],
    announcements: [],
    learningAssignments: [],
    resources: [],
    articles: [],
    liveClasses: [],
    classrooms: [],
    notifications: [],
    supportTickets: [],
    studentTotal: 0,
    unreadMessages: 0
  })),
  searchTutorStudents: vi.fn(async () => ({ records: [], total: 0, page: 1, pageCount: 1 })),
  updateTutorProfessionalProfile: vi.fn(),
  saveTutorAssignment: vi.fn(),
  saveTutorLiveClass: vi.fn(),
  cancelTutorLiveClass: vi.fn(),
  saveTutorResource: vi.fn()
}));

vi.mock("../hooks/portal/usePortalData", () => ({
  useStudentFeed: vi.fn(() => ({ data: [], loading: false, error: "", refetch: vi.fn() }))
}));

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({
    matches: false,
    media: "",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Tutor Dashboard", () => {
  it("shows the shared home feed and five direct navigation links", async () => {
    render(
      <AuthContext.Provider
        value={{
          authReady: true,
          configured: true,
          loading: false,
          session: { user: { id: "tutor-1", email: "tutor@example.com" } },
          user: { id: "tutor-1", email: "tutor@example.com" },
          profile: { full_name: "Test Tutor" },
          signOut: vi.fn()
        }}
      >
        <ThemeProvider>
          <MemoryRouter initialEntries={["/tutor/dashboard"]}>
            <Routes>
              <Route path="/tutor/:section" element={<TutorDashboard />} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </AuthContext.Provider>
    );

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Create a post" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/tutor");
    expect(screen.getByRole("link", { name: "Classrooms" })).toHaveAttribute("href", "/tutor/classrooms");
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("href", "/tutor/messages");
    expect(screen.getByRole("link", { name: "Assessment" })).toHaveAttribute("href", "/tutor/assessment");
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/tutor/more");
  });
});
