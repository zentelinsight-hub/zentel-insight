/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeopleSection } from "./AdminDashboard";
import { resolveAdminSection } from "./admin/adminRouteUtils";

const serviceMocks = vi.hoisted(() => ({
  searchAdminStudents: vi.fn(),
  searchAdminTutors: vi.fn(),
  updateStudentProfile: vi.fn(),
  updateTutorProfile: vi.fn()
}));

vi.mock("../services/adminService", async () => {
  const actual = await vi.importActual("../services/adminService");
  return {
    ...actual,
    ...serviceMocks
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

beforeEach(() => {
  serviceMocks.searchAdminStudents.mockResolvedValue({ records: [], total: 0, page: 1, pageCount: 1 });
  serviceMocks.searchAdminTutors.mockResolvedValue({ records: [], total: 0, page: 1, pageCount: 1 });
  serviceMocks.updateStudentProfile.mockResolvedValue({ id: "student-1" });
  serviceMocks.updateTutorProfile.mockResolvedValue({ id: "tutor-1" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const student = {
  id: "student-1",
  full_name: "Ada Student",
  email: "ada@example.com",
  phone: "07000000000",
  date_of_birth: "2002-04-12",
  education_level: "Undergraduate",
  address: "Lagos",
  account_status: "active",
  profile_completion: 100,
  created_at: "2026-07-28T10:00:00Z"
};

const tutor = {
  user_id: "tutor-1",
  title: "Mrs",
  full_name: "Bola Tutor",
  email: "bola@example.com",
  phone: "08000000000",
  specialisation: "Data Analysis",
  professional_bio: "Experienced Tutor",
  account_status: "active",
  profile_completion: 100,
  created_at: "2026-07-28T10:00:00Z",
  profiles: { account_status: "active" }
};

function renderPeople(activeSection, overrides = {}, onSaved = vi.fn()) {
  return render(
    <MemoryRouter>
      <PeopleSection activeSection={activeSection} data={{ ...baseData, ...overrides }} onSaved={onSaved} />
    </MemoryRouter>
  );
}

describe("Admin route resolution", () => {
  it("keeps a Portal ID route on the editable Accounts section", () => {
    expect(resolveAdminSection(undefined, "ZIS-ABCD-2345")).toBe("accounts");
    expect(resolveAdminSection(undefined, "ZIT-WXYZ-6789")).toBe("accounts");
  });
});

describe("Admin people directory", () => {
  it("renders loaded Student records when remote search returns an empty success", async () => {
    render(
      <MemoryRouter>
        <PeopleSection
          activeSection="students"
          data={{
            ...baseData,
            students: [student]
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
            tutors: [tutor]
          }}
          onSaved={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Bola Tutor/)).toBeInTheDocument();
    expect(screen.getByText("bola@example.com")).toBeInTheDocument();
  });

  it("opens a populated Student dialog on the first click and closes cleanly", async () => {
    renderPeople("students", { students: [student] });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByRole("dialog", { name: "Edit Student Record" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Student");
    expect(screen.getByLabelText("Phone number")).toHaveValue("07000000000");
    expect(screen.getByLabelText("Date of birth")).toHaveValue("2002-04-12");
    expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Edit Student Record" })).not.toBeInTheDocument();
  });

  it("warns before discarding unsaved Student changes", async () => {
    renderPeople("students", { students: [student] });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada Updated" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep Editing" }));
    expect(screen.getByLabelText("Full name")).toHaveValue("Ada Updated");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
    expect(screen.queryByRole("dialog", { name: "Edit Student Record" })).not.toBeInTheDocument();
  });

  it("saves the selected Student UUID once and refreshes the directory", async () => {
    let resolveSave;
    serviceMocks.updateStudentProfile.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const onSaved = vi.fn();
    renderPeople("students", { students: [student] }, onSaved);
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Ada Updated" } });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saving Changes" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Saving Changes" }));
    expect(serviceMocks.updateStudentProfile).toHaveBeenCalledTimes(1);
    expect(serviceMocks.updateStudentProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "student-1", full_name: "Ada Updated" }));

    resolveSave({ id: "student-1" });
    await waitFor(() => expect(screen.getByText("Student record saved.")).toBeInTheDocument());
    expect(onSaved).toHaveBeenCalled();
  });

  it("keeps Tutor values and does not show success when saving fails", async () => {
    serviceMocks.updateTutorProfile.mockRejectedValueOnce(new Error("Secure update unavailable"));
    renderPeople("tutors", { tutors: [tutor] });
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByRole("dialog", { name: "Edit Tutor Record" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toHaveValue("Bola Tutor");
    expect(screen.getByLabelText("Professional bio")).toHaveValue("Experienced Tutor");
    fireEvent.change(screen.getByLabelText("Professional bio"), { target: { value: "Updated professional biography" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText("Secure update unavailable")).toBeInTheDocument();
    expect(screen.getByLabelText("Professional bio")).toHaveValue("Updated professional biography");
    expect(screen.queryByText("Tutor record saved.")).not.toBeInTheDocument();
    expect(serviceMocks.updateTutorProfile).toHaveBeenCalledWith(expect.objectContaining({ user_id: "tutor-1" }));
  });
});
