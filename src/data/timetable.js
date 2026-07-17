import { programs, studyHubPrograms } from "./programs";

export const timetableDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const timetable = [
  {
    day: "Monday",
    sessions: [
      { time: "09:00 - 10:30", programSlug: "graphic-design", classLevel: "Design Foundations", deliveryMode: "Practical lab" },
      { time: "11:00 - 12:30", programSlug: "web-design-and-development", classLevel: "Web Foundations", deliveryMode: "Project studio" },
      { time: "14:00 - 15:30", programSlug: "python-programming", classLevel: "Python Foundations", deliveryMode: "Coding practice" }
    ]
  },
  {
    day: "Tuesday",
    sessions: [
      { time: "09:00 - 10:30", programSlug: "digital-marketing", classLevel: "Digital Marketing Foundations", deliveryMode: "Workshop" },
      { time: "11:00 - 12:30", programSlug: "video-editing", classLevel: "Video Editing Essentials", deliveryMode: "Editing studio" },
      { time: "14:00 - 15:30", programSlug: "software-development", classLevel: "Programming Foundations", deliveryMode: "Mentored practice" }
    ]
  },
  {
    day: "Wednesday",
    sessions: [
      { time: "09:00 - 10:30", programSlug: "cv-professional-portfolio-development", classLevel: "Career Starter Package", deliveryMode: "Review session" },
      { time: "11:00 - 12:30", programSlug: "mobile-app-development", classLevel: "Mobile Development Foundations", deliveryMode: "Project studio" },
      { time: "14:00 - 15:30", programSlug: "affiliate-marketing", classLevel: "Affiliate Marketing Starter", deliveryMode: "Workshop" }
    ]
  },
  {
    day: "Thursday",
    sessions: [
      { time: "09:00 - 10:30", programSlug: "web-design-and-development", classLevel: "Frontend Development", deliveryMode: "Project studio" },
      { time: "11:00 - 12:30", programSlug: "graphic-design", classLevel: "Visual Identity and Professional Portfolio", deliveryMode: "Design lab" },
      { time: "14:00 - 15:30", programSlug: "python-programming", classLevel: "Automation, Data and APIs", deliveryMode: "Coding practice" }
    ]
  },
  {
    day: "Friday",
    sessions: [
      { time: "09:00 - 10:30", programSlug: "software-development", classLevel: "Application Development", deliveryMode: "Mentored practice" },
      { time: "11:00 - 12:30", programSlug: "digital-marketing", classLevel: "Campaigns, Content and Advertising", deliveryMode: "Workshop" },
      { time: "14:00 - 15:30", programSlug: "video-editing", classLevel: "Professional Editing and Storytelling", deliveryMode: "Editing studio" }
    ]
  },
  {
    day: "Saturday",
    sessions: [
      { time: "09:00 - 10:30", programSlug: "studyhub-academic-support", classLevel: "StudyHub", deliveryMode: "Structured lesson" },
      { time: "11:00 - 12:30", programSlug: "mobile-app-development", classLevel: "Cross-Platform Application Development", deliveryMode: "Project studio" },
      { time: "13:30 - 15:00", programSlug: "affiliate-marketing", classLevel: "Campaign and Funnel Building", deliveryMode: "Workshop" }
    ]
  }
];

export const allTimetablePrograms = [...programs, ...studyHubPrograms];
