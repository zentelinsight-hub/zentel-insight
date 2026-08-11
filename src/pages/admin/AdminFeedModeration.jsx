import { useState } from "react";
import { ShieldX, UserRound } from "lucide-react";
import PortalDialog from "../../components/portal/PortalDialog";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getAdminStudentFeedPosts, moderateStudentFeedPost } from "../../services/adminService";
import { formatDateTime } from "../../utils/format";

export default function AdminFeedModeration() {
  const query = useAsyncData(getAdminStudentFeedPosts, [], { errorMessage: "Student posts could not be loaded." });
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  async function removePost() {
    if (!selected || busy) return;
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      await moderateStudentFeedPost(selected.id, reason);
      setSelected(null);
      setReason("");
      setStatus({ type: "success", message: "The Student post was removed from the feed." });
      query.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "The post could not be removed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-page admin-feed-moderation">
      <header className="portal-compact-heading"><p className="eyebrow">Admin Portal</p><h1>Student Feed</h1><p>Review Student posts and remove content through the audited moderation action.</p></header>
      {status.message ? <div className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</div> : null}
      {query.loading ? <div className="portal-local-loading">Loading Student posts</div> : null}
      {query.error ? <div className="form-status warning" role="alert">{query.error}<button className="button button-secondary" type="button" onClick={query.refetch}>Try Again</button></div> : null}
      <div className="admin-feed-list">
        {(query.data || []).map((post) => (
          <article key={post.id}>
            <header>
              <span className="portal-avatar sm">{post.author_avatar_url ? <img src={post.author_avatar_url} alt={`${post.author_name} profile`} /> : <UserRound size={17} aria-hidden="true" />}</span>
              <span><strong>{post.author_name}</strong><small>{post.author_account_status} account | {formatDateTime(post.published_at)}</small></span>
              <span className={`portal-tag ${post.status === "published" ? "success" : "warning"}`}>{post.status}</span>
            </header>
            <p>{post.body}</p>
            {post.image_url ? <img className="admin-feed-image" src={post.image_url} alt={`${post.author_name} post`} loading="lazy" /> : null}
            {post.status === "published" ? <button className="button button-danger" type="button" onClick={() => { setSelected(post); setReason(""); }}><ShieldX size={16} aria-hidden="true" />Remove Post</button> : null}
          </article>
        ))}
        {!query.loading && !query.error && !(query.data || []).length ? <p className="portal-empty-line">No Student posts are available.</p> : null}
      </div>
      <PortalDialog open={Boolean(selected)} title="Remove Student post?" description="The post will disappear from every Student feed. This action is retained in the private moderation audit." busy={busy} onClose={() => !busy && setSelected(null)}>
        {() => <div className="portal-dialog-form"><label><span>Moderation reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength="4" maxLength="500" required /></label><div className="portal-dialog-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setSelected(null)}>Cancel</button><button className="button button-danger" type="button" disabled={busy || reason.trim().length < 4} onClick={removePost}>{busy ? "Removing" : "Remove Post"}</button></div></div>}
      </PortalDialog>
    </div>
  );
}
