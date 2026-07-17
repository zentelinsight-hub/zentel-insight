/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrandLogo from "./BrandLogo";
import ContactForm from "./forms/ContactForm";
import Footer from "./Footer";
import Navbar from "./Navbar";
import RouteTransitionGate from "./RouteTransitionGate";
import WelcomeExperience from "./WelcomeExperience";
import { NAVBAR_DESKTOP_BREAKPOINT_PX } from "./navbarConfig";
import { welcomeDurationMs } from "./welcomeConfig";
import { AuthContext } from "../context/authContextCore";
import { ThemeProvider } from "../context/ThemeContext";
import { studyHubActionItems, studyHubNavItems } from "../data/site";
import { programs } from "../data/programs";
import Checkout from "../pages/Checkout";
import ProgramDetail from "../pages/ProgramDetail";
import Programs from "../pages/Programs";
import StudyHub from "../pages/StudyHub";
import StudyHubContact from "../pages/studyhub/StudyHubContact";
import StudyHubEnrol from "../pages/studyhub/StudyHubEnrol";
import StudyHubHome from "../pages/studyhub/StudyHubHome";
import StudyHubJss from "../pages/studyhub/StudyHubJss";
import StudyHubNotFound from "../pages/studyhub/StudyHubNotFound";
import StudyHubPricing from "../pages/studyhub/StudyHubPricing";
import StudyHubSss from "../pages/studyhub/StudyHubSss";
import StudyHubSubjects from "../pages/studyhub/StudyHubSubjects";
import StudyHubSummerLessons from "../pages/studyhub/StudyHubSummerLessons";

function renderWithRouter(ui, initialEntries = ["/"]) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

function renderStudyHub(initialEntries = ["/studyhub"]) {
  return render(
    <AuthContext.Provider
      value={{
        authReady: true,
        authLoading: false,
        configured: true,
        loading: false,
        session: null,
        user: null,
        profile: null,
        refreshProfile: vi.fn()
      }}
    >
      <ThemeProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
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
              <Route path="*" element={<StudyHubNotFound />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

function authWrapper(ui, initialEntries = ["/"]) {
  return render(
    <AuthContext.Provider
      value={{
        authReady: true,
        authLoading: false,
        configured: true,
        loading: false,
        session: null,
        user: null,
        profile: null,
        refreshProfile: vi.fn()
      }}
    >
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </AuthContext.Provider>
  );
}

function renderWithProviders(ui, initialEntries = ["/"], authValue = {}) {
  return render(
    <AuthContext.Provider
      value={{
        authReady: true,
        authLoading: false,
        configured: true,
        loading: false,
        session: null,
        user: null,
        profile: null,
        refreshProfile: vi.fn(),
        ...authValue
      }}
    >
      <ThemeProvider>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </ThemeProvider>
    </AuthContext.Provider>
  );
}

beforeEach(() => {
  window.matchMedia = vi.fn((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.sessionStorage.clear();
  window.localStorage.clear();
  document.body.className = "";
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("square brand logos", () => {
  it("renders the main logo in a square wrapper", () => {
    render(<BrandLogo brand="main" size="auth" />);
    const frame = screen.getByRole("img", { name: "Zentel Insight" }).parentElement;
    expect(frame).toHaveClass("brand-logo-frame");
    expect(frame).toHaveStyle({ "--logo-size": "64px" });
    expect(screen.getByRole("img", { name: "Zentel Insight" })).toHaveAttribute("width", "64");
    expect(screen.getByRole("img", { name: "Zentel Insight" })).toHaveAttribute("height", "64");
  });

  it("renders the StudyHub logo in a square wrapper", () => {
    render(<BrandLogo brand="studyhub" size="payment" />);
    const logo = screen.getByRole("img", { name: "Zentel Insight StudyHub" });
    expect(logo.parentElement).toHaveClass("brand-logo-frame");
    expect(logo).toHaveAttribute("width", "72");
    expect(logo).toHaveAttribute("height", "72");
  });
});

describe("welcome experience", () => {
  it("blocks child content until the welcome duration completes", () => {
    vi.useFakeTimers();
    render(<WelcomeExperience brand="main"><div>Homepage content</div></WelcomeExperience>);

    expect(screen.getByRole("status", { name: "Welcome to Zentel Insight" })).toBeInTheDocument();
    expect(screen.queryByText("Homepage content")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(welcomeDurationMs);
    });

    expect(screen.queryByRole("status", { name: "Welcome to Zentel Insight" })).not.toBeInTheDocument();
    expect(screen.getByText("Homepage content")).toBeInTheDocument();
    expect(window.sessionStorage.length).toBe(0);
    vi.useRealTimers();
  });
});

describe("StudyHub navigation", () => {
  let desktopMatches = false;

  beforeEach(() => {
    desktopMatches = false;
    window.matchMedia = vi.fn((query) => ({
      matches: query.includes("1280px") ? desktopMatches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
  });

  it("uses route links for navigation and separate StudyHub actions", () => {
    expect(studyHubNavItems.map((item) => item.href)).toEqual([
      "/studyhub",
      "/studyhub/jss",
      "/studyhub/sss",
      "/studyhub/subjects",
      "/studyhub/summer-lessons",
      "/studyhub/pricing",
      "/studyhub/contact"
    ]);
    expect(studyHubNavItems.map((item) => item.label)).not.toContain("Login");
    expect(studyHubNavItems.map((item) => item.label)).not.toContain("Sign Up");
    expect(studyHubActionItems.map((item) => item.href)).toEqual(["/studyhub/enrol", "/"]);
  });

  it("opens, closes, handles Escape, backdrop, route selection and desktop resize", () => {
    renderStudyHub(["/studyhub"]);
    const menuButton = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".mobile-menu")).toHaveClass("open");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    fireEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    fireEvent.click(screen.getAllByRole("link", { name: "Enrol Now" }).at(-1));
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    fireEvent.scroll(window);
    expect(menuButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(menuButton);
    desktopMatches = true;
    fireEvent.resize(window);
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    ["/studyhub", "Home", "Online academic support for JSS and SSS students."],
    ["/studyhub/jss", "JSS", "Structured support for JSS1, JSS2 and JSS3."],
    ["/studyhub/sss", "SSS", "Subject-based support for SSS1, SSS2 and SSS3."],
    ["/studyhub/subjects", "Subjects", "Choose academic support by subject."],
    ["/studyhub/summer-lessons", "Summer Lessons", "One month of structured holiday learning."],
    ["/studyhub/pricing", "Pricing", "Simple monthly pricing by class and subject."],
    ["/studyhub/contact", "Contact", "Talk to StudyHub support."],
    ["/studyhub/enrol", "Enrol Now", "Calculate StudyHub payment and continue securely."]
  ])("renders %s as its own page with the correct active item", (path, activeLabel, heading) => {
    renderStudyHub([path]);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    const activeLabels = [
      ...new Set(
        screen
          .getAllByRole("link")
          .filter((link) => link.getAttribute("aria-current") === "page")
          .map((link) => link.textContent.trim())
      )
    ];
    expect(activeLabels).toEqual([activeLabel]);
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign Up" })).not.toBeInTheDocument();
  });
});

describe("shared navbar shell", () => {
  it("renders main and StudyHub navigation through the same shell and breakpoint", () => {
    const { unmount } = renderWithProviders(<Navbar brand="main" />);
    expect(document.querySelector('[data-navbar-shell="site-navbar"]')).toHaveAttribute("data-brand", "main");
    expect(screen.getAllByRole("link", { name: "Login" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Sign Up" }).length).toBeGreaterThan(0);
    expect(NAVBAR_DESKTOP_BREAKPOINT_PX).toBe(1280);
    unmount();

    renderWithProviders(<Navbar brand="studyhub" />, ["/studyhub/jss"]);
    expect(document.querySelector('[data-navbar-shell="site-navbar"]')).toHaveAttribute("data-brand", "studyhub");
    expect(screen.queryByRole("link", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign Up" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Enrol Now" }).at(0)).toHaveAttribute("href", "/studyhub/enrol");
  });
});

describe("public checkout", () => {
  it("renders course checkout publicly with trusted amount and buyer fields", () => {
    authWrapper(
      <Routes>
        <Route path="/checkout/:programSlug/:trackSlug" element={<Checkout />} />
      </Routes>,
      ["/checkout/graphic-design/brand-and-social-media-design"]
    );

    expect(screen.getByRole("heading", { name: "Pay for Graphic Design." })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    expect(screen.getAllByText("Graphic Design").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Brand and Social Media Design").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₦20,000").length).toBeGreaterThan(0);
    expect(screen.queryByText("Log in before making payment.")).not.toBeInTheDocument();
  });

  it("blocks invalid checkout without falling back to another course", () => {
    authWrapper(
      <Routes>
        <Route path="/checkout/:programSlug/:trackSlug" element={<Checkout />} />
      </Routes>,
      ["/checkout/not-a-course/design-foundations"]
    );

    expect(screen.getAllByRole("heading", { name: "Program Not Found" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Return to Programs" })).toBeInTheDocument();
  });

  it("blocks invalid tracks without defaulting to another track", () => {
    authWrapper(
      <Routes>
        <Route path="/checkout/:programSlug/:trackSlug" element={<Checkout />} />
      </Routes>,
      ["/checkout/graphic-design/not-a-track"]
    );

    expect(screen.getAllByRole("heading", { name: "Track Not Found" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Return to Programme" })).toHaveAttribute("href", "/programs/graphic-design");
  });
});

describe("programme enrolment flow", () => {
  it("keeps programme list cards on programme detail routes only", () => {
    renderWithRouter(
      <Routes>
        <Route path="/programs" element={<Programs />} />
      </Routes>,
      ["/programs"]
    );

    expect(screen.queryByRole("link", { name: /^Enrol$/i })).not.toBeInTheDocument();
    const programLinks = screen.getAllByRole("link", { name: "View Program" });
    expect(programLinks.length).toBeGreaterThan(0);
    programLinks.forEach((link) => {
      expect(link.getAttribute("href")).toMatch(/^\/programs\/[a-z0-9-]+$/);
      expect(link.getAttribute("href")).not.toContain("/checkout");
    });
  });

  it("requires track selection before the dedicated Enrol button opens checkout", () => {
    renderWithRouter(
      <Routes>
        <Route path="/programs/:slug" element={<ProgramDetail />} />
        <Route path="/checkout/:programSlug/:trackSlug" element={<div>Checkout route reached</div>} />
      </Routes>,
      ["/programs/graphic-design"]
    );

    const enrolButton = screen.getByRole("button", { name: "Select a Track to Enrol" });
    expect(enrolButton).toBeDisabled();
    expect(screen.getAllByText("No track selected").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("radio", { name: /Brand and Social Media Design/ }));
    expect(screen.getByRole("button", { name: "Enrol in Brand and Social Media Design" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Enrol in Brand and Social Media Design" }));
    expect(screen.getByText("Checkout route reached")).toBeInTheDocument();
  });
});

describe("footer links", () => {
  it("renders valid main footer links for every programme and contact action", () => {
    renderWithRouter(<Footer brand="main" />);
    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === "#")).toBe(false);
    programs.forEach((program) => {
      expect(screen.getByRole("link", { name: program.title })).toHaveAttribute("href", `/programs/${program.slug}`);
    });
    expect(screen.getByRole("link", { name: "07060833927" })).toHaveAttribute("href", "tel:+2347060833927");
    expect(screen.getByRole("link", { name: "zentelinsight@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:zentelinsight@gmail.com"
    );
  });

  it("renders valid StudyHub footer links and StudyHub email", () => {
    renderWithRouter(<Footer brand="studyhub" />);
    const links = screen.getAllByRole("link");
    expect(links.some((link) => link.getAttribute("href") === "#")).toBe(false);
    expect(screen.getByRole("link", { name: "Enrol" })).toHaveAttribute("href", "/studyhub/enrol");
    expect(screen.getByRole("link", { name: "Back to Zentel Insight" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "zentelinsightstudyhub@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:zentelinsightstudyhub@gmail.com"
    );
  });
});

describe("WhatsApp contact forms", () => {
  function fillMainContactForm() {
    fireEvent.change(screen.getByRole("textbox", { name: /Full name/ }), { target: { value: "Ada Learner" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Email address/ }), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Phone number/ }), { target: { value: "07000000000" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Subject/ }), { target: { value: "Programme enquiry" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Message/ }), { target: { value: "I want to ask about the design programme." } });
  }

  it("validates and opens the main contact message through WhatsApp", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({ opener: null });
    renderWithRouter(<ContactForm />);

    fireEvent.click(screen.getByRole("button", { name: /Submit Message/ }));
    expect(screen.getByText("Enter your full name.")).toBeInTheDocument();

    fillMainContactForm();
    fireEvent.click(screen.getByRole("button", { name: /Submit Message/ }));
    expect(openSpy).toHaveBeenCalledOnce();
    const url = openSpy.mock.calls[0][0];
    expect(url).toMatch(/^https:\/\/wa\.me\/2347060833927\?text=/);
    expect(decodeURIComponent(url.split("text=")[1])).toContain("Hello Zentel Insight");
    expect(screen.getByText(/WhatsApp has been opened/)).toBeInTheDocument();
    expect(screen.queryByText(/sent successfully/i)).not.toBeInTheDocument();
  });

  it("keeps a fallback WhatsApp link when the popup is blocked", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    renderWithRouter(<ContactForm brand="studyhub" />);

    fillMainContactForm();
    fireEvent.change(screen.getByLabelText("Student class, if supplied"), { target: { value: "JSS2" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit Message/ }));

    const fallback = screen.getByRole("link", { name: "Open WhatsApp" });
    expect(fallback).toHaveAttribute("target", "_blank");
    expect(fallback.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/2347060833927\?text=/);
    expect(decodeURIComponent(fallback.getAttribute("href").split("text=")[1])).toContain("Hello Zentel Insight StudyHub");
  });
});

describe("route transition loader", () => {
  function Shell() {
    const [count, setCount] = useState(0);
    return (
      <RouteTransitionGate>
        {(displayLocation) => (
          <>
            <button type="button" onClick={() => setCount((current) => current + 1)}>Local State {count}</button>
            <Link to="/next">Next</Link>
            <Routes location={displayLocation}>
              <Route path="/" element={<div>Home</div>} />
              <Route path="/next" element={<div>Next page</div>} />
            </Routes>
          </>
        )}
      </RouteTransitionGate>
    );
  }

  it("appears on real route changes and disappears after two seconds", () => {
    vi.useFakeTimers();
    renderWithRouter(<Shell />, ["/"]);
    expect(screen.queryByRole("status", { name: "Loading page" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Local State 0" }));
    expect(screen.queryByRole("status", { name: "Loading page" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Next" }));
    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
    expect(document.querySelector(".route-content")).toHaveClass("route-content-loading");
    expect(document.querySelector(".route-content")).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".route-content")).toHaveAttribute("inert");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Next page")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole("status", { name: "Loading page" })).not.toBeInTheDocument();
    expect(document.querySelector(".route-content")).toHaveClass("page-enter");
    expect(screen.getByText("Next page")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
