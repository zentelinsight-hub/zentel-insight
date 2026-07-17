import { LogOut } from "lucide-react";
import { authenticatedNavItems, navItems, siteConfig, studyHubNavItems } from "../data/site";
import { useAuth } from "../context/authHooks";
import { getSupabaseClient } from "../services/supabaseClient";
import SiteNavbar from "./SiteNavbar";

export default function Navbar({ brand = "main" }) {
  const { session } = useAuth();
  const brandConfig = brand === "studyhub" ? siteConfig.studyHub : siteConfig.main;
  const brandHref = brand === "studyhub" ? "/studyhub" : "/";
  const brandMotto = brand === "studyhub" ? `Academic support by ${siteConfig.studyHub.parentName}` : siteConfig.motto;
  const mainLinks = navItems.filter((item) => !item.variant);
  const guestActions = navItems.filter((item) => item.variant);
  const accountActions = authenticatedNavItems.filter((item) => item.variant);
  const links = brand === "studyhub" ? studyHubNavItems : mainLinks;
  const actions =
    brand === "studyhub"
      ? [
          { label: "Enrol Now", href: "/studyhub/enrol", variant: "primary", end: true },
          { label: "Back to Zentel Insight", href: "/", variant: "secondary", end: true }
        ]
      : session
        ? [
            ...accountActions,
            {
              label: "Sign Out",
              type: "button",
              variant: "secondary",
              icon: LogOut,
              onClick: signOut
            }
          ]
        : guestActions;

  async function signOut() {
    const supabase = await getSupabaseClient();
    await supabase?.auth.signOut();
  }

  return (
    <SiteNavbar
      brand={brand}
      brandName={brandConfig.name}
      brandMotto={brandMotto}
      brandHref={brandHref}
      links={links}
      actions={actions}
      ariaLabel={brand === "studyhub" ? "StudyHub navigation" : "Primary navigation"}
    />
  );
}
