import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStudentFeed } from "./portalRepository";

const mocks = vi.hoisted(() => ({
  invokeEdgeFunction: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  storageFrom: vi.fn()
}));

vi.mock("../edgeFunctionClient", () => ({ invokeEdgeFunction: mocks.invokeEdgeFunction }));
vi.mock("../supabaseClient", () => ({
  getSupabaseClient: vi.fn(async () => ({ rpc: mocks.rpc, from: mocks.from, storage: { from: mocks.storageFrom } }))
}));

function technologyQuery(items) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => Promise.resolve({ data: items, error: null })
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.invokeEdgeFunction.mockResolvedValue({ ok: true });
  mocks.rpc.mockResolvedValue({
    data: [{
      id: "post-1",
      user_id: "student-1",
      body: "Authoritative post",
      image_path: null,
      published_at: "2026-08-09T10:00:00.000Z",
      author_name: "Victor Udofiah",
      author_avatar_path: "student-1/avatar.jpg"
    }],
    error: null
  });
  mocks.from.mockImplementation(() => technologyQuery([{
    id: "video-1",
    source_type: "youtube",
    source_name: "TechVerse Daily",
    source_icon_url: "https://www.youtube.com/favicon.ico",
    source_domain: "youtube.com",
    title: "Technology update",
    summary: "A useful video",
    category: "Technology Video",
    image_url: "https://i.ytimg.com/vi/example/hqdefault.jpg",
    external_url: "https://www.youtube.com/watch?v=example",
    published_at: "2026-08-09T11:00:00.000Z"
  }]));
  mocks.storageFrom.mockReturnValue({
    createSignedUrl: vi.fn(async (path) => ({ data: { signedUrl: `https://assets.example/${path}` }, error: null }))
  });
});

describe("Student feed identity and timeline", () => {
  it("hydrates the authoritative author and orders every content type by publication time", async () => {
    const feed = await getStudentFeed();

    expect(mocks.rpc).toHaveBeenCalledWith("get_student_feed_posts", {
      page_size: 100,
      before_published_at: null,
      before_post_id: null
    });
    expect(feed.map((item) => item.id)).toEqual(["technology-video-1", "student-post-1"]);
    expect(feed[1]).toMatchObject({
      author: "Victor Udofiah",
      avatarUrl: "https://assets.example/student-1/avatar.jpg",
      publishedAt: "2026-08-09T10:00:00.000Z"
    });
    expect(feed[1].author).not.toBe("Student");
    expect(feed[0].sourceIconUrl).toBe("https://www.youtube.com/favicon.ico");
    expect(feed[0].imageUrl).toContain("i.ytimg.com");
  });
});
