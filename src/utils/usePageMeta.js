import { useEffect } from "react";
import { seoDefaults, siteConfig } from "../data/site";

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
}

function upsertLink(rel, href, type = "") {
  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
  if (rel === "icon") {
    element.type = type || "image/jpeg";
  }
}

export function usePageMeta({
  title = seoDefaults.title,
  description = seoDefaults.description,
  path = "/",
  image,
  imageType = seoDefaults.imageType,
  robots = seoDefaults.robots,
  themeColor,
  favicon,
  faviconType,
  siteName,
  structuredData
}) {
  useEffect(() => {
    const isStudyHub = path.startsWith("/studyhub");
    const activeBrand = isStudyHub ? siteConfig.studyHub : siteConfig.main;
    const resolvedImage = image || (isStudyHub ? `${siteConfig.domain}${siteConfig.studyHub.ogImage}` : seoDefaults.image);
    const resolvedThemeColor = themeColor || activeBrand.primaryColor;
    const resolvedFavicon = favicon || activeBrand.favicon;
    const resolvedSiteName = siteName || activeBrand.name;
    const absoluteUrl = new URL(path, siteConfig.domain).toString();
    const pageTitle = title.includes(siteConfig.name) ? title : `${title} | ${siteConfig.name}`;
    const resolvedFaviconType = faviconType || activeBrand.faviconType || (resolvedFavicon.endsWith(".png") ? "image/png" : "image/jpeg");

    document.title = pageTitle;
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[name="robots"]', { name: "robots", content: robots });
    upsertMeta('meta[name="theme-color"]', { name: "theme-color", content: resolvedThemeColor });
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: pageTitle });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: absoluteUrl });
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: resolvedImage });
    upsertMeta('meta[property="og:image:type"]', { property: "og:image:type", content: imageType });
    upsertMeta('meta[property="og:site_name"]', { property: "og:site_name", content: resolvedSiteName });
    upsertMeta('meta[property="og:type"]', { property: "og:type", content: "website" });
    upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: "summary_large_image" });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: pageTitle });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: resolvedImage });
    upsertLink("canonical", absoluteUrl);
    upsertLink("icon", resolvedFavicon, resolvedFaviconType);

    let jsonLd = document.head.querySelector("#page-structured-data");
    if (structuredData) {
      if (!jsonLd) {
        jsonLd = document.createElement("script");
        jsonLd.id = "page-structured-data";
        jsonLd.type = "application/ld+json";
        document.head.appendChild(jsonLd);
      }
      jsonLd.textContent = JSON.stringify(structuredData);
    } else if (jsonLd) {
      jsonLd.remove();
    }
  }, [title, description, path, image, imageType, robots, themeColor, favicon, faviconType, siteName, structuredData]);
}
