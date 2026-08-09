import { beforeEach, describe, expect, it, vi } from "vitest";
import { findAdminAccount, getAdminDashboardData, getAdminPaymentDetails, searchAdminPayments, searchAdminStudents, searchAdminTutors, setAccountStatus } from "./adminService";

const serviceMocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  invokeEdgeFunction: vi.fn()
}));

vi.mock("./supabaseClient", () => ({
  getSupabaseClient: serviceMocks.getSupabaseClient
}));

vi.mock("./edgeFunctionClient", () => ({
  invokeEdgeFunction: serviceMocks.invokeEdgeFunction
}));

vi.mock("./portal/portalRepository", () => ({
  attachProfileAvatarUrl: (profile) => profile,
  PROFILE_AVATAR_BUCKET: "profile-avatars",
  PROFILE_AVATAR_MAX_BYTES: 3 * 1024 * 1024
}));

function createSupabaseMock(rowsByTable = {}, rpcResponse = { data: [], error: null }) {
  const queries = [];
  const from = vi.fn((table) => {
    const state = { table, select: "" };
    queries.push(state);
    const builder = {
      select(value) {
        state.select = value;
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      then(resolve, reject) {
        const response = rowsByTable[table] || { data: [], error: null };
        return Promise.resolve(response).then(resolve, reject);
      }
    };
    return builder;
  });

  const rpc = vi.fn(async () => rpcResponse);
  return { client: { from, rpc }, from, rpc, queries };
}

beforeEach(() => {
  serviceMocks.getSupabaseClient.mockReset();
  serviceMocks.invokeEdgeFunction.mockReset();
});

describe("Admin dashboard data loading", () => {
  it("loads only programme choices for the exact Account Lookup route", async () => {
    const supabase = createSupabaseMock();
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    await getAdminDashboardData("accounts");

    expect(supabase.from.mock.calls.map(([table]) => table)).toEqual(["programs"]);
  });

  it("uses the verified exact account lookup service without loading a directory", async () => {
    serviceMocks.invokeEdgeFunction.mockResolvedValue({
      ok: true,
      account: { profile: { id: "student-1", portal_id: "ZIS-ABCD-2345" }, role: "student" }
    });

    const result = await findAdminAccount({ searchType: "portal_id", value: "ZIS-ABCD-2345", accountType: "student" });

    expect(serviceMocks.invokeEdgeFunction).toHaveBeenCalledWith("admin-find-account", expect.objectContaining({
      body: { searchType: "portal_id", value: "ZIS-ABCD-2345", accountType: "student" }
    }));
    expect(result.account.profile.portal_id).toBe("ZIS-ABCD-2345");
    expect(serviceMocks.getSupabaseClient).not.toHaveBeenCalled();
  });

  it("loads only People dependencies for the People route", async () => {
    const supabase = createSupabaseMock();
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    const data = await getAdminDashboardData("people");

    expect(supabase.from.mock.calls.map(([table]) => table)).toEqual([
      "profiles",
      "user_roles",
      "tutor_profiles",
      "tutor_program_assignments",
      "programs",
      "enrolments"
    ]);
    expect(data.students).toEqual([]);
    expect(data.tutors).toEqual([]);
  });

  it("uses explicit timetable relationships and preserves the selected track", async () => {
    const supabase = createSupabaseMock({
      timetable_entries: {
        data: [{
          id: "entry-1",
          program_level: { id: "level-1", level_name: "Beginner" },
          track_level: { id: "level-2", level_name: "Advanced" }
        }],
        error: null
      }
    });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    const data = await getAdminDashboardData("timetable");
    const timetableQuery = supabase.queries.find((query) => query.table === "timetable_entries");

    expect(timetableQuery.select).toContain("timetable_entries_program_level_id_fkey");
    expect(timetableQuery.select).toContain("timetable_entries_track_id_fkey");
    expect(data.timetable[0].program_levels.level_name).toBe("Advanced");
  });

  it("keeps the Student directory available when an optional people dependency fails", async () => {
    const supabase = createSupabaseMock({
      profiles: { data: [{ id: "student-1", full_name: "Student One", account_status: "active" }], error: null },
      user_roles: { data: [{ user_id: "student-1", role: "student" }], error: null },
      programs: { data: [], error: new Error("temporary programmes failure") },
      enrolments: {
        data: [{
          id: "enrolment-1",
          user_id: "student-1",
          program_id: "program-1",
          program_level_id: "level-1",
          status: "active",
          programs: { title: "Data Analysis" },
          program_levels: { level_name: "Professional" }
        }],
        error: null
      }
    });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    const data = await getAdminDashboardData("students");

    expect(data.students).toHaveLength(1);
    expect(data.students[0]).toMatchObject({
      id: "student-1",
      program_title: "Data Analysis",
      level_name: "Professional",
      assignment_status: "assigned"
    });
  });

  it("loads certificate programme details through the enrolment relationship", async () => {
    const supabase = createSupabaseMock({
      profiles: { data: [{ id: "user-1", full_name: "Learner" }], error: null },
      certificates: {
        data: [{
          id: "certificate-1",
          user_id: "user-1",
          enrolments: {
            programs: { id: "program-1", title: "Data Analysis" },
            program_levels: { id: "level-1", level_name: "Professional" }
          }
        }],
        error: null
      }
    });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    const data = await getAdminDashboardData("certificates");
    const certificateQuery = supabase.queries.find((query) => query.table === "certificates");

    expect(certificateQuery.select).toContain("enrolments(id, programs");
    expect(data.certificates[0].profiles.full_name).toBe("Learner");
    expect(data.certificates[0].programs.title).toBe("Data Analysis");
    expect(data.certificates[0].program_levels.level_name).toBe("Professional");
  });

  it("loads Student records from the verified Admin database search", async () => {
    const supabase = createSupabaseMock({}, {
      data: [{ id: "student-1", role_name: "student", full_name: "Student One", total_count: 1 }],
      error: null
    });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    const result = await searchAdminStudents({ status: "suspended", assignment: "assigned" });

    expect(result.records[0]).toMatchObject({ id: "student-1", role: "student" });
    expect(supabase.rpc).toHaveBeenCalledWith("admin_search_people_v2", expect.objectContaining({
      role_filter: "student",
      status_filter: "suspended",
      assignment_filter: "assigned"
    }));
    expect(serviceMocks.invokeEdgeFunction).not.toHaveBeenCalled();
  });

  it("loads Tutor records from the verified Admin database search", async () => {
    const supabase = createSupabaseMock({}, {
      data: [{ id: "tutor-1", user_id: "tutor-1", role_name: "tutor", full_name: "Tutor One", total_count: 1 }],
      error: null
    });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    const result = await searchAdminTutors({ filter: "suspended" });

    expect(result.records[0]).toMatchObject({ user_id: "tutor-1", role: "tutor" });
    expect(supabase.rpc).toHaveBeenCalledWith("admin_search_people_v2", expect.objectContaining({
      role_filter: "tutor",
      status_filter: "suspended"
    }));
    expect(serviceMocks.invokeEdgeFunction).not.toHaveBeenCalled();
  });

  it("confirms an account status change against the same immutable user UUID", async () => {
    const userId = "b7cb76b5-d1db-4b45-b778-d7ed7195cb95";
    const supabase = createSupabaseMock({}, { data: { id: userId, account_status: "restricted" }, error: null });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    await expect(setAccountStatus({ userId, status: "restricted", reason: "Admin security review" })).resolves.toMatchObject({ id: userId, account_status: "restricted" });
    expect(supabase.rpc).toHaveBeenCalledWith("admin_set_account_status", {
      target_user_id: userId,
      next_status: "restricted",
      status_reason: "Admin security review"
    });
  });

  it("refuses non-UUID account identifiers before calling Supabase", async () => {
    await expect(setAccountStatus({ userId: "1", status: "active" })).rejects.toThrow("Choose a valid account");
    expect(serviceMocks.getSupabaseClient).not.toHaveBeenCalled();
  });

  it("searches authoritative payments through the paginated Admin RPC", async () => {
    const supabase = createSupabaseMock({}, {
      data: [{ id: "payment-1", reference: "ZI-REF-100", exact_reference_match: true, total_count: 26 }],
      error: null
    });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    const result = await searchAdminPayments({ query: "ZI-REF-100", status: "success", page: 2, pageSize: 25 });

    expect(supabase.rpc).toHaveBeenCalledWith("admin_search_payments", {
      search_text: "ZI-REF-100",
      status_filter: "success",
      page_number: 2,
      page_size: 25
    });
    expect(result).toMatchObject({ total: 26, page: 2, pageCount: 2 });
    expect(result.records[0].exact_reference_match).toBe(true);
  });

  it("loads one read-only Payment Details projection by immutable payment UUID", async () => {
    const details = { id: "payment-1", reference: "ZI-REF-100", transactions: [], fulfilments: [] };
    const supabase = createSupabaseMock({}, { data: details, error: null });
    serviceMocks.getSupabaseClient.mockResolvedValue(supabase.client);

    await expect(getAdminPaymentDetails("payment-1")).resolves.toEqual(details);
    expect(supabase.rpc).toHaveBeenCalledWith("admin_get_payment_details", { payment_id: "payment-1" });
  });
});
