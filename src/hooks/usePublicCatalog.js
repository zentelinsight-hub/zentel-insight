import { useAsyncData } from "./useAsyncData";
import { getCheckoutProgramBySlug, getPublishedProgramBySlug, getPublishedPrograms } from "../services/programCatalogService";

export function usePublicPrograms() {
  return useAsyncData(() => getPublishedPrograms(), []);
}

export function usePublicProgram(slug) {
  return useAsyncData(() => getPublishedProgramBySlug(slug), [slug]);
}

export function useCheckoutProgram(slug) {
  return useAsyncData(() => getCheckoutProgramBySlug(slug), [slug], { enabled: Boolean(slug) });
}
