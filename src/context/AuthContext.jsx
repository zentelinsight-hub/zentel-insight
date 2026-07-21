import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContextCore";
import { getSupabaseClient, getSupabaseSafeStatus, hasSupabaseConfig } from "../services/supabaseClient";
import { attachProfileAvatarUrl, calculateProfileCompletion } from "../services/portal/portalRepository";

function withTimeout(promise, message, timeoutMs = 15000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

async function repairMissingProfile(supabase, currentUser) {
  const metadata = currentUser.user_metadata || {};
  const profilePayload = {
    id: currentUser.id,
    full_name: metadata.full_name || "",
    date_of_birth: metadata.date_of_birth || null,
    education_level: metadata.education_level || "",
    phone: metadata.phone || "",
    address: metadata.address || "",
    email: currentUser.email || "",
    profile_completed: Boolean(metadata.full_name),
    profile_completion: calculateProfileCompletion({
      full_name: metadata.full_name || "",
      phone: metadata.phone || "",
      date_of_birth: metadata.date_of_birth || "",
      education_level: metadata.education_level || "",
      address: metadata.address || "",
      avatar_path: ""
    })
  };

  const { data, error } = await withTimeout(
    supabase.from("profiles").upsert(profilePayload, { onConflict: "id" }).select("*").maybeSingle(),
    "Profile repair timed out."
  );
  if (error) return null;
  return data || null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const configured = hasSupabaseConfig();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const status = getSupabaseSafeStatus();
    if (!status.ready) {
      console.info("Supabase Auth development diagnostic", {
        urlConfigured: status.urlConfigured,
        publishableKeyConfigured: status.publishableKeyConfigured,
        urlUsesHttps: status.urlUsesHttps,
        urlMatchesExpected: status.urlMatchesExpected,
        legacyAnonKeyPresent: status.legacyAnonKeyPresent,
        issues: status.issues
      });
    }
  }, []);

  const refreshProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
      setProfile(null);
      setProfileError("");
      return null;
    }
    const supabase = await getSupabaseClient();
    if (!supabase) return null;
    setProfileLoading(true);
    setProfileError("");
    try {
      const { data, error } = await withTimeout(
        supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
        "Profile loading timed out."
      );
      if (error) throw error;
      let profileData = data || null;
      if (!profileData) {
        profileData = await repairMissingProfile(supabase, currentUser);
      }
      const profileWithAvatar = profileData ? await attachProfileAvatarUrl(profileData) : null;
      setProfile(profileWithAvatar || null);
      return profileWithAvatar || null;
    } catch (error) {
      setProfile(null);
      setProfileError(error.message || "Profile information could not be loaded.");
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const signOut = useCallback(async (options = {}) => {
    const supabase = await getSupabaseClient();
    window.dispatchEvent(new CustomEvent("zentel:portal-cache-clear"));
    setProfile(null);
    setSession(null);
    setUser(null);
    await supabase?.auth.signOut({ scope: options.scope || "global" });
  }, []);

  useEffect(() => {
    let active = true;
    let subscription;

    async function loadSession() {
      setAuthLoading(true);
      setAuthReady(false);
      setAuthError("");

      try {
        if (!configured) {
          return;
        }

        const supabase = await getSupabaseClient();
        const { data, error } = await withTimeout(supabase.auth.getSession(), "Account session check timed out.");
        if (error) throw error;
        if (!active) return;

        setSession(data.session || null);
        setUser(data.session?.user || null);
        if (data.session?.user) await refreshProfile(data.session.user);

        const listener = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;
          setSession(nextSession || null);
          setUser(nextSession?.user || null);
          if (nextSession?.user) {
            void refreshProfile(nextSession.user);
          } else {
          setProfile(null);
          setProfileError("");
        }
        });
        subscription = listener.data.subscription;
      } catch (error) {
        if (active) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setAuthError(error.message || "Account access could not be checked.");
        }
      } finally {
        if (active) {
          setAuthReady(true);
          setAuthLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [configured, refreshProfile]);

  const value = useMemo(
    () => ({
      configured,
      authReady,
      authLoading,
      authError,
      profileLoading,
      profileError,
      loading: authLoading,
      session,
      user,
      profile,
      refreshProfile: () => refreshProfile(user),
      signOut
    }),
    [authError, authLoading, authReady, configured, session, user, profile, profileLoading, profileError, refreshProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
