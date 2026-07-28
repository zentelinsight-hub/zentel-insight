export const programBannerMap = Object.freeze({
  "graphic-design": { src: "/program-banners/graphic-design.webp", width: 1672, height: 941 },
  "web-design-and-development": { src: "/program-banners/web-design-and-development.webp", width: 1672, height: 941 },
  "software-development": { src: "/program-banners/software-development.webp", width: 1672, height: 941 },
  "video-editing": { src: "/program-banners/video-editing.webp", width: 1774, height: 887 },
  "python-programming": { src: "/program-banners/python-programming.webp", width: 1774, height: 887 },
  "digital-marketing": { src: "/program-banners/digital-marketing.webp", width: 1774, height: 887 },
  "affiliate-marketing": { src: "/program-banners/affiliate-marketing.webp", width: 1536, height: 1024 },
  "business-management": { src: "/program-banners/business-management.webp", width: 1774, height: 887 },
  "data-analysis": { src: "/program-banners/data-analysis.webp", width: 1672, height: 941 },
  "ui-ux-design": { src: "/program-banners/ui-ux-design.webp", width: 1774, height: 887 },
  "mobile-app-development": { src: "/program-banners/mobile-app-development.webp", width: 1774, height: 887 },
  cybersecurity: { src: "/program-banners/cybersecurity.webp", width: 1774, height: 887 },
  "virtual-assistance": { src: "/program-banners/virtual-assistance.webp", width: 1536, height: 1024 },
  "content-creation": { src: "/program-banners/content-creation.webp", width: 1536, height: 1024 },
  "cv-professional-portfolio-development": {
    src: "/program-banners/cv-professional-portfolio-development.webp",
    width: 1536,
    height: 1024
  }
});

export const programBannerAliases = Object.freeze({
  "cybersecurity-basics": "cybersecurity"
});

export function getProgramBanner(programSlug) {
  const slug = String(programSlug || "").trim();
  return programBannerMap[slug] || programBannerMap[programBannerAliases[slug]] || null;
}
