import { EdgeFunctionError, invokeEdgeFunction } from "./edgeFunctionClient";

export function getLiveClassState(item, now = new Date()) {
  if (!item) return "scheduled";
  if (item.status === "cancelled" || item.status === "completed") return item.status;
  const start = new Date(item.scheduled_start);
  const end = new Date(item.scheduled_end);
  if (now >= start && now <= end) return "live";
  if (now > end) return "completed";
  return "scheduled";
}

export function canJoinLiveClass(item, now = new Date()) {
  if (!item || ["cancelled", "completed"].includes(getLiveClassState(item, now))) return false;
  const opensAt = item.join_opens_at
    ? new Date(item.join_opens_at)
    : new Date(new Date(item.scheduled_start).getTime() - 10 * 60 * 1000);
  const closesAt = item.join_closes_at ? new Date(item.join_closes_at) : new Date(item.scheduled_end);
  return now >= opensAt && now <= closesAt;
}

export async function requestLiveClassToken(classSessionId) {
  try {
    const data = await invokeEdgeFunction("create-live-class-token", {
      body: { classSessionId },
      unavailableMessage: "Live classes are temporarily unavailable. Please try again.",
      failureMessage: "Live-class access could not be prepared. Please try again."
    });
    if (!data?.ok) return { ok: false, message: data?.error || "Live-class access could not be prepared. Please try again." };
    return data;
  } catch (error) {
    if (error instanceof EdgeFunctionError) return { ok: false, message: error.message };
    return { ok: false, message: "Live-class access could not be prepared. Please try again." };
  }
}

export async function endLiveClass(classSessionId) {
  try {
    const data = await invokeEdgeFunction("end-live-class", {
      body: { classSessionId },
      unavailableMessage: "Live classes are temporarily unavailable. Please try again.",
      failureMessage: "Live class could not be ended. Please try again."
    });
    if (!data?.ok) return { ok: false, message: data?.error || "Live class could not be ended. Please try again." };
    return data;
  } catch (error) {
    if (error instanceof EdgeFunctionError) return { ok: false, message: error.message };
    return { ok: false, message: "Live class could not be ended. Please try again." };
  }
}
