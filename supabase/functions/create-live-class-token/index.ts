import { handleOptions, isAllowedOrigin, jsonResponse } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { getAuthenticatedUser, getUserAccountStatus, getUserRole, writeAuditLog } from "../_shared/security.ts";

function clean(value: unknown) {
  return String(value || "").trim();
}

async function isAuthorizedForSession(supabase: any, userId: string, role: string, session: any) {
  if (role === "admin") return true;
  if (role === "tutor") {
    const { data, error } = await supabase
      .from("tutor_program_assignments")
      .select("id, track_id")
      .eq("tutor_id", userId)
      .eq("program_id", session.program_id)
      .eq("active", true);
    if (error) throw error;
    return (data || []).some((assignment: any) => !assignment.track_id || !session.track_id || assignment.track_id === session.track_id);
  }

  const { data: enrolments, error: enrolmentError } = await supabase
    .from("enrolments")
    .select("id, program_level_id")
    .eq("user_id", userId)
    .eq("program_id", session.program_id)
    .eq("status", "active");
  if (enrolmentError) throw enrolmentError;
  if ((enrolments || []).some((enrolment: any) => !session.track_id || enrolment.program_level_id === session.track_id)) return true;

  const { data: active, error: activeError } = await supabase
    .from("enrolments")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);
  if (activeError) throw activeError;
  if (active?.length) return false;

  const { data: preference, error: preferenceError } = await supabase
    .from("student_program_preferences")
    .select("track_id")
    .eq("user_id", userId)
    .eq("program_id", session.program_id)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  return Boolean(preference && (!session.track_id || !preference.track_id || preference.track_id === session.track_id));
}

async function createDailyToken(session: any, isHost: boolean, userId: string) {
  const apiKey = Deno.env.get("DAILY_API_KEY");
  if (!apiKey) {
    return { configured: false, error: "Daily video provider credentials are not configured." };
  }
  if (!session.provider_room_id || !session.provider_room_url) {
    return { configured: false, error: "This live class does not have a provider room configured yet." };
  }

  const response = await fetch("https://api.daily.co/v1/meeting-tokens", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      properties: {
        room_name: session.provider_room_id,
        user_id: userId,
        is_owner: isHost,
        enable_screenshare: isHost,
        start_cloud_recording: false
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.token) {
    throw new Error(payload?.error || payload?.info || "Live-class token could not be created.");
  }

  return { configured: true, token: payload.token, roomUrl: session.provider_room_url };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return handleOptions(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405, request);
  if (!isAllowedOrigin(request)) return jsonResponse({ error: "Origin is not allowed." }, 403, request);

  try {
    const supabase = createServiceClient();
    const auth = await getAuthenticatedUser(request, supabase);
    if (!auth.user) return jsonResponse({ ok: false, error: auth.error }, 401, request);

    const body = await request.json().catch(() => ({}));
    const classSessionId = clean(body.classSessionId);
    if (!classSessionId) return jsonResponse({ ok: false, error: "A live class session is required." }, 400, request);

    const { data: session, error: sessionError } = await supabase
      .from("live_class_sessions")
      .select("*")
      .eq("id", classSessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) return jsonResponse({ ok: false, error: "Live class was not found." }, 404, request);
    if (session.status === "cancelled" || session.status === "completed") {
      return jsonResponse({ ok: false, error: "This live class is not open for joining." }, 403, request);
    }

    const now = new Date();
    const opensAt = new Date(session.join_opens_at || new Date(new Date(session.scheduled_start).getTime() - 10 * 60 * 1000));
    const closesAt = new Date(session.join_closes_at || session.scheduled_end);
    if (now < opensAt || now > closesAt) {
      return jsonResponse({ ok: false, error: "Join Class is not available for this session yet." }, 403, request);
    }

    const role = await getUserRole(supabase, auth.user.id);
    const accountStatus = await getUserAccountStatus(supabase, auth.user.id);
    if (accountStatus !== "active") {
      return jsonResponse({ ok: false, error: "Your account is inactive. Contact Zentel Insight support for activation." }, 403, request);
    }

    const authorized = await isAuthorizedForSession(supabase, auth.user.id, role, session);
    if (!authorized) return jsonResponse({ ok: false, error: "You are not authorized for this live class." }, 403, request);

    const isHost = role === "admin" || (role === "tutor" && session.tutor_id === auth.user.id);
    if (session.provider !== "daily") {
      return jsonResponse({ ok: false, error: "The configured live-class provider is not supported by this function." }, 501, request);
    }

    const tokenResult = await createDailyToken(session, isHost, auth.user.id);
    if (!tokenResult.configured) {
      return jsonResponse({ ok: false, error: tokenResult.error }, 501, request);
    }

    await supabase.from("live_class_attendance").insert({
      class_session_id: session.id,
      user_id: auth.user.id,
      attendance_status: "joined"
    });

    await writeAuditLog(supabase, {
      actorUserId: auth.user.id,
      action: isHost ? "live_class_host_token_created" : "live_class_participant_token_created",
      targetTable: "live_class_sessions",
      targetId: session.id
    });

    return jsonResponse({
      ok: true,
      provider: "daily",
      token: tokenResult.token,
      roomUrl: tokenResult.roomUrl,
      permission: isHost ? "host" : "participant"
    }, 200, request);
  } catch (error) {
    console.error("create-live-class-token", (error as Error).message);
    return jsonResponse({ ok: false, error: "Live-class access could not be prepared." }, 400, request);
  }
});
