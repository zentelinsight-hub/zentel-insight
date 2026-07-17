import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Megaphone,
  Settings,
  UserRound
} from "lucide-react";
import { useAuth } from "../context/authHooks";
import { getSupabaseClient } from "../services/supabaseClient";
import { claimMyEnrolments } from "../services/authService";
import { formatDateTime } from "../utils/format";
import { usePageMeta } from "../utils/usePageMeta";
import BrandLogo from "../components/BrandLogo";

const portalLinks = [
  ["/portal", "Overview", LayoutDashboard],
  ["/portal/programs", "Programs", BookOpen],
  ["/portal/enrolments", "My Enrolments", GraduationCap],
  ["/portal/payments", "Payments", CreditCard],
  ["/portal/timetable", "Timetable", CalendarDays],
  ["/portal/resources", "Resources", BookOpen],
  ["/portal/announcements", "Announcements", Megaphone],
  ["/portal/profile", "Profile", UserRound],
  ["/portal/support", "Support", LifeBuoy],
  ["/portal/settings", "Settings", Settings]
];

export function PortalLayout() {
  const { profile, user } = useAuth();
  const displayName = profile?.full_name || user?.email || "Learner";

  useEffect(() => {
    void claimMyEnrolments();
  }, []);

  usePageMeta({
    path: "/portal",
    title: "Student Portal",
    description: "Protected Zentel Insight student portal.",
    robots: "noindex,nofollow"
  });

  async function signOut() {
    const supabase = await getSupabaseClient();
    await supabase?.auth.signOut();
  }

  return (
    <section className="portal-shell">
      <aside className="portal-sidebar">
        <Link className="brand" to="/portal">
          <BrandLogo brand="main" size="portal" />
          <span>
            <span className="brand-name">Student Portal</span>
            <span className="brand-motto">Zentel Insight</span>
          </span>
        </Link>
        <nav aria-label="Student portal">
          {portalLinks.map(([href, label, Icon]) => (
            <NavLink key={href} to={href} end={href === "/portal"} className={({ isActive }) => isActive ? "portal-link active" : "portal-link"}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <button className="portal-link signout" type="button" onClick={signOut}>
          <LogOut size={18} aria-hidden="true" />
          Sign Out
        </button>
      </aside>
      <main className="portal-main">
        <header className="portal-header">
          <div>
            <p className="eyebrow">Welcome</p>
            <h1>{displayName}</h1>
          </div>
          <Bell size={22} aria-hidden="true" />
        </header>
        <Outlet />
      </main>
    </section>
  );
}

export function PortalOverview() {
  return (
    <div className="portal-grid">
      <article className="notice-card">
        <h2>Learning overview</h2>
        <p>You have not enrolled in a program yet.</p>
        <Link className="button button-primary" to="/portal/programs">Browse Programs</Link>
      </article>
      <article className="notice-card">
        <h2>Upcoming class</h2>
        <p>No upcoming classes have been scheduled.</p>
      </article>
      <article className="notice-card">
        <h2>Resources</h2>
        <p>Resources will appear after your enrolment is activated.</p>
      </article>
    </div>
  );
}

export function PortalSection({ title }) {
  return (
    <div className="notice-card">
      <p className="eyebrow">Portal</p>
      <h2>{title}</h2>
      <p>This protected page is ready to connect to Supabase records for the signed-in learner.</p>
    </div>
  );
}

export function PortalProfile() {
  const { profile, user } = useAuth();
  const details = [
    ["Full name", profile?.full_name || "Unavailable"],
    ["Verified email", user?.email || profile?.email || "Unavailable"],
    ["Date of birth", profile?.date_of_birth || "Unavailable"],
    ["Phone", profile?.phone || "Unavailable"],
    ["Address", profile?.address || "Unavailable"],
    ["Account creation date", user?.created_at ? formatDateTime(user.created_at) : profile?.created_at ? formatDateTime(profile.created_at) : "Unavailable"]
  ];

  return (
    <div className="notice-card">
      <p className="eyebrow">Portal</p>
      <h2>Profile</h2>
      <dl className="receipt-details">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
