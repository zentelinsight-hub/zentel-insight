export const siteConfig = {
  main: {
    id: "zentel",
    name: "Zentel Insight",
    shortName: "Zentel Insight",
    motto: "Inspiring Creativity, Empowering Minds.",
    domain: "https://zentelinsight.com.ng",
    email: "zentelinsight@gmail.com",
    phone: "07060833927",
    phoneInternational: "+2347060833927",
    whatsappNumber: "2347060833927",
    primaryColor: "#FF914D",
    primaryColorRgb: "255, 145, 77",
    logo: "/brands/zentel-insight/logo.jpg",
    favicon: "/brands/zentel-insight/favicon.jpg",
    faviconType: "image/jpeg",
    ogImage: "/brands/zentel-insight/logo.jpg"
  },
  name: "Zentel Insight",
  motto: "Inspiring Creativity, Empowering Minds.",
  domain: "https://zentelinsight.com.ng",
  primaryColor: "#FF914D",
  description:
    "Zentel Insight helps learners build practical digital skills, creative confidence, and structured learning habits for today's world.",
  contact: {
    email: "zentelinsight@gmail.com",
    phone: "07060833927",
    phoneInternational: "+2347060833927",
    whatsappNumber: "2347060833927",
    location: "",
    responseNote: "Use the official email, phone number, or WhatsApp contact form for enquiries."
  },
  founder: {
    name: "Victor M. Udofiah",
    title: "Owner and Founder",
    bio:
      "Victor M. Udofiah founded Zentel Insight with a focus on practical digital education, creative confidence, and learner support. His work with the platform is centered on helping students, young creatives, and aspiring professionals build useful skills that can grow with them beyond the classroom."
  },
  studyHub: {
    id: "studyhub",
    name: "Zentel Insight StudyHub",
    shortName: "StudyHub",
    parentName: "Zentel Insight",
    domain: "https://zentelinsight.com.ng/studyhub",
    primaryColor: "#04BF63",
    primaryColorRgb: "4, 191, 99",
    email: "zentelinsightstudyhub@gmail.com",
    phone: "07060833927",
    phoneInternational: "+2347060833927",
    whatsappNumber: "2347060833927",
    logo: "/brands/studyhub/logo.png",
    favicon: "/brands/studyhub/favicon.png",
    faviconType: "image/png",
    ogImage: "/brands/studyhub/logo.png",
    description:
      "Zentel Insight StudyHub provides online academic support for junior and senior secondary school students."
  },
  socialLinks: [
    {
      label: "Facebook community",
      href: "https://www.facebook.com/share/18rQhw57y2/",
      type: "facebook"
    }
  ],
  assetPaths: {
    heroVideo: "/videos/hero-video.mp4"
  }
};

export const brandConfig = {
  zentel: siteConfig.main,
  main: siteConfig.main,
  studyhub: siteConfig.studyHub
};

export const navItems = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Programs", href: "/programs" },
  { label: "Community", href: "/community" },
  { label: "Contact", href: "/contact" },
  { label: "Login", href: "/login", variant: "secondary" },
  { label: "Sign Up", href: "/signup", variant: "primary" }
];

export const authenticatedNavItems = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Programs", href: "/programs" },
  { label: "Community", href: "/community" },
  { label: "Contact", href: "/contact" },
  { label: "Student Portal", href: "/portal", variant: "primary" }
];

export const studyHubNavItems = [
  { label: "Home", href: "/studyhub", end: true },
  { label: "JSS", href: "/studyhub/jss" },
  { label: "SSS", href: "/studyhub/sss" },
  { label: "Subjects", href: "/studyhub/subjects" },
  { label: "Summer Lessons", href: "/studyhub/summer-lessons" },
  { label: "Pricing", href: "/studyhub/pricing" },
  { label: "Contact", href: "/studyhub/contact" }
];

export const studyHubActionItems = [
  { label: "Enrol Now", href: "/studyhub/enrol", variant: "primary" },
  { label: "Back to Zentel Insight", href: "/", variant: "secondary" }
];

export const stats = [
  { label: "Learning Areas", value: "15" },
  { label: "Flexible Pathways", value: "Online and in-person ready" },
  { label: "Focus", value: "Practical digital skills" }
];

export const seoDefaults = {
  title: "Zentel Insight | Inspiring Creativity, Empowering Minds.",
  description: siteConfig.description,
  image: `${siteConfig.domain}${siteConfig.main.ogImage}`,
  imageType: "image/jpeg",
  robots: "index,follow"
};
