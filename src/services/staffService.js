import { getSupabaseClient } from "./supabaseClient";
import { attachProfileAvatarUrl, PROFILE_AVATAR_BUCKET, PROFILE_AVATAR_MAX_BYTES } from "./portal/portalRepository";

const avatarTypes = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

async function getClient() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("Staff services are temporarily unavailable.");
  return supabase;
}

function first(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function getStaffWorkspace(userId) {
  if (!userId) throw new Error("A signed-in Staff account is required.");
  const supabase = await getClient();
  const [profileResult, staffResult, capabilityResult, caseResult, requestResult, historyResult, searchEventResult, notificationResult] = await Promise.all([
    supabase.from("profiles").select("id, portal_id, full_name, email, phone, avatar_path, account_status").eq("id", userId).maybeSingle(),
    supabase.from("staff_profiles").select("user_id, job_title, department, created_at").eq("user_id", userId).maybeSingle(),
    supabase.from("staff_capabilities").select("capability, enabled").eq("staff_user_id", userId).order("capability"),
    supabase.rpc("staff_get_active_case"),
    supabase.from("staff_requests").select("id, case_id, issue, requested_action, reason, status, admin_response, decided_at, created_at").eq("staff_user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("staff_support_cases").select("id, case_reference, status, issue, created_at, updated_at, closed_at").eq("owner_staff_id", userId).order("updated_at", { ascending: false }).limit(50),
    supabase.from("staff_search_events").select("id, result_count, blocked, created_at").eq("staff_user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("portal_notifications").select("id, title, message, notification_type, link_path, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
  ]);
  const failed = [profileResult, staffResult, capabilityResult, caseResult, requestResult, historyResult, searchEventResult, notificationResult].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const profile = await attachProfileAvatarUrl(profileResult.data);
  const activeCase = first(caseResult.data);
  let notes = [];
  let events = [];
  if (activeCase?.case_id) {
    const [notesResult, eventsResult] = await Promise.all([
      supabase.from("staff_case_notes").select("id, note, author_user_id, created_at").eq("case_id", activeCase.case_id).order("created_at"),
      supabase.from("staff_case_events").select("id, event_type, permitted_area, created_at").eq("case_id", activeCase.case_id).order("created_at", { ascending: false }).limit(30)
    ]);
    if (notesResult.error) throw notesResult.error;
    if (eventsResult.error) throw eventsResult.error;
    notes = notesResult.data || [];
    events = eventsResult.data || [];
  }
  return {
    profile,
    staffProfile: staffResult.data,
    capabilities: capabilityResult.data || [],
    activeCase,
    notes,
    events,
    requests: requestResult.data || [],
    caseHistory: historyResult.data || [],
    searchEvents: searchEventResult.data || [],
    notifications: notificationResult.data || []
  };
}

export async function searchStaffAccounts(query) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("staff_search_accounts", { search_text: String(query || "").trim() });
  if (error) throw error;
  return data || [];
}

export async function claimStaffCase({ candidateToken, issue, reason }) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("staff_claim_case", {
    candidate_token: candidateToken,
    case_issue: String(issue || "").trim(),
    case_reason: String(reason || "").trim()
  });
  if (error) throw error;
  return first(data);
}

export async function addStaffCaseNote(caseId, note) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("staff_add_case_note", { target_case_id: caseId, note_text: String(note || "").trim() });
  if (error) throw error;
  return data;
}

export async function closeStaffCase(caseId, resolution) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("staff_close_case", { target_case_id: caseId, resolution_note: String(resolution || "").trim() });
  if (error) throw error;
  return data;
}

export async function createStaffEscalation({ caseId, issue, requestedAction, reason }) {
  const supabase = await getClient();
  const { data, error } = await supabase.rpc("staff_create_escalation", {
    target_case_id: caseId,
    escalation_issue: String(issue || "").trim(),
    requested_action: String(requestedAction || "").trim(),
    escalation_reason: String(reason || "").trim()
  });
  if (error) throw error;
  return data;
}

export async function updateStaffAvatar({ userId, file, previousPath = "" }) {
  if (!file || !avatarTypes[file.type]) throw new Error("Choose a JPEG, PNG or WebP profile picture.");
  if (file.size > PROFILE_AVATAR_MAX_BYTES) throw new Error("Profile picture must be 3 MB or smaller.");
  const supabase = await getClient();
  const path = `${userId}/staff-avatar-${Date.now()}.${avatarTypes[file.type]}`;
  const { error: uploadError } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false
  });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId).select("id, portal_id, full_name, email, phone, avatar_path, account_status").single();
  if (error) {
    await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
    throw error;
  }
  if (previousPath && previousPath !== path) await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([previousPath]);
  return attachProfileAvatarUrl(data);
}
