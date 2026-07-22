import { useState } from "react";
import { ExternalLink, Video } from "lucide-react";
import { canJoinLiveClass, endLiveClass, getLiveClassState, requestLiveClassToken } from "../services/liveClassService";
import { formatDateTime } from "../utils/format";

function getProgramName(item) {
  return item?.programs?.title || item?.program_title || "Programme";
}

function getTutorName(item) {
  const profile = item?.profiles;
  if (!profile) return "";
  const firstName = String(profile.full_name || "").trim().split(/\s+/)[0] || "Tutor";
  return `${profile.title || ""} ${firstName}`.trim();
}

export default function LiveClassCards({ sessions = [], emptyMessage = "No live classes have been scheduled yet.", audience = "student", onChanged }) {
  const [status, setStatus] = useState({ id: "", type: "", message: "" });
  const [loadingId, setLoadingId] = useState("");
  const hostView = audience === "tutor" || audience === "admin";

  async function joinClass(session) {
    setLoadingId(session.id);
    setStatus({ id: session.id, type: "", message: "" });
    try {
      const result = await requestLiveClassToken(session.id);
      if (!result.ok) {
        setStatus({ id: session.id, type: "warning", message: result.message || "Live-class access is not ready." });
        return;
      }
      const separator = result.roomUrl.includes("?") ? "&" : "?";
      window.open(`${result.roomUrl}${separator}t=${encodeURIComponent(result.token)}`, "_blank", "noopener,noreferrer");
      setStatus({ id: session.id, type: "success", message: `Opening live class as ${result.permission}.` });
      onChanged?.();
    } catch (error) {
      setStatus({ id: session.id, type: "warning", message: error.message || "Live-class access could not be prepared." });
    } finally {
      setLoadingId("");
    }
  }

  async function endClass(session) {
    setLoadingId(`end:${session.id}`);
    setStatus({ id: session.id, type: "", message: "" });
    try {
      const result = await endLiveClass(session.id);
      if (!result.ok) {
        setStatus({ id: session.id, type: "warning", message: result.message || "Live class could not be ended." });
        return;
      }
      setStatus({ id: session.id, type: "success", message: "Live class ended." });
      onChanged?.();
    } catch (error) {
      setStatus({ id: session.id, type: "warning", message: error.message || "Live class could not be ended." });
    } finally {
      setLoadingId("");
    }
  }

  function getJoinLabel(session, state) {
    if (!hostView) return "Join Class";
    if (state === "live" || session.status === "live") return audience === "admin" ? "Join as Host" : "Join as Host";
    return "Start Class";
  }

  if (!sessions.length) {
    return (
      <div className="notice-card portal-state-card">
        <h2>No live classes</h2>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="portal-list">
      {sessions.map((session) => {
        const state = getLiveClassState(session);
        const joinable = canJoinLiveClass(session);
        return (
          <article className="portal-record-card" key={session.id}>
            <div>
              <p className="eyebrow">{getProgramName(session)} | {session.timezone || "Africa/Lagos"}</p>
              <h3>{session.title}</h3>
              <p>{session.description || "Live online class session."}</p>
            </div>
            <dl className="portal-mini-details">
              <div><dt>Starts</dt><dd>{formatDateTime(session.scheduled_start)}</dd></div>
              <div><dt>Ends</dt><dd>{formatDateTime(session.scheduled_end)}</dd></div>
              <div><dt>Status</dt><dd>{state}</dd></div>
              {getTutorName(session) ? <div><dt>Tutor</dt><dd>{getTutorName(session)}</dd></div> : null}
              <div><dt>Provider</dt><dd>{session.provider || "daily"}</dd></div>
            </dl>
            {joinable ? (
              <button className="button button-primary" type="button" onClick={() => joinClass(session)} disabled={loadingId === session.id}>
                {loadingId === session.id ? "Preparing Class" : getJoinLabel(session, state)}
                <Video size={18} aria-hidden="true" />
              </button>
            ) : (
              <span className="portal-tag">Join opens near class time</span>
            )}
            {hostView && (state === "live" || session.status === "live") ? (
              <button className="button button-secondary" type="button" onClick={() => endClass(session)} disabled={loadingId === `end:${session.id}`}>
                {loadingId === `end:${session.id}` ? "Ending Class" : "End Class"}
              </button>
            ) : null}
            {status.id === session.id && status.message ? (
              <div className={`form-status ${status.type || "warning"}`} role="status">{status.message}</div>
            ) : null}
            {session.provider_room_url && state !== "cancelled" ? (
              <small className="muted-line">
                Access opens through a server-generated token.
                <ExternalLink size={14} aria-hidden="true" />
              </small>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
