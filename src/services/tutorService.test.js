import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelTutorLiveClass,
  saveTutorAssignment,
  saveTutorLiveClass,
  saveTutorResource,
  searchTutorStudents,
  updateTutorProfessionalProfile
} from "./tutorService";

const supabaseMocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSupabaseClient: vi.fn()
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: supabaseMocks.getSupabaseClient
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMocks.getSupabaseClient.mockResolvedValue({ rpc: supabaseMocks.rpc });
});

describe("Tutor service authorization contracts", () => {
  it("uses the server-side assigned Student search with bounded pagination", async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: [{
        id: "enrolment-1",
        user_id: "student-1",
        full_name: "Ada Student",
        account_status: "active",
        profile_completion: 80,
        program_id: "program-1",
        program_title: "Data Analysis",
        track_id: "track-1",
        track_name: "Professional",
        assignment_type: "official",
        total_count: 1
      }],
      error: null
    });

    const result = await searchTutorStudents({ query: "Ada", status: "active", assignment: "official", page: 2, pageSize: 100 });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("tutor_search_assigned_students", {
      search_text: "Ada",
      status_filter: "active",
      assignment_filter: "official",
      track_filter: null,
      page_limit: 50,
      page_offset: 50
    });
    expect(result.records[0]).toEqual(expect.objectContaining({ user_id: "student-1", assignment_type: "official" }));
    expect(result.records[0]).not.toHaveProperty("email");
    expect(result.records[0]).not.toHaveProperty("phone");
  });

  it("updates only the authenticated Tutor's professional fields", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: { user_id: "tutor-1" }, error: null });

    await updateTutorProfessionalProfile("tutor-1", {
      professional_bio: "  Tutor biography  ",
      qualifications: "BSc",
      teaching_experience: "Five years",
      specialisation: "Data",
      availability: "Weekdays",
      program_id: "unrelated-program",
      account_status: "active"
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith("tutor_update_professional_profile", {
      next_professional_bio: "Tutor biography",
      next_qualifications: "BSc",
      next_teaching_experience: "Five years",
      next_specialisation: "Data",
      next_availability: "Weekdays"
    });
  });

  it("does not let assignment or resource saves choose a programme in React", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: { id: "record-1" }, error: null });

    await saveTutorAssignment({
      title: "Final project",
      instructions: "Complete the project",
      maximum_score: 100,
      published: true,
      program_id: "unrelated-program"
    });
    await saveTutorResource({
      title: "Course guide",
      description: "Reference guide",
      resource_type: "guide",
      external_url: "https://example.com/guide",
      published: true,
      program_id: "unrelated-program"
    });

    const assignmentPayload = supabaseMocks.rpc.mock.calls[0][1];
    const resourcePayload = supabaseMocks.rpc.mock.calls[1][1];
    expect(assignmentPayload).not.toHaveProperty("program_id");
    expect(assignmentPayload).not.toHaveProperty("tutor_id");
    expect(resourcePayload).not.toHaveProperty("program_id");
    expect(resourcePayload).not.toHaveProperty("tutor_id");
  });

  it("surfaces a denied Student-directory request", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: new Error("Tutor access is not available") });

    await expect(searchTutorStudents()).rejects.toThrow("Tutor access is not available");
  });

  it("schedules external live classes through the authorized Tutor RPC", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: { id: "class-1" }, error: null });
    await saveTutorLiveClass({
      classroomId: "room-1",
      title: "Design review",
      provider: "google_meet",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      startsAt: "2026-08-08T16:00:00+01:00",
      endsAt: "2026-08-08T17:00:00+01:00",
      instructions: "Bring your project."
    });
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("tutor_save_live_class", expect.objectContaining({
      target_classroom_id: "room-1",
      platform_name: "google_meet",
      meeting_url: "https://meet.google.com/abc-defg-hij"
    }));
  });

  it("cancels a scheduled class through the server RPC", async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: { id: "class-1", status: "cancelled" }, error: null });
    await cancelTutorLiveClass("class-1");
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("tutor_cancel_live_class", { target_session_id: "class-1" });
  });
});
