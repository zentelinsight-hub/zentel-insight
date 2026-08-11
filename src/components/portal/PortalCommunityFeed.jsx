import { useEffect, useRef, useState } from "react";
import { Globe2, ImagePlus, LoaderCircle, Send, X } from "lucide-react";
import { useAuth } from "../../context/authHooks";
import { useStudentFeed } from "../../hooks/portal/usePortalData";
import { createStudentFeedPost } from "../../services/portal/portalRepository";
import { formatDateTime } from "../../utils/format";

function getInitials(profile, user) {
  const source = profile?.full_name || user?.email || "Member";
  const words = String(source).replace(/@.*/, "").trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "M").concat(words[1]?.[0] || "").toUpperCase();
}

function PortalAvatar({ profile, user }) {
  return (
    <span className="portal-avatar sm">
      {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{getInitials(profile, user)}</span>}
    </span>
  );
}

function FeedSourceIcon({ item }) {
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState(item.sourceIconUrl || item.sourceFallbackIconUrl || "");

  useEffect(() => {
    setFailed(false);
    setSource(item.sourceIconUrl || item.sourceFallbackIconUrl || "");
  }, [item.sourceFallbackIconUrl, item.sourceIconUrl]);

  if (item.kind === "student") {
    return <span className="portal-avatar sm">{item.avatarUrl && !failed ? <img src={item.avatarUrl} alt="" onError={() => setFailed(true)} /> : <span>{item.author.slice(0, 1).toUpperCase()}</span>}</span>;
  }

  return (
    <span className="feed-source-icon">
      {source && !failed ? (
        <img
          src={source}
          alt={`${item.author} icon`}
          width="32"
          height="32"
          loading="lazy"
          onError={() => {
            if (item.sourceFallbackIconUrl && source !== item.sourceFallbackIconUrl) setSource(item.sourceFallbackIconUrl);
            else setFailed(true);
          }}
        />
      ) : <Globe2 size={17} aria-hidden="true" />}
    </span>
  );
}

function FeedMedia({ item }) {
  const [failed, setFailed] = useState(false);
  if (!item.imageUrl || failed) return null;
  return <img className="feed-entry-media" src={item.imageUrl} alt={`${item.title || item.author} preview`} loading="lazy" decoding="async" width="1200" height="675" onError={() => setFailed(true)} />;
}

function formatRelativeTime(value) {
  const timestamp = new Date(value || 0).getTime();
  if (!Number.isFinite(timestamp)) return "Published recently";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d ago` : formatDateTime(value);
}

export default function PortalCommunityFeed({ eyebrow = "Portal" }) {
  const { user, profile } = useAuth();
  const feed = useStudentFeed(user?.id);
  const [body, setBody] = useState("");
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [publishing, setPublishing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!image) {
      setPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(image);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [image]);

  function clearImage() {
    setImage(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function publish(event) {
    event.preventDefault();
    setPublishing(true);
    setStatus({ type: "", message: "" });
    try {
      await createStudentFeedPost({ userId: user.id, body, image });
      setBody("");
      clearImage();
      setStatus({ type: "success", message: "Post published." });
      feed.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Your post could not be published." });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="portal-page student-feed-page">
      <header className="portal-compact-heading"><p className="eyebrow">{eyebrow}</p><h1>Home</h1></header>
      <form className="feed-composer" onSubmit={publish}>
        <PortalAvatar profile={profile} user={user} />
        <label><span className="sr-only">Create a post</span><textarea rows="2" maxLength="3000" value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share an update with the Zentel Insight community" /></label>
        <label className="feed-file-button" title="Add image"><ImagePlus size={18} aria-hidden="true" /><span className="sr-only">Add image</span><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
        <button className="feed-publish-button" type="submit" title="Publish post" disabled={publishing || !body.trim()}><Send size={18} aria-hidden="true" /><span className="sr-only">Publish post</span></button>
        {image && previewUrl ? (
          <figure className="feed-upload-preview">
            <img src={previewUrl} alt={`Selected upload preview: ${image.name}`} />
            <figcaption><span>{image.name}</span><button type="button" onClick={clearImage} title="Remove selected image"><X size={16} aria-hidden="true" /><span className="sr-only">Remove selected image</span></button></figcaption>
          </figure>
        ) : null}
      </form>
      {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
      {feed.loading ? <div className="portal-local-loading" role="status"><LoaderCircle className="spin-icon" size={20} /><span>Loading feed...</span></div> : null}
      {feed.error ? <div className="notice-card portal-state-card" role="alert"><h2>We could not load the feed</h2><p>{feed.error}</p><button className="button button-primary" type="button" onClick={feed.refetch}>Try Again</button></div> : null}
      {!feed.loading && !feed.error ? (
        <section className="student-feed" aria-label="Zentel Insight community and technology feed">
          {(feed.data || []).map((item) => (
            <article className="feed-entry" key={item.id}>
              <header><FeedSourceIcon item={item} /><div><strong>{item.author}</strong><small>{item.category ? `${item.category} | ` : ""}{formatRelativeTime(item.createdAt)}</small></div></header>
              {item.title ? <h2>{item.title}</h2> : null}
              <p>{item.body}</p>
              <FeedMedia item={item} />
              {item.externalUrl ? <a className="text-link" href={item.externalUrl} target="_blank" rel="noreferrer">{item.sourceType === "youtube" ? "Watch on YouTube" : "Read full story"}</a> : null}
            </article>
          ))}
          {!(feed.data || []).length ? <div className="notice-card portal-state-card"><h2>The feed is ready</h2><p>Community posts and published technology content will appear here.</p></div> : null}
        </section>
      ) : null}
    </div>
  );
}
