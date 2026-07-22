import { useAsyncData } from "./useAsyncData";
import { getPublishedProgramBySlug, getPublishedPrograms } from "../services/programCatalogService";

export function usePublicPrograms() {
  return useAsyncData(() => getPublishedPrograms(), []);
}

export function usePublicProgram(slug) {
  return useAsyncData(() => getPublishedProgramBySlug(slug), [slug]);
}
