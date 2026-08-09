import { useEffect } from "react";

export function usePortalDedicatedWorkspace(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    document.body.classList.add("portal-dedicated-workspace");
    return () => document.body.classList.remove("portal-dedicated-workspace");
  }, [enabled]);
}
