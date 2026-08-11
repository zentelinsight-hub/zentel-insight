import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPortalPageContent, getStudentDashboard, updateOwnProfileAvatar } from "./portalRepository";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn()
}));

vi.mock("../supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => ({
    from: supabaseMocks.from,
    rpc: supabaseMocks.rpc,
    storage: { from: supabaseMocks.storageFrom }
  }))
}));

function resolveTableQuery(state) {
  if (state.table === "portal_page_content") {
    return { data: null, error: new Error("Temporary content fetch failure") };
  }

  if (state.table === "enrolments") {
    return { data: [], error: null };
  }

  if (state.table === "student_program_preferences") {
    return {
      data: {
        id: "preference-1",
        user_id: "user-1",
        program_id: "program-1",
        track_id: null,
        selection_source: "self_selected",
        programs: { id: "program-1", slug: "graphic-design", title: "Graphic Design" }
      },
      error: null
    };
  }

  if (state.table === "timetable_entries") {
    return { data: null, error: new Error("Temporary timetable fetch failure") };
  }

  return { data: [], error: null };
}

function createQueryBuilder(table) {
  const state = { table };
  const builder = {
    select(value) {
      state.select = value;
      return builder;
    },
    eq(column, value) {
      state[column] = value;
      return builder;
    },
    in(column, value) {
      state[column] = value;
      return builder;
    },
    order() {
      return builder;
    },
    maybeSingle() {
      return Promise.resolve(resolveTableQuery(state));
    },
    then(resolve, reject) {
      return Promise.resolve(resolveTableQuery(state)).then(resolve, reject);
    }
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMocks.from.mockImplementation((table) => createQueryBuilder(table));
  supabaseMocks.rpc.mockResolvedValue({
    data: { id: "user-1", full_name: "Victor Udofiah", avatar_path: "user-1/avatar-new.png" },
    error: null
  });
  supabaseMocks.storageFrom.mockReturnValue({
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrl: vi.fn(async (path) => ({ data: { signedUrl: `https://assets.example/${path}` }, error: null }))
  });
});

describe("portal repository fallbacks", () => {
  it("falls back to local page content when the CMS query fails", async () => {
    const content = await getPortalPageContent("dashboard");

    expect(content.title).toBe("Student Dashboard");
    expect(content.page_slug).toBe("dashboard");
  });

  it("keeps the dashboard usable while an Admin programme assignment is pending", async () => {
    const dashboard = await getStudentDashboard("user-1");

    expect(dashboard.resolvedProgramme).toBeNull();
    expect(dashboard.programmeSource).toBe("none");
    expect(dashboard.needsProgrammeSelection).toBe(true);
    expect(dashboard.timetable).toEqual([]);
    expect(dashboard.upcomingClass).toBeNull();
    expect(supabaseMocks.from).not.toHaveBeenCalledWith("student_program_preferences");
  });

  it("uploads an owner-scoped avatar and confirms it through the profile RPC", async () => {
    const file = new File(["image"], "avatar.png", { type: "image/png" });
    const result = await updateOwnProfileAvatar({ userId: "user-1", file, previousPath: "user-1/avatar-old.png" });
    const storage = supabaseMocks.storageFrom.mock.results[0].value;

    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/avatar-.+\.png$/),
      file,
      expect.objectContaining({ contentType: "image/png", upsert: false })
    );
    expect(supabaseMocks.rpc).toHaveBeenCalledWith("update_own_profile_avatar", {
      next_avatar_path: expect.stringMatching(/^user-1\/avatar-.+\.png$/)
    });
    expect(storage.remove).toHaveBeenCalledWith(["user-1/avatar-old.png"]);
    expect(result.avatar_url).toBe("https://assets.example/user-1/avatar-new.png");
  });

  it("rejects unsupported profile pictures before Storage is called", async () => {
    const file = new File(["text"], "avatar.txt", { type: "text/plain" });
    await expect(updateOwnProfileAvatar({ userId: "user-1", file })).rejects.toThrow("JPEG, PNG or WebP");
    expect(supabaseMocks.storageFrom).not.toHaveBeenCalled();
  });
});
