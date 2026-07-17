import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { getSupabaseClient } from "../services/supabaseClient";
import { usePageMeta } from "../utils/usePageMeta";

export default function AuthCallback() {
  const navigate = useNavigate();

  usePageMeta({
    path: "/auth/callback",
    title: "Completing Email Verification",
    description: "Completing Zentel Insight email verification.",
    robots: "noindex,nofollow"
  });

  useEffect(() => {
    let active = true;
    let subscription;
    let finishTimerId;
    let failSafeId;
    let finishing = false;

    async function fail(message) {
      if (!active) return;
      navigate("/email-verification-failed", {
        replace: true,
        state: {
          message: message || "Email verification could not be completed."
        }
      });
    }

    async function finishVerification() {
      if (finishing) return;
      finishing = true;
      try {
        const supabase = await getSupabaseClient();
        if (!supabase) throw new Error("Account verification is temporarily unavailable.");

        const {
          data: { session },
          error: sessionError
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session) throw new Error("The verification session could not be found.");

        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) throw userError || new Error("The verified user could not be found.");

        const isConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
        if (!isConfirmed) throw new Error("The email address has not been confirmed.");

        if (active) {
          window.history.replaceState({}, document.title, "/email-verified");
          navigate("/email-verified", {
            replace: true,
            state: { email: user.email }
          });
        }
      } catch (error) {
        await fail(error instanceof Error ? error.message : "Email verification could not be completed.");
      }
    }

    async function start() {
      const supabase = await getSupabaseClient();
      if (!supabase) {
        await fail("Account verification is temporarily unavailable.");
        return;
      }

      const listener = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          void finishVerification();
        }
      });
      subscription = listener.data.subscription;
      finishTimerId = window.setTimeout(() => void finishVerification(), 300);
      failSafeId = window.setTimeout(() => {
        void fail("The verification request took too long. Please try the link again.");
      }, 15000);
    }

    void start();
    return () => {
      active = false;
      subscription?.unsubscribe();
      window.clearTimeout(finishTimerId);
      window.clearTimeout(failSafeId);
    };
  }, [navigate]);

  return (
    <section className="auth-section visual-section auth-visual">
      <div className="visual-section__background" aria-hidden="true" />
      <div className="visual-section__overlay" aria-hidden="true" />
      <div className="container narrow visual-section__content">
        <div className="notice-card auth-result-card" role="status" aria-live="polite">
          <BrandLogo brand="main" className="page-brand-logo" size="auth" />
          <LoaderCircle className="spin-icon" size={38} aria-hidden="true" />
          <p className="eyebrow">Email verification</p>
          <h1>Completing verification</h1>
          <p>We are confirming your Zentel Insight account and preparing the next step.</p>
        </div>
      </div>
    </section>
  );
}
