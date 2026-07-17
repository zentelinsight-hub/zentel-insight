import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import ProgramCard from "../components/ProgramCard";
import SectionHeader from "../components/SectionHeader";
import { programs } from "../data/programs";
import { usePageMeta } from "../utils/usePageMeta";

const trackFilters = ["All", "Foundations", "Applications", "Portfolio"];

export default function Programs() {
  const [query, setQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState("All");

  usePageMeta({
    path: "/programs",
    title: "Programs",
    description:
      "Explore Zentel Insight programmes in graphic design, web development, video editing, Python, software development, digital marketing, and more."
  });

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      const trackNames = program.levels.map((item) => item.name).join(" ");
      const matchesQuery = [program.title, program.shortDescription, trackNames, program.deliveryMode]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesTrack =
        trackFilter === "All" ||
        program.levels.some((item) => item.name.toLowerCase().includes(trackFilter.toLowerCase()));
      return matchesQuery && matchesTrack;
    });
  }, [query, trackFilter]);

  return (
    <>
      <section className="page-hero visual-section programs-hero">
        <div className="visual-section__background" aria-hidden="true" />
        <div className="visual-section__overlay" aria-hidden="true" />
        <div className="container narrow visual-section__content">
          <p className="eyebrow">Programs</p>
          <h1>Practical learning pathways for creative and digital growth.</h1>
          <p>
            Browse current Zentel Insight programme areas. Every course shows meaningful learning tracks and prices
            from one trusted catalogue.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="container">
          <div className="filter-bar" role="search">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search programs</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="segmented-control" aria-label="Filter by track">
              {trackFilters.map((item) => (
                <button
                  key={item}
                  className={trackFilter === item ? "active" : ""}
                  type="button"
                  onClick={() => setTrackFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <SectionHeader
            eyebrow="Available pathways"
            title="Choose a programme and select the track that matches your goals."
            description="Each card is backed by the central course catalogue, so displayed prices and checkout prices remain consistent."
          />

          {filteredPrograms.length ? (
            <div className="program-grid">
              {filteredPrograms.map((program) => (
                <ProgramCard key={program.slug} program={program} />
              ))}
            </div>
          ) : (
            <div className="notice-card">
              <h2>No matching programmes</h2>
              <p>Adjust the search or track filter to see available learning pathways.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
