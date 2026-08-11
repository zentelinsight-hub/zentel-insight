import { useEffect, useRef, useState } from "react";
import { Camera, LoaderCircle, UserRound } from "lucide-react";
import { useAuth } from "../../context/authHooks";
import { updateOwnProfileAvatar } from "../../services/portal/portalRepository";

export default function PortalAvatarUpload({ profile, name, onChanged, size = "xl" }) {
  const { user, refreshProfile } = useAuth();
  const [displayProfile, setDisplayProfile] = useState(profile);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const inputRef = useRef(null);

  useEffect(() => setDisplayProfile(profile), [profile]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  async function upload(event) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      const updated = await updateOwnProfileAvatar({
        userId: user?.id,
        file,
        previousPath: displayProfile?.avatar_path || ""
      });
      setDisplayProfile(updated);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await refreshProfile();
      await onChanged?.();
      setStatus({ type: "success", message: "Profile picture updated." });
    } catch (error) {
      setStatus({ type: "warning", message: error.message || "Profile picture could not be updated." });
    } finally {
      setBusy(false);
    }
  }

  const initial = String(name || displayProfile?.full_name || "Account").trim().slice(0, 1).toUpperCase();
  return (
    <form className="portal-own-avatar" onSubmit={upload}>
      <span className={`portal-avatar ${size}`}>
        {previewUrl
          ? <img src={previewUrl} alt={`Selected profile picture preview for ${name || "Account"}`} />
          : displayProfile?.avatar_url
            ? <img src={displayProfile.avatar_url} alt={`${name || "Account"} profile`} />
            : initial ? <span>{initial}</span> : <UserRound size={30} aria-hidden="true" />}
      </span>
      <div>
        <label className="button button-secondary" aria-disabled={busy}>
          <Camera size={16} aria-hidden="true" />
          <span>{file ? "Change selection" : "Choose picture"}</span>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] || null); setStatus({ type: "", message: "" }); }} />
        </label>
        <button className="button button-primary" type="submit" disabled={!file || busy}>
          {busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Camera size={16} aria-hidden="true" />}
          {busy ? "Uploading" : "Upload"}
        </button>
        <small>JPEG, PNG or WebP. Maximum 3 MB.</small>
        {status.message ? <span className={`form-status ${status.type}`} role={status.type === "warning" ? "alert" : "status"}>{status.message}</span> : null}
      </div>
    </form>
  );
}
