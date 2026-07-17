import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { getSupabaseSafeStatus } from "./services/supabaseClient";
import "./styles/global.css";

function getPaystackPublicKeyMode(publicKey) {
  if (publicKey.startsWith("pk_test_")) return "test";
  if (publicKey.startsWith("pk_live_")) return "live";
  return "";
}

if (import.meta.env.DEV) {
  const supabaseStatus = getSupabaseSafeStatus();
  const paystackPublicKey = String(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || "").trim();
  const paystackMode = getPaystackPublicKeyMode(paystackPublicKey);
  console.info("Frontend environment", {
    supabaseConfigured: supabaseStatus.ready,
    paystackPublicKeyConfigured: Boolean(paystackMode && paystackPublicKey !== "pk_test_replace_me"),
    paystackMode: paystackMode || "missing",
    siteUrlConfigured: Boolean(String(import.meta.env.VITE_SITE_URL || "").trim())
  });
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<div className="route-loader">Loading Zentel Insight</div>}>
              <App />
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
