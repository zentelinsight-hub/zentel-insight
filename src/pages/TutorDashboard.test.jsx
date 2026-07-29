/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContext } from "../context/authContextCore";
import { ThemeProvider } from "../context/ThemeContext";
import { pageVisualMap } from "../data/pageVisuals";
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
    notifications: [],
    supportTickets: [],
    studentTotal: 0,
    unreadMessages: 0
  })),
  searchTutorStudents: vi.fn(async () => ({ records: [], total: 0, page: 1, pageCount: 1 })),
  updateTutorProfessionalProfile: vi.fn(),
  saveTutorAssignment: vi.fn(),
  saveTutorResource: vi.fn()
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

describe("Tutor Dashboard visual", () => {
  it("shows the tutor-only illustration on the dashboard overview", async () => {
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

    const visual = pageVisualMap.tutorDashboard;
    expect(await screen.findByRole("img", { name: visual.alt })).toHaveAttribute("src", visual.src);
  });
});
