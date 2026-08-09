/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProgramChatPanel from "./ProgramChatPanel";

const chatMocks = vi.hoisted(() => ({
  ensureProgramClassroom: vi.fn(),
  getActiveProgramChatCall: vi.fn(),
  getProgramChatMessages: vi.fn(),
  getProgramChatRooms: vi.fn(),
  getProgramChatUnreadCounts: vi.fn(),
  joinProgramChat: vi.fn(),
  manageProgramChatCall: vi.fn(),
  markProgramChatRead: vi.fn(),
  moderateProgramChatMessage: vi.fn(),
  sendProgramChatMessage: vi.fn(),
  subscribeToProgramChat: vi.fn(),
  toggleProgramChatReaction: vi.fn(),
  validateChatImage: vi.fn()
}));

vi.mock("../context/authHooks", () => ({
  useAuth: () => ({
    user: { id: "student-1", email: "ada@example.com" },
    profile: { id: "student-1", full_name: "Ada Student" }
  })
}));

vi.mock("../services/chatService", () => ({
  CHAT_MESSAGE_MAX_LENGTH: 4000,
  ...chatMocks
}));

beforeEach(() => {
  chatMocks.ensureProgramClassroom.mockResolvedValue({ id: "room-1", title: "Data Analysis", program_title: "Data Analysis", joined: true });
  chatMocks.getActiveProgramChatCall.mockResolvedValue(null);
  chatMocks.getProgramChatMessages.mockResolvedValue([]);
  chatMocks.getProgramChatRooms.mockResolvedValue([]);
  chatMocks.getProgramChatUnreadCounts.mockResolvedValue({ "room-1": 0 });
  chatMocks.markProgramChatRead.mockResolvedValue(true);
  chatMocks.subscribeToProgramChat.mockResolvedValue(() => {});
  chatMocks.sendProgramChatMessage.mockResolvedValue({
    id: "message-1",
    room_id: "room-1",
    sender_id: "student-1",
    sender_role: "student",
    body: "Hello Tutor",
    created_at: "2026-07-29T10:00:00Z",
    profiles: { full_name: "Ada Student" }
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Programme Classroom chat", () => {
  it("uses a hidden image input and renders the professional empty state", async () => {
    const { container } = render(<ProgramChatPanel programId="program-1" trackId="track-1" />);

    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
    expect(screen.getByText("Start the conversation with your tutor and programme classmates.")).toBeInTheDocument();
    expect(screen.getByText("Live chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach image" })).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toHaveClass("sr-only");
    expect(container.querySelector(".chat-composer-row")).toContainElement(screen.getByPlaceholderText("Message your classroom"));
    expect(container.querySelector(".chat-composer-row")).toContainElement(screen.getByRole("button", { name: "Send message" }));
    expect(container.querySelector(".chat-message-list")?.parentElement).toBe(container.querySelector(".chat-composer")?.parentElement);
    expect(container.querySelector(".chat-thread")?.lastElementChild).toBe(container.querySelector(".chat-composer"));
    expect(screen.queryByText(/Choose File/i)).not.toBeInTheDocument();
  });

  it("sends with Enter while keeping Shift+Enter for a new line", async () => {
    render(<ProgramChatPanel programId="program-1" trackId="track-1" />);
    const messageBox = await screen.findByPlaceholderText("Message your classroom");
    fireEvent.change(messageBox, { target: { value: "Hello Tutor" } });
    fireEvent.keyDown(messageBox, { key: "Enter", shiftKey: true });
    expect(chatMocks.sendProgramChatMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(messageBox, { key: "Enter", shiftKey: false });

    await waitFor(() => expect(chatMocks.sendProgramChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      roomId: "room-1",
      senderId: "student-1",
      body: "Hello Tutor"
    })));
  });

  it("resolves classroom access directly and keeps the Back button visible", async () => {
    chatMocks.getProgramChatRooms.mockResolvedValue([
      { id: "room-1", classroom_id: "classroom-1", title: "Data Analysis", program_title: "Data Analysis", joined: true }
    ]);

    render(
      <MemoryRouter>
        <ProgramChatPanel audience="student" standalone backTo="/portal/classroom" />
      </MemoryRouter>
    );

    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
    expect(chatMocks.getProgramChatRooms).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Back to classroom" })).toHaveAttribute("href", "/portal/classroom");
  });
});
