function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function track(name, price, summary) {
  return {
    name,
    slug: slugify(name),
    price,
    priceKobo: price * 100,
    summary
  };
}

const flexibleSchedule = "Flexible instructor-led online schedule. Final timetable is provided after enrolment.";
const standardNotice =
  "Third-party software subscriptions, device costs and internet data are not included unless explicitly stated.";

const courseFaq = [
  ["Do I need prior experience?", "Start with the track that matches your current confidence. Foundation tracks are built for new learners."],
  ["Is employment guaranteed?", "No. The programmes build practical skill and portfolio evidence, but no job or income outcome is guaranteed."],
  ["How is payment handled?", "Checkout uses the selected track price from the approved catalogue and card details are handled by Paystack."]
];

function makeProgram(config) {
  return {
    duration: flexibleSchedule,
    deliveryMode: "Guided practical training",
    prerequisites: ["A willingness to practise consistently", "A phone or computer suitable for the selected programme", "Reliable internet access for online sessions"],
    licensingNotice: standardNotice,
    faq: courseFaq,
    enrolmentOpen: true,
    ...config,
    levels: config.tracks,
    features: config.features || config.outcomes.slice(0, 3)
  };
}

export const programs = [
  makeProgram({
    id: "graphic-design",
    slug: "graphic-design",
    title: "Graphic Design",
    shortDescription: "Learn visual communication, brand assets, layout systems, and practical design workflows.",
    fullDescription:
      "A practical design pathway for learners who want to create posters, social content, brand materials, and polished visual assets with confidence.",
    targetLearners: "Students, young creatives, small-business owners, and anyone building visual communication skills.",
    outcomes: ["Apply design principles with better judgement", "Create brand and social-media assets", "Prepare a practical visual portfolio"],
    tools: ["Canva", "Adobe Photoshop", "Adobe Illustrator"],
    curriculum: ["Design principles, colour and typography", "Layout, image editing and composition", "Brand identity, print preparation and portfolio projects"],
    projects: ["Social media campaign set", "Simple brand identity kit", "Print-ready promotional design"],
    tracks: [
      track("Design Foundations", 10000, "Core layout, colour, typography and visual-composition practice."),
      track("Brand and Social Media Design", 20000, "Practical brand assets and platform-ready creative content."),
      track("Visual Identity and Professional Portfolio", 35000, "Portfolio-focused identity systems and presentation work.")
    ],
    icon: "pen-tool",
    featured: true
  }),
  makeProgram({
    id: "web-design-and-development",
    slug: "web-design-and-development",
    title: "Web Design and Development",
    shortDescription: "Build responsive websites with modern frontend foundations and deployment-ready habits.",
    fullDescription:
      "Learners move from layout and styling fundamentals into real website structure, accessibility, responsive design, React foundations and publishing workflows.",
    targetLearners: "Beginners and aspiring web creators who want to build and publish practical websites.",
    outcomes: ["Structure accessible pages", "Style responsive interfaces", "Build and publish practical web projects"],
    tools: ["HTML", "CSS", "JavaScript", "VS Code", "Git", "GitHub", "React", "Supabase where appropriate"],
    curriculum: ["Semantic HTML and responsive CSS", "JavaScript, accessibility and version control", "React, APIs, database-backed applications and deployment"],
    projects: ["Responsive business page", "Interactive frontend component", "Small full-stack web application"],
    tracks: [
      track("Web Foundations", 20000, "HTML, CSS, responsive layout and web publishing foundations."),
      track("Frontend Development", 35000, "JavaScript, accessibility, Git and interactive frontend practice."),
      track("Full-Stack Web Applications", 55000, "React, APIs, Supabase-backed data and deployment workflow.")
    ],
    icon: "code",
    featured: true
  }),
  makeProgram({
    id: "software-development",
    slug: "software-development",
    title: "Software Development",
    shortDescription: "Develop problem-solving habits and software foundations for real application building.",
    fullDescription:
      "A structured introduction to software thinking, application logic, versioning discipline, debugging, testing and practical development workflows.",
    targetLearners: "Learners who want a serious foundation for building software and solving problems with code.",
    outcomes: ["Solve problems with code", "Plan and debug applications", "Use software engineering habits responsibly"],
    tools: ["VS Code", "Git", "GitHub", "JavaScript and/or Python", "PostgreSQL", "testing tools"],
    curriculum: ["Problem solving, algorithms and programming fundamentals", "Object-oriented concepts, databases and APIs", "Testing, architecture and deployment practice"],
    projects: ["Command-line utility", "Database-backed API exercise", "Documented application project"],
    tracks: [
      track("Programming Foundations", 25000, "Programming logic, syntax, debugging and small exercises."),
      track("Application Development", 45000, "Data, APIs, project structure and application workflows."),
      track("Software Engineering Practice", 70000, "Testing, architecture, versioning and deployment readiness.")
    ],
    icon: "terminal"
  }),
  makeProgram({
    id: "video-editing",
    slug: "video-editing",
    title: "Video Editing",
    shortDescription: "Create clear, engaging video stories for education, business, and social platforms.",
    fullDescription:
      "A creative media pathway covering editing rhythm, story structure, audio, captions, exports, motion graphics and practical project delivery.",
    targetLearners: "Creators, students, and business communicators who want cleaner video storytelling skills.",
    outcomes: ["Edit clear visual stories", "Improve audio and captions", "Export platform-ready videos"],
    tools: ["CapCut", "Adobe Premiere Pro", "Adobe After Effects where applicable"],
    curriculum: ["Editing workflow and story structure", "Audio, captions, colour and export settings", "Motion graphics and commercial production workflow"],
    projects: ["Short social video", "Educational explainer edit", "Commercial-style promo sequence"],
    tracks: [
      track("Video Editing Essentials", 15000, "Timeline editing, clips, audio basics and clean exports."),
      track("Professional Editing and Storytelling", 25000, "Narrative rhythm, captions, colour and platform-ready delivery."),
      track("Motion Graphics and Commercial Production", 40000, "Motion elements and campaign-style video projects.")
    ],
    icon: "video",
    featured: true
  }),
  makeProgram({
    id: "python-programming",
    slug: "python-programming",
    title: "Python Programming",
    shortDescription: "Use Python to understand programming logic, automation, and practical problem solving.",
    fullDescription:
      "A hands-on Python pathway designed around readable code, exercises, automation, APIs and confidence with programming fundamentals.",
    targetLearners: "Beginners who want a readable, practical entry point into programming.",
    outcomes: ["Write readable Python", "Automate simple tasks", "Build practical Python mini-projects"],
    tools: ["Python", "VS Code", "Jupyter Notebook", "Git", "Flask or FastAPI where appropriate"],
    curriculum: ["Python syntax and programming fundamentals", "Files, automation, data handling and APIs", "Application structure, testing and project delivery"],
    projects: ["Automation script", "Data or API notebook", "Small Python web/service project"],
    tracks: [
      track("Python Foundations", 18000, "Syntax, control flow, functions and beginner exercises."),
      track("Automation, Data and APIs", 32000, "Useful scripts, files, data handling and API calls."),
      track("Python Application Development", 50000, "Structured apps with Flask or FastAPI where appropriate.")
    ],
    icon: "braces"
  }),
  makeProgram({
    id: "digital-marketing",
    slug: "digital-marketing",
    title: "Digital Marketing",
    shortDescription: "Understand audience, content, campaigns, and digital growth foundations.",
    fullDescription:
      "A practical marketing pathway covering content planning, channel strategy, campaign basics, ethical advertising and measurement habits.",
    targetLearners: "Learners, creators, and entrepreneurs who want a practical marketing foundation.",
    outcomes: ["Plan useful content", "Understand campaign structure", "Measure marketing activity"],
    tools: ["Google Ads", "Google Analytics", "Meta Business Suite", "Mailchimp", "Canva", "content-planning tools"],
    curriculum: ["Audience, positioning and content foundations", "Campaigns, advertising and email basics", "Analytics, reporting and growth strategy"],
    projects: ["Content calendar", "Simple campaign plan", "Analytics report and improvement plan"],
    licensingNotice: "Third-party paid subscriptions and advertising spend are not included.",
    tracks: [
      track("Digital Marketing Foundations", 18000, "Audience, channels, content planning and responsible marketing basics."),
      track("Campaigns, Content and Advertising", 35000, "Campaign setup, ad planning, email and content workflows."),
      track("Analytics and Growth Strategy", 55000, "Measurement, reporting and strategy improvement practice.")
    ],
    icon: "megaphone",
    featured: true
  }),
  makeProgram({
    id: "affiliate-marketing",
    slug: "affiliate-marketing",
    title: "Affiliate Marketing",
    shortDescription: "Learn responsible affiliate marketing foundations, positioning, and conversion basics.",
    fullDescription:
      "A focused introduction to affiliate models, audience fit, ethical promotion, content planning, funnels and performance tracking without income guarantees.",
    targetLearners: "Beginners who want to understand affiliate marketing without misleading shortcuts.",
    outcomes: ["Understand affiliate models", "Match offers with audiences", "Practise ethical promotion"],
    tools: ["Content platforms", "Landing-page builders", "Email tools", "Analytics dashboards", "tracking spreadsheets"],
    curriculum: ["Affiliate marketing models and disclosure", "Campaign and funnel building", "Optimization, measurement and ethical scaling"],
    projects: ["Offer-audience fit worksheet", "Simple content funnel", "Performance tracking template"],
    faq: [["Is income guaranteed?", "No. The course teaches responsible methods and does not guarantee earnings."], ...courseFaq],
    tracks: [
      track("Affiliate Marketing Starter", 12000, "Foundations, disclosure, audience fit and responsible promotion."),
      track("Campaign and Funnel Building", 22000, "Content flow, landing pages, email basics and conversion planning."),
      track("Optimization and Ethical Scaling", 35000, "Measurement, testing and responsible improvement habits.")
    ],
    icon: "network"
  }),
  makeProgram({
    id: "business-management",
    slug: "business-management",
    title: "Business Management",
    shortDescription: "Build practical business organization, planning, and management habits.",
    fullDescription:
      "A practical pathway for understanding business structure, operations, customer thinking, finance basics and organized execution.",
    targetLearners: "Students, founders, and early-career professionals improving business discipline.",
    outcomes: ["Plan business activity", "Understand basic operations", "Improve decision-making habits"],
    tools: ["Google Workspace", "Microsoft Excel", "Trello or Notion", "business-planning templates"],
    curriculum: ["Business essentials and customer thinking", "Operations, finance and customer management", "Strategy, leadership and business growth"],
    projects: ["Simple business plan", "Operations checklist", "Customer and finance tracker"],
    tracks: [
      track("Business Essentials", 15000, "Business structure, customers, offers and planning basics."),
      track("Operations, Finance and Customer Management", 25000, "Organizing work, tracking money and serving customers."),
      track("Strategy, Leadership and Business Growth", 40000, "Decision-making, team habits and growth planning.")
    ],
    icon: "briefcase"
  }),
  makeProgram({
    id: "data-analysis",
    slug: "data-analysis",
    title: "Data Analysis",
    shortDescription: "Learn to organize, interpret, and present data for clearer decisions.",
    fullDescription:
      "A practical data pathway covering data organization, analysis habits, reporting, dashboards and decision-ready presentation.",
    targetLearners: "Learners who want to work with spreadsheets, reports, and data-backed decisions.",
    outcomes: ["Clean and organize data", "Interpret patterns", "Present useful reports"],
    tools: ["Microsoft Excel", "SQL", "Power BI", "Python", "Jupyter Notebook"],
    curriculum: ["Excel data essentials and reporting", "SQL queries and Power BI dashboards", "Python analytics and portfolio projects"],
    projects: ["Spreadsheet analysis report", "Power BI dashboard", "Python data notebook"],
    tracks: [
      track("Excel Data Essentials", 20000, "Spreadsheets, cleaning, formulas, charts and business reporting."),
      track("SQL and Power BI Analysis", 40000, "Querying data and building decision-ready dashboards."),
      track("Python Analytics and Portfolio Projects", 65000, "Python notebooks, analysis workflows and portfolio evidence.")
    ],
    icon: "chart",
    featured: true
  }),
  makeProgram({
    id: "ui-ux-design",
    slug: "ui-ux-design",
    title: "UI/UX Design",
    shortDescription: "Design usable digital interfaces with clear structure and user-centered thinking.",
    fullDescription:
      "A design pathway covering interface structure, usability, flows, wireframes, prototypes, design systems and practical critique.",
    targetLearners: "Design-minded learners who want to build better digital product experiences.",
    outcomes: ["Plan user flows", "Create interface layouts", "Build practical prototypes"],
    tools: ["Figma", "FigJam", "prototyping tools", "usability-testing methods"],
    curriculum: ["UX and interface foundations", "Product design and interactive prototyping", "Design systems and professional portfolio"],
    projects: ["User flow and wireframes", "Interactive prototype", "Mini design system and portfolio case study"],
    tracks: [
      track("UX and Interface Foundations", 20000, "User flows, layout, wireframes and usability basics."),
      track("Product Design and Interactive Prototyping", 35000, "Figma prototyping, product screens and critique practice."),
      track("Design Systems and Professional Portfolio", 55000, "Reusable components, documentation and portfolio presentation.")
    ],
    icon: "layout"
  }),
  makeProgram({
    id: "mobile-app-development",
    slug: "mobile-app-development",
    title: "Mobile App Development",
    shortDescription: "Explore app design, mobile interfaces, and practical application development foundations.",
    fullDescription:
      "A coherent Flutter and Dart pathway for learners interested in building mobile experiences, from interface planning to app logic and deployment concepts.",
    targetLearners: "Learners who want to understand mobile interfaces and app-building foundations.",
    outcomes: ["Plan mobile screens", "Understand app logic", "Build practical mobile app foundations"],
    tools: ["Flutter", "Dart", "Android Studio", "Git", "Supabase or Firebase where appropriate"],
    curriculum: ["Mobile development foundations", "Cross-platform Flutter application development", "Production apps, APIs and deployment concepts"],
    projects: ["Mobile UI prototype", "Flutter feature app", "API-backed mobile project"],
    tracks: [
      track("Mobile Development Foundations", 25000, "Dart basics, mobile UI and development setup."),
      track("Cross-Platform Application Development", 45000, "Flutter screens, navigation, state and local data."),
      track("Production Apps, APIs and Deployment", 70000, "API-backed app flows and release-readiness concepts.")
    ],
    icon: "smartphone"
  }),
  makeProgram({
    id: "cybersecurity-basics",
    slug: "cybersecurity",
    title: "Cybersecurity",
    shortDescription: "Understand digital safety, secure habits, and beginner cybersecurity concepts.",
    fullDescription:
      "A beginner-friendly and ethical pathway into safe digital behavior, security concepts, common risks and responsible defensive practice in authorized labs only.",
    targetLearners: "Learners who want practical security awareness and beginner cybersecurity foundations.",
    outcomes: ["Recognize common risks", "Use safer digital habits", "Understand defensive security concepts"],
    tools: ["Cisco Packet Tracer", "Wireshark", "Linux", "Nmap in authorized labs only"],
    curriculum: ["Security foundations and ethics", "Network and endpoint security concepts", "Junior security analyst workflows in authorized labs"],
    projects: ["Security awareness checklist", "Network lab observation", "Basic incident report template"],
    licensingNotice: "Security tools are introduced only for ethical, authorized lab use. Harmful operational activity is not part of this programme.",
    tracks: [
      track("Cybersecurity Foundations", 20000, "Digital safety, security concepts, ethics and defensive thinking."),
      track("Network and Endpoint Security", 40000, "Network basics, endpoint risks and authorized lab observation."),
      track("Junior Security Analyst Track", 65000, "Monitoring concepts, reporting and defensive workflow practice.")
    ],
    icon: "shield"
  }),
  makeProgram({
    id: "virtual-assistance",
    slug: "virtual-assistance",
    title: "Virtual Assistance",
    shortDescription: "Learn practical remote support, organization, communication, and task-management skills.",
    fullDescription:
      "A practical pathway for learners interested in administrative support, client communication, scheduling, digital operations and remote work systems.",
    targetLearners: "Learners preparing for remote support, administrative, or freelance service roles.",
    outcomes: ["Organize remote tasks", "Communicate professionally", "Use practical support workflows"],
    tools: ["Google Workspace", "Microsoft 365", "Calendly", "Trello", "Asana", "Canva"],
    curriculum: ["Virtual assistant essentials", "Executive and digital operations", "Specialized technical virtual assistance"],
    projects: ["Client communication pack", "Scheduling and task board", "Digital operations checklist"],
    tracks: [
      track("Virtual Assistant Essentials", 12000, "Communication, scheduling and remote-work foundations."),
      track("Executive and Digital Operations", 22000, "Client support, tools and organized digital workflows."),
      track("Specialized Technical Virtual Assistance", 35000, "Technical support workflows and service packaging.")
    ],
    icon: "users"
  }),
  makeProgram({
    id: "content-creation",
    slug: "content-creation",
    title: "Content Creation",
    shortDescription: "Plan, create, and improve practical content for digital channels.",
    fullDescription:
      "A creative pathway covering content planning, audience clarity, production basics, platform analytics and consistent publishing habits.",
    targetLearners: "Creators, students, and small-business communicators building useful content habits.",
    outcomes: ["Plan content clearly", "Create platform-ready pieces", "Improve consistency"],
    tools: ["Canva", "CapCut", "content calendars", "platform analytics"],
    curriculum: ["Content creation foundations", "Video and social content production", "Content strategy and brand growth"],
    projects: ["Content calendar", "Short-form video set", "Brand content plan"],
    tracks: [
      track("Content Creation Foundations", 12000, "Audience clarity, planning and basic content production."),
      track("Video and Social Content Production", 22000, "Practical video, graphics and platform-ready publishing."),
      track("Content Strategy and Brand Growth", 35000, "Content systems, analytics and brand consistency.")
    ],
    icon: "book-open"
  }),
  makeProgram({
    id: "cv-professional-portfolio-development",
    slug: "cv-professional-portfolio-development",
    title: "CV and Professional Portfolio Development",
    shortDescription: "Improve your CV, online profile, and professional portfolio for opportunities.",
    fullDescription:
      "A focused service-package programme for learners preparing for internships, freelance work, applications, LinkedIn presentation or stronger professional visibility.",
    targetLearners: "Learners who need clearer professional presentation and opportunity readiness.",
    outcomes: ["Structure a stronger CV", "Position skills clearly", "Prepare a professional portfolio"],
    tools: ["CV templates", "LinkedIn", "portfolio platforms", "Google Docs or Microsoft Word"],
    curriculum: ["CV structure and achievement writing", "LinkedIn guidance and professional branding", "Portfolio presentation and opportunity readiness"],
    projects: ["Improved CV draft", "LinkedIn/profile checklist", "Portfolio presentation outline"],
    duration: "Workshop format. Final timetable is provided after enrolment.",
    deliveryMode: "Practical review and coaching",
    tracks: [
      track("Career Starter Package", 10000, "CV structure, clearer wording and application-readiness basics."),
      track("Professional Branding Package", 15000, "CV, LinkedIn guidance and professional positioning."),
      track("Technology Portfolio Package", 25000, "Portfolio presentation, project framing and technology-profile polish.")
    ],
    icon: "briefcase"
  })
];

export const studyHubPricing = {
  JSS: {
    label: "Junior Secondary School",
    classes: ["JSS1", "JSS2", "JSS3"],
    pricePerSubjectPerMonth: 15000,
    subjects: ["Mathematics", "English Language", "Basic Science", "Basic Technology", "Business Studies"]
  },
  SSS: {
    label: "Senior Secondary School",
    classes: ["SSS1", "SSS2", "SSS3"],
    pricePerSubjectPerMonth: 20000,
    subjects: ["Mathematics", "English Language", "Physics", "Chemistry", "Biology", "Economics"]
  },
  summerLessons: {
    title: "Summer Lessons",
    slug: "summer-lessons",
    price: 30000,
    priceKobo: 3000000,
    duration: "One month",
    billingType: "one_time",
    pricePerSubject: false,
    classes: ["JSS1", "JSS2", "JSS3", "SSS1", "SSS2", "SSS3"],
    description:
      "A one-time payment for one month of the Summer Lessons programme. It is not charged per subject and does not renew automatically."
  }
};

export const studyHubPrograms = [
  {
    id: "studyhub-academic-support",
    slug: "studyhub-academic-support",
    title: "StudyHub Academic Support",
    shortDescription:
      "Online academic support for junior and senior secondary school students.",
    fullDescription:
      "StudyHub supports JSS and SSS learners with subject-focused online academic support, structured guidance, and clear payment calculation by class, subject count, and months.",
    level: "JSS and SSS",
    duration: "Monthly subject support",
    deliveryMode: "Online academic support",
    price: null,
    features: ["JSS support", "SSS support", "Subject-based monthly pricing"],
    icon: "graduation-cap",
    image: "",
    featured: true,
    enrolmentOpen: true
  }
];

export const programLevels = programs.flatMap((program) =>
  program.levels.map((level) => ({
    programSlug: program.slug,
    programTitle: program.title,
    level: level.name,
    levelSlug: level.slug,
    price: level.price,
    priceKobo: level.priceKobo
  }))
);

export function getProgramBySlug(slug) {
  const aliases = {
    "web-design-development": "web-design-and-development",
    "cybersecurity-basics": "cybersecurity",
    "cv-professional-portfolio": "cv-professional-portfolio-development"
  };
  const normalizedSlug = aliases[slug] || slug;
  return programs.find((program) => program.slug === normalizedSlug);
}

export function getProgramLevel(programSlug, levelSlugOrName) {
  const program = getProgramBySlug(programSlug);
  if (!program) return null;
  const normalized = slugify(levelSlugOrName || program.levels[0]?.slug || "");
  const level = program.levels.find((item) => item.slug === normalized || slugify(item.name) === normalized);
  if (!level) return null;
  return { program, level };
}

export { slugify as slugifyProgramValue };
