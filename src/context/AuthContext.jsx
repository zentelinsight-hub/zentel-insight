import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContextCore";
import { getSupabaseClient, getSupabaseSafeStatus, hasSupabaseConfig } from "../services/supabaseClient";

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
    phone: metadata.phone || "",
    address: metadata.address || "",
    email: currentUser.email || "",
    profile_completed: Boolean(metadata.full_name)
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
      return null;
    }
    const supabase = await getSupabaseClient();
    if (!supabase) return null;
    const { data, error } = await withTimeout(
      supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
      "Profile loading timed out."
    );
    if (error) {
      setProfile(null);
      return null;
    }
    let profileData = data || null;
    if (!profileData) {
      try {
        profileData = await repairMissingProfile(supabase, currentUser);
      } catch {
        profileData = null;
      }
    }
    setProfile(profileData || null);
    return profileData || null;
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
      loading: authLoading,
      session,
      user,
      profile,
      refreshProfile: () => refreshProfile(user)
    }),
    [authError, authLoading, authReady, configured, session, user, profile, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
