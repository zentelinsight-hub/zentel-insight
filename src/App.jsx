import { lazy, useEffect, useLayoutEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import GuestRoute from "./components/GuestRoute";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import RouteTransitionGate from "./components/RouteTransitionGate";
import WelcomeExperience from "./components/WelcomeExperience";
import { PortalLayout, PortalOverview, PortalProfile, PortalSection } from "./pages/Portal";

function getRouteBrand(location) {
  const params = new URLSearchParams(location.search);
  const reference = params.get("reference") || "";
  if (location.pathname.startsWith("/studyhub")) return "studyhub";
  if (
    ["/payment-status", "/payment-success", "/payment-failed", "/payment-cancelled"].includes(location.pathname) &&
    reference.startsWith("ZH-")
  ) {
    return "studyhub";
  }
  return "zentel";
}

function BrandRouteSync() {
  const location = useLocation();

  useLayoutEffect(() => {
    const brand = getRouteBrand(location);
    document.body.dataset.brand = brand;
    document.documentElement.dataset.brand = brand;
  }, [location]);

  return null;
}

const Home = lazy(() => import("./pages/Home"));
const About = lazy(() => import("./pages/About"));
const Programs = lazy(() => import("./pages/Programs"));
const ProgramDetail = lazy(() => import("./pages/ProgramDetail"));
const Community = lazy(() => import("./pages/Community"));
const Contact = lazy(() => import("./pages/Contact"));
const StudyHub = lazy(() => import("./pages/StudyHub"));
const StudyHubHome = lazy(() => import("./pages/studyhub/StudyHubHome"));
const StudyHubJss = lazy(() => import("./pages/studyhub/StudyHubJss"));
const StudyHubSss = lazy(() => import("./pages/studyhub/StudyHubSss"));
const StudyHubSubjects = lazy(() => import("./pages/studyhub/StudyHubSubjects"));
const StudyHubSummerLessons = lazy(() => import("./pages/studyhub/StudyHubSummerLessons"));
const StudyHubPricing = lazy(() => import("./pages/studyhub/StudyHubPricing"));
const StudyHubEnrol = lazy(() => import("./pages/studyhub/StudyHubEnrol"));
const StudyHubContact = lazy(() => import("./pages/studyhub/StudyHubContact"));
const StudyHubPayment = lazy(() => import("./pages/studyhub/StudyHubPayment"));
const StudyHubPaymentState = lazy(() => import("./pages/studyhub/StudyHubPaymentState"));
const StudyHubNotFound = lazy(() => import("./pages/studyhub/StudyHubNotFound"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Payment = lazy(() => import("./pages/Payment"));
const PaymentStatus = lazy(() => import("./pages/PaymentStatus"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentState = lazy(() => import("./pages/PaymentState"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const NotFound = lazy(() => import("./pages/NotFound"));

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      window.setTimeout(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "start"
        });
      }, 0);
      return;
    }
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash]);

  return null;
}

export default function App() {
  const location = useLocation();
  const welcomeBrand = getRouteBrand(location) === "studyhub" ? "studyhub" : "main";

  return (
    <>
      <BrandRouteSync />
      <ScrollToTop />
      <WelcomeExperience brand={welcomeBrand}>
        <RouteTransitionGate>
          {(displayLocation) => (
            <Routes location={displayLocation}>
            <Route path="/studyhub" element={<StudyHub />}>
              <Route index element={<StudyHubHome />} />
              <Route path="jss" element={<StudyHubJss />} />
              <Route path="sss" element={<StudyHubSss />} />
              <Route path="subjects" element={<StudyHubSubjects />} />
              <Route path="summer-lessons" element={<StudyHubSummerLessons />} />
              <Route path="pricing" element={<StudyHubPricing />} />
              <Route path="enrol" element={<StudyHubEnrol />} />
              <Route path="enrol/summer-lessons" element={<StudyHubEnrol programme="summer-lessons" />} />
              <Route path="contact" element={<StudyHubContact />} />
              <Route path="payment" element={<StudyHubPayment />} />
              <Route path="payment-status" element={<PaymentStatus />} />
              <Route path="payment-success" element={<PaymentSuccess />} />
              <Route path="payment-failed" element={<StudyHubPaymentState state="failed" />} />
              <Route path="payment-cancelled" element={<StudyHubPaymentState state="cancelled" />} />
              <Route path="*" element={<StudyHubNotFound />} />
            </Route>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/programs" element={<Programs />} />
              <Route path="/programs/:slug" element={<ProgramDetail />} />
              <Route path="/courses" element={<Navigate to="/programs" replace />} />
              <Route path="/courses/*" element={<Navigate to="/programs" replace />} />
              <Route path="/community" element={<Community />} />
              <Route path="/timetable" element={<Navigate to="/portal/timetable" replace />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
              <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
              <Route path="/verify-email" element={<GuestRoute><VerifyEmail /></GuestRoute>} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/checkout/:programSlug/:trackSlug" element={<Checkout />} />
              <Route path="/payment" element={<Payment />} />
              <Route path="/payment-status" element={<PaymentStatus />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              <Route path="/payment-failed" element={<PaymentState state="failed" />} />
              <Route path="/payment-cancelled" element={<PaymentState state="cancelled" />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
              <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
              <Route path="/terms-conditions" element={<Navigate to="/terms-and-conditions" replace />} />
              <Route path="/terms" element={<Navigate to="/terms-and-conditions" replace />} />
              <Route path="/404" element={<NotFound />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/portal" element={<ProtectedRoute><PortalLayout /></ProtectedRoute>}>
              <Route index element={<PortalOverview />} />
              <Route path="programs" element={<PortalSection title="Programs" />} />
              <Route path="enrolments" element={<PortalSection title="My Enrolments" />} />
              <Route path="payments" element={<PortalSection title="Payments" />} />
              <Route path="timetable" element={<PortalSection title="Timetable" />} />
              <Route path="resources" element={<PortalSection title="Resources" />} />
              <Route path="announcements" element={<PortalSection title="Announcements" />} />
              <Route path="profile" element={<PortalProfile />} />
              <Route path="support" element={<PortalSection title="Support" />} />
              <Route path="settings" element={<PortalSection title="Settings" />} />
            </Route>
            </Routes>
          )}
        </RouteTransitionGate>
      </WelcomeExperience>
    </>
  );
}
