import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPortalPageContent, getStudentDashboard } from "./portalRepository";

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn()
}));

vi.mock("../supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => supabaseMocks)
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
  supabaseMocks.from.mockImplementation((table) => createQueryBuilder(table));
});

describe("portal repository fallbacks", () => {
  it("falls back to local page content when the CMS query fails", async () => {
    const content = await getPortalPageContent("dashboard");

    expect(content.title).toBe("Student Dashboard");
    expect(content.page_slug).toBe("dashboard");
  });

  it("keeps the dashboard usable when a saved programme timetable query fails", async () => {
    const dashboard = await getStudentDashboard("user-1");

    expect(dashboard.resolvedProgramme.title).toBe("Graphic Design");
    expect(dashboard.programmeSource).toBe("self_selected");
    expect(dashboard.needsProgrammeSelection).toBe(false);
    expect(dashboard.timetable).toEqual([]);
    expect(dashboard.upcomingClass).toBeNull();
  });
});
