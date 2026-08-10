import { useLayoutEffect } from "react";

export function useVisualViewportSize(enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    const body = document.body;
    const viewport = window.visualViewport;

    const updateViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      root.style.setProperty("--portal-visible-height", `${Math.round(height)}px`);
      root.style.setProperty("--portal-visible-top", `${Math.round(offsetTop)}px`);
    };

    root.classList.add("portal-conversation-active");
    body.classList.add("portal-conversation-active");
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);

    return () => {
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
      root.style.removeProperty("--portal-visible-height");
      root.style.removeProperty("--portal-visible-top");
      root.classList.remove("portal-conversation-active");
      body.classList.remove("portal-conversation-active");
    };
  }, [enabled]);
}
