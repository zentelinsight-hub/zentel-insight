/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeopleSection } from "./AdminDashboard";

vi.mock("../services/adminService", async () => {
  const actual = await vi.importActual("../services/adminService");
  return {
    ...actual,
    searchAdminStudents: vi.fn(async () => ({ records: [], total: 0, page: 1, pageCount: 1 })),
    searchAdminTutors: vi.fn(async () => ({ records: [], total: 0, page: 1, pageCount: 1 }))
  };
});

const baseData = {
  profiles: [],
  roles: [],
  students: [],
  tutors: [],
  tutorAssignments: [],
  enrolments: [],
  programs: []
};

afterEach(cleanup);

describe("Admin people directory", () => {
  it("renders loaded Student records when remote search returns an empty success", async () => {
    render(
      <MemoryRouter>
        <PeopleSection
          activeSection="students"
          data={{
            ...baseData,
            students: [{
              id: "student-1",
              full_name: "Ada Student",
              email: "ada@example.com",
              phone: "07000000000",
              account_status: "active",
              profile_completion: 100,
              created_at: "2026-07-28T10:00:00Z"
            }]
          }}
          onSaved={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText("Ada Student")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("renders loaded Tutor records when remote search returns an empty success", async () => {
    render(
      <MemoryRouter>
        <PeopleSection
          activeSection="tutors"
          data={{
            ...baseData,
            tutors: [{
              user_id: "tutor-1",
              title: "Mrs",
              full_name: "Bola Tutor",
              email: "bola@example.com",
              phone: "08000000000",
              specialisation: "Data Analysis",
              account_status: "active",
              profile_completion: 100,
              created_at: "2026-07-28T10:00:00Z",
              profiles: { account_status: "active" }
            }]
          }}
          onSaved={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Bola Tutor/)).toBeInTheDocument();
    expect(screen.getByText("bola@example.com")).toBeInTheDocument();
  });
});
