import { useMemo, useState } from "react";
import { BookOpen, Calculator, FlaskConical, Landmark, Languages, Microscope, Sigma, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { studyHubPricing } from "../../data/programs";
import { siteConfig } from "../../data/site";
import { usePageMeta } from "../../utils/usePageMeta";
import { StudyHubHero } from "./StudyHubShared";
import { subjectDescriptions } from "./subjectDescriptions";

const iconMap = {
  Mathematics: Sigma,
  "English Language": Languages,
  "Basic Science": Microscope,
  "Basic Technology": Wrench,
  "Business Studies": Landmark,
  Physics: Calculator,
  Chemistry: FlaskConical,
  Biology: Microscope,
  Economics: Landmark
};

function buildSubjects() {
  const all = new Map();
  Object.entries(studyHubPricing).forEach(([group, data]) => {
    if (!Array.isArray(data.subjects)) return;
    data.subjects.forEach((subject) => {
      const current = all.get(subject) || { name: subject, groups: [], classes: [] };
      current.groups.push(group);
      current.classes.push(...data.classes);
      all.set(subject, current);
    });
  });
  return [...all.values()];
}

export default function StudyHubSubjects() {
  const [filter, setFilter] = useState("All");
  const subjects = useMemo(buildSubjects, []);
  const filtered = filter === "All" ? subjects : subjects.filter((subject) => subject.groups.includes(filter));

  usePageMeta({
    path: "/studyhub/subjects",
    title: "StudyHub Subjects | Zentel Insight StudyHub",
    description: "Browse JSS and SSS subjects available through Zentel Insight StudyHub.",
    favicon: siteConfig.studyHub.favicon,
    image: `${siteConfig.domain}${siteConfig.studyHub.ogImage}`
  });

  return (
    <>
      <StudyHubHero
        eyebrow="Subjects"
        title="Choose academic support by subject."
        body="Filter available JSS and SSS subjects, review class eligibility and continue to the enrolment calculator."
        background="studyhub-subjects"
      />

      <section className="page-section">
        <div className="container">
          <div className="filter-bar" role="tablist" aria-label="Subject filters">
            {["All", "JSS", "SSS"].map((option) => (
              <button
                type="button"
                key={option}
                className={filter === option ? "filter-pill active" : "filter-pill"}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="value-grid">
            {filtered.map((subject) => {
              const Icon = iconMap[subject.name] || BookOpen;
              return (
                <article className="value-card subject-card" key={subject.name}>
                  <Icon size={24} aria-hidden="true" />
                  <h2>{subject.name}</h2>
                  <p>{subjectDescriptions[subject.name]}</p>
                  <p><strong>Classes:</strong> {subject.classes.join(", ")}</p>
                  <Link className="button button-primary button-small" to="/studyhub/enrol">
                    Enrol action
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
