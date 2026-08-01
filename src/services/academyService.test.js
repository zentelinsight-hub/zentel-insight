import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn()
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    from: mocks.from,
    auth: { getUser: mocks.getUser },
    storage: { from: vi.fn() }
  }))
}));

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
  mocks.getUser.mockReset();
});

describe("academy service contracts", () => {
  it("loads the Student academy dashboard through the scoped RPC", async () => {
    const snapshot = { classroom: { id: "classroom-1" }, modules: [], assessments: [] };
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    const { getStudentAcademyDashboard } = await import("./academyService.js");

    await expect(getStudentAcademyDashboard()).resolves.toEqual(snapshot);
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_academic_dashboard");
  });

  it("submits quiz answers with a caller idempotency key", async () => {
    mocks.rpc.mockResolvedValue({ data: { idempotent: false, autoScore: 8 }, error: null });
    const { submitStudentQuiz } = await import("./academyService.js");
    const answers = { "question-1": "option-2" };

    await submitStudentQuiz({ assessmentId: "assessment-1", answers, requestId: "request-1" });

    expect(mocks.rpc).toHaveBeenCalledWith("submit_assessment_attempt", {
      target_assessment_id: "assessment-1",
      submitted_answers: answers,
      attempt_request_id: "request-1"
    });
  });

  it("requires a reason when saving a grade through the server RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "grade-1", status: "published" }, error: null });
    const { saveSubmissionGrade } = await import("./academyService.js");

    await saveSubmissionGrade({ submissionId: "submission-1", score: 82, feedback: "Good work", status: "published", reason: "Initial grading" });

    expect(mocks.rpc).toHaveBeenCalledWith("save_assessment_grade", {
      target_submission_id: "submission-1",
      target_score: 82,
      target_feedback: "Good work",
      target_status: "published",
      change_reason: "Initial grading"
    });
  });

  it("keeps Admin classroom assignment behind the verified RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { assignTutorClassroom } = await import("./academyService.js");

    await assignTutorClassroom({ tutorId: "tutor-1", classroomId: "classroom-1", role: "lead_tutor", active: true, reason: "New cohort" });

    expect(mocks.rpc).toHaveBeenCalledWith("admin_assign_tutor_classroom", {
      target_tutor_id: "tutor-1",
      target_classroom_id: "classroom-1",
      target_role: "lead_tutor",
      assignment_active: true,
      change_reason: "New cohort"
    });
  });
});
