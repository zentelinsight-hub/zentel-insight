import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  getAuthenticatedUser,
  getUserAccountStatus,
  getUserRole,
  isVerifiedAdminSession,
  writeAuditLog
} from "../_shared/security.ts";

function clean(value: unknown, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

async function getRoomMembership(supabase: any, roomId: string, userId: string) {
  const { data, error } = await supabase
    .from("program_chat_members")
    .select("id, role, active, left_at, program_chat_rooms(id, program_id, track_id, title, active)")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function isAssignedTutor(supabase: any, userId: string, room: any) {
  const { data, error } = await supabase
    .from("tutor_program_assignments")
    .select("id, track_id")
    .eq("tutor_id", userId)
    .eq("program_id", room.program_id)
    .eq("active", true);
  if (error) throw error;
  return (data || []).some((item: any) => !item.track_id || !room.track_id || item.track_id === room.track_id);
}

async function getDisplayName(supabase: any, userId: string, role: string) {
  const { data, error } = await supabase.from("profiles").select("full_name, title").eq("id", userId).maybeSingle();
  if (error) throw error;
  const firstName = clean(data?.full_name || (role === "tutor" ? "Tutor" : role === "admin" ? "Admin" : "Student"), 80).split(/\s+/)[0];
  if (role === "admin") return "Admin";
  if (role === "tutor") return `${clean(data?.title || "Tutor", 12)} ${firstName}`.trim();
  return firstName || "Student";
}

async function createRoom(roomId: string, callId: string) {
  const apiKey = Deno.env.get("DAILY_API_KEY") || "";
  if (!apiKey) throw new Error("Voice calling is temporarily unavailable.");
  const roomName = `zentel-voice-${roomId}-${callId}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 110);
  const response = await fetch("https://api.daily.co/v1/rooms", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: roomName,
      privacy: "private",
      properties: {
        enable_chat: false,
        enable_screenshare: false,
        start_video_off: true,
        enable_prejoin_ui: true,
        exp: Math.floor(Date.now() / 1000) + 4 * 60 * 60
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.url) throw new Error("The voice room could not be prepared.");
  return { roomName, roomUrl: payload.url };
}

async function createToken(input: { roomName: string; userId: string; userName: string; owner: boolean }) {
  const apiKey = Deno.env.get("DAILY_API_KEY") || "";
  if (!apiKey) throw new Error("Voice calling is temporarily unavailable.");
  const response = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      properties: {
        room_name: input.roomName,
        user_id: input.userId,
        user_name: input.userName,
        is_owner: input.owner,
        start_video_off: true,
        enable_screenshare: false,
        exp: Math.floor(Date.now() / 1000) + 60 * 60
      }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.token) throw new Error("Voice-call access could not be prepared.");
  return payload.token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ ok: false, error: "Origin is not allowed." }, 403, request);

  try {
    const supabase = createServiceClient();
    const auth = await getAuthenticatedUser(request, supabase);
    if (!auth.user) return jsonResponse({ ok: false, error: auth.error }, 401, request);

    const role = await getUserRole(supabase, auth.user.id);
    const accountStatus = await getUserAccountStatus(supabase, auth.user.id);
    if (accountStatus !== "active") return jsonResponse({ ok: false, error: "Your account must be active to use classroom calls." }, 403, request);
    const verifiedAdmin = role === "admin" && await isVerifiedAdminSession(supabase, auth.user.id, auth.sessionId);
    if (role === "admin" && !verifiedAdmin) return jsonResponse({ ok: false, error: "Admin security verification is required." }, 403, request);

    const body = await request.json().catch(() => ({}));
    const action = clean(body.action, 24);
    const roomId = clean(body.roomId, 64);
    const callId = clean(body.callId, 64);
    if (!roomId) return jsonResponse({ ok: false, error: "A classroom is required." }, 400, request);

    const membership = role === "admin" ? null : await getRoomMembership(supabase, roomId, auth.user.id);
    const room = membership?.program_chat_rooms || (await supabase.from("program_chat_rooms").select("id, program_id, track_id, title, active").eq("id", roomId).maybeSingle()).data;
    if (!room?.active) return jsonResponse({ ok: false, error: "This classroom is not available." }, 404, request);
    if (role !== "admin" && (!membership?.active || membership.left_at)) {
      return jsonResponse({ ok: false, error: "Join the programme chat before joining a voice call." }, 403, request);
    }

    const tutorAuthorized = role === "tutor" && await isAssignedTutor(supabase, auth.user.id, room);
    const canHost = verifiedAdmin || tutorAuthorized;
    const displayName = await getDisplayName(supabase, auth.user.id, role);

    if (action === "start") {
      if (!canHost) return jsonResponse({ ok: false, error: "Only the assigned Tutor or verified Admin can start a voice call." }, 403, request);
      const { data: existing } = await supabase.from("chat_calls").select("*").eq("room_id", roomId).in("status", ["ringing", "live"]).maybeSingle();
      let call = existing;
      if (!call) {
        const provisionalId = crypto.randomUUID();
        const providerRoom = await createRoom(roomId, provisionalId);
        const { data, error } = await supabase.from("chat_calls").insert({
          id: provisionalId,
          room_id: roomId,
          started_by: auth.user.id,
          call_type: "voice",
          provider: "daily",
          provider_room_name: providerRoom.roomName,
          provider_room_url: providerRoom.roomUrl,
          status: "live",
          started_at: new Date().toISOString()
        }).select("*").single();
        if (error) throw error;
        call = data;
        await supabase.from("program_chat_messages").insert({
          room_id: roomId,
          sender_id: null,
          message_type: "system",
          body: `${displayName} started a voice call`
        });
      }
      const token = await createToken({ roomName: call.provider_room_name, userId: auth.user.id, userName: displayName, owner: true });
      await supabase.from("chat_call_participants").upsert({ call_id: call.id, user_id: auth.user.id, joined_at: new Date().toISOString(), left_at: null, role: role === "admin" ? "moderator" : "host" }, { onConflict: "call_id,user_id" });
      await writeAuditLog(supabase, { actorUserId: auth.user.id, action: "classroom_voice_call_started", targetTable: "chat_calls", targetId: call.id, metadata: { roomId } });
      return jsonResponse({ ok: true, call: { id: call.id, status: call.status }, roomUrl: call.provider_room_url, token, permission: role === "admin" ? "moderator" : "host" }, 200, request);
    }

    const { data: call, error: callError } = await supabase.from("chat_calls").select("*").eq("id", callId).eq("room_id", roomId).maybeSingle();
    if (callError) throw callError;
    if (!call) return jsonResponse({ ok: false, error: "The voice call was not found." }, 404, request);

    if (action === "join") {
      if (!["ringing", "live"].includes(call.status)) return jsonResponse({ ok: false, error: "This voice call has ended." }, 403, request);
      const owner = canHost;
      const token = await createToken({ roomName: call.provider_room_name, userId: auth.user.id, userName: displayName, owner });
      await supabase.from("chat_call_participants").upsert({ call_id: call.id, user_id: auth.user.id, joined_at: new Date().toISOString(), left_at: null, role: owner ? (role === "admin" ? "moderator" : "host") : "participant" }, { onConflict: "call_id,user_id" });
      return jsonResponse({ ok: true, call: { id: call.id, status: call.status }, roomUrl: call.provider_room_url, token, permission: owner ? "host" : "participant" }, 200, request);
    }

    if (action === "leave") {
      await supabase.from("chat_call_participants").update({ left_at: new Date().toISOString() }).eq("call_id", call.id).eq("user_id", auth.user.id);
      return jsonResponse({ ok: true }, 200, request);
    }

    if (action === "end") {
      if (!canHost) return jsonResponse({ ok: false, error: "Only the assigned Tutor or verified Admin can end this voice call." }, 403, request);
      const endedAt = new Date().toISOString();
      await Promise.all([
        supabase.from("chat_calls").update({ status: "ended", ended_at: endedAt, updated_at: endedAt }).eq("id", call.id),
        supabase.from("chat_call_participants").update({ left_at: endedAt }).eq("call_id", call.id).is("left_at", null)
      ]);
      await supabase.from("program_chat_messages").insert({ room_id: roomId, sender_id: null, message_type: "system", body: "Voice call ended" });
      await writeAuditLog(supabase, { actorUserId: auth.user.id, action: "classroom_voice_call_ended", targetTable: "chat_calls", targetId: call.id, metadata: { roomId } });
      return jsonResponse({ ok: true }, 200, request);
    }

    return jsonResponse({ ok: false, error: "Select a valid voice-call action." }, 400, request);
  } catch (error) {
    console.error("create-chat-voice-call", (error as Error).message);
    return jsonResponse({ ok: false, error: "Voice-call access could not be prepared. Please try again." }, 400, request);
  }
});
