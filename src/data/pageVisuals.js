export const pageVisualMap = Object.freeze({
  mainHomepage: {
    src: "/page-visuals/main-homepage.webp",
    width: 1672,
    height: 941,
    alt: "Zentel Insight digital-skills learning platform homepage illustration",
    loading: "lazy"
  },
  studentDashboard: {
    src: "/page-visuals/student-dashboard.webp",
    width: 1672,
    height: 941,
    alt: "Illustrative Zentel Insight Student Dashboard with generic course, timetable and learning progress cards",
    loading: "eager"
  },
  tutorDashboard: {
    src: "/page-visuals/tutor-dashboard.webp",
    width: 1672,
    height: 941,
    alt: "Illustrative Zentel Insight Tutor Dashboard with generic classes, students and teaching tools",
    loading: "eager"
  },
  studyHubHomepage: {
    src: "/page-visuals/studyhub-homepage.webp",
    width: 1672,
    height: 941,
    alt: "Zentel Insight StudyHub online learning homepage illustration for secondary-school students",
    loading: "lazy"
  }
});

export function getPageVisual(visualKey) {
  return pageVisualMap[String(visualKey || "").trim()] || null;
}
