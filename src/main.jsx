import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { getSupabaseSafeStatus } from "./services/supabaseClient";
import "./styles/global.css";

if (import.meta.env.DEV) {
  const supabaseStatus = getSupabaseSafeStatus();
  console.info("Frontend environment", {
    supabaseConfigured: supabaseStatus.ready,
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
