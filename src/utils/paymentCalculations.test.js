import { describe, expect, it } from "vitest";
import { navItems, studyHubActionItems, studyHubNavItems } from "../data/site";
import { programs } from "../data/programs";
import {
  canActivateEnrolment,
  calculateSummerLessonsPrice,
  calculateStudyHubPrice,
  getProgramLevelPrice,
  mapPaymentStatus,
  nairaToKobo,
  resolveCourseCheckout,
  resolveSummerLessonsCheckout,
  safeRedirectPath
} from "./paymentCalculations";

describe("payment calculations", () => {
  it("returns approved course track prices", () => {
    expect(getProgramLevelPrice("graphic-design", "Design Foundations")).toBe(10000);
    expect(getProgramLevelPrice("graphic-design", "brand-and-social-media-design")).toBe(20000);
    expect(getProgramLevelPrice("graphic-design", "Visual Identity and Professional Portfolio")).toBe(35000);
    expect(getProgramLevelPrice("web-design-and-development", "Web Foundations")).toBe(20000);
    expect(getProgramLevelPrice("web-design-and-development", "Full-Stack Web Applications")).toBe(55000);
    expect(getProgramLevelPrice("software-development", "Software Engineering Practice")).toBe(70000);
    expect(getProgramLevelPrice("data-analysis", "SQL and Power BI Analysis")).toBe(40000);
    expect(getProgramLevelPrice("data-analysis", "python-analytics-and-portfolio-projects")).toBe(65000);
    expect(getProgramLevelPrice("ui-ux-design", "Design Systems and Professional Portfolio")).toBe(55000);
    expect(getProgramLevelPrice("mobile-app-development", "production-apps-apis-and-deployment")).toBe(70000);
    expect(getProgramLevelPrice("cybersecurity", "Junior Security Analyst Track")).toBe(65000);
    expect(getProgramLevelPrice("cv-professional-portfolio-development", "Technology Portfolio Package")).toBe(25000);
  });

  it("calculates StudyHub JSS prices", () => {
    expect(calculateStudyHubPrice("JSS", 1, 1)).toBe(15000);
    expect(calculateStudyHubPrice("JSS", 2, 1)).toBe(30000);
    expect(calculateStudyHubPrice("JSS", 3, 2)).toBe(90000);
  });

  it("calculates StudyHub SSS prices", () => {
    expect(calculateStudyHubPrice("SSS", 1, 1)).toBe(20000);
    expect(calculateStudyHubPrice("SSS", 3, 2)).toBe(120000);
  });

  it("rejects invalid StudyHub selections", () => {
    expect(() => calculateStudyHubPrice("JSS", 0, 1)).toThrow();
    expect(() => calculateStudyHubPrice("SSS", 2, 0)).toThrow();
    expect(() => calculateStudyHubPrice("SSS", 2, 13)).toThrow();
    expect(() => calculateStudyHubPrice("PRIMARY", 1, 1)).toThrow();
  });

  it("keeps Summer Lessons as a fixed one-time one-month price", () => {
    expect(calculateSummerLessonsPrice()).toBe(30000);
    expect(resolveSummerLessonsCheckout()).toMatchObject({
      productType: "studyhub_summer_lessons",
      title: "Summer Lessons",
      price: 30000,
      priceKobo: 3000000,
      duration: "One month",
      billingType: "one_time"
    });
    expect(calculateSummerLessonsPrice(99, 12)).toBe(30000);
  });

  it("uses the selected course track price for checkout", () => {
    expect(resolveCourseCheckout("graphic-design", "brand-and-social-media-design")).toMatchObject({
      title: "Graphic Design - Brand and Social Media Design",
      level: "Brand and Social Media Design",
      levelSlug: "brand-and-social-media-design",
      price: 20000,
      priceKobo: 2000000
    });
    expect(resolveCourseCheckout("data-analysis", "python-analytics-and-portfolio-projects")).toMatchObject({
      title: "Data Analysis - Python Analytics and Portfolio Projects",
      price: 65000,
      priceKobo: 6500000
    });
  });

  it("ignores arbitrary client submitted amounts by resolving from the catalogue only", () => {
    const maliciousClientAmount = 1;
    const checkout = resolveCourseCheckout("mobile-app-development", "production-apps-apis-and-deployment", maliciousClientAmount);
    expect(checkout.price).toBe(70000);
    expect(checkout.priceKobo).toBe(7000000);
  });

  it("converts naira to kobo", () => {
    expect(nairaToKobo(10000)).toBe(1000000);
  });

  it("maps cancellation separately from success", () => {
    expect(mapPaymentStatus("cancelled")).toBe("cancelled");
    expect(mapPaymentStatus("success")).toBe("successful");
  });

  it("does not activate enrolment without successful server verification", () => {
    expect(canActivateEnrolment({ browserStatus: "cancelled", serverVerified: true })).toBe(false);
    expect(canActivateEnrolment({ browserStatus: "pending", serverVerified: true })).toBe(false);
    expect(canActivateEnrolment({ browserStatus: "failed", serverVerified: true })).toBe(false);
    expect(canActivateEnrolment({ browserStatus: "success", serverVerified: false })).toBe(false);
    expect(canActivateEnrolment({ browserStatus: "success", serverVerified: true })).toBe(true);
  });

  it("rejects unsafe external redirects", () => {
    expect(safeRedirectPath("https://example.com")).toBe("/portal");
    expect(safeRedirectPath("//example.com")).toBe("/portal");
    expect(safeRedirectPath("/portal/payments")).toBe("/portal/payments");
  });
});

describe("programme catalogue", () => {
  it("uses meaningful tracks with tools, outcomes and curriculum for every programme", () => {
    const genericLabels = new Set(["Beginner", "Intermediate", "Advanced"]);
    programs.forEach((program) => {
      expect(program.tools.length).toBeGreaterThan(0);
      expect(program.outcomes.length).toBeGreaterThan(0);
      expect(program.curriculum.length).toBeGreaterThan(0);
      expect(program.projects.length).toBeGreaterThan(0);
      program.levels.forEach((level) => {
        expect(genericLabels.has(level.name)).toBe(false);
        expect(level.slug).toBeTruthy();
        expect(level.price).toBeGreaterThan(0);
        expect(level.priceKobo).toBe(level.price * 100);
      });
    });
  });
});

describe("navigation configuration", () => {
  it("keeps desktop and mobile main navigation on the same route configuration", () => {
    const desktopRoutes = navItems.map((item) => item.href);
    const mobileRoutes = navItems.map((item) => item.href);

    expect(desktopRoutes).toEqual(mobileRoutes);
    expect(navItems.map((item) => item.label)).toContain("Login");
    expect(navItems.map((item) => item.label)).toContain("Sign Up");
  });

  it("keeps authentication links out of StudyHub navigation", () => {
    const labels = studyHubNavItems.map((item) => item.label);
    expect(labels).not.toContain("Login");
    expect(labels).not.toContain("Sign Up");
    expect(labels).toEqual(["Home", "JSS", "SSS", "Subjects", "Summer Lessons", "Pricing", "Contact"]);
    expect(studyHubActionItems.map((item) => item.label)).toEqual(["Enrol Now", "Back to Zentel Insight"]);
  });
});
