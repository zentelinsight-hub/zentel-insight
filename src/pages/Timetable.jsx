import { CalendarDays, Clock } from "lucide-react";
import SectionHeader from "../components/SectionHeader";
import { allTimetablePrograms, timetable } from "../data/timetable";
import { usePageMeta } from "../utils/usePageMeta";

function getProgram(slug) {
  return allTimetablePrograms.find((program) => program.slug === slug);
}

export default function Timetable() {
  usePageMeta({
    path: "/timetable",
    title: "Timetable",
    description:
      "View the Zentel Insight weekly learning timetable for programmes and StudyHub sessions."
  });

  return (
    <>
      <section className="page-hero">
        <div className="container narrow">
          <p className="eyebrow">Timetable</p>
          <h1>A weekly view of learning sessions.</h1>
          <p>
            This timetable is organized for easy updates from a central data file. Instructor names are only shown when
            real instructor data is available.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="container">
          <SectionHeader
            eyebrow="Weekly schedule"
            title="Plan your learning rhythm across programmes."
            description="On smaller screens, each day is shown as a readable stacked schedule."
          />
          <div className="timetable-grid" aria-label="Weekly timetable">
            {timetable.map((day) => (
              <section className="day-column" key={day.day} aria-labelledby={`${day.day}-heading`}>
                <h2 id={`${day.day}-heading`}>
                  <CalendarDays size={18} aria-hidden="true" />
                  {day.day}
                </h2>
                <div className="day-sessions">
                  {day.sessions.map((session) => {
                    const program = getProgram(session.programSlug);
                    return (
                      <article className="session-card" key={`${day.day}-${session.time}-${session.programSlug}`}>
                        <span className="session-time">
                          <Clock size={15} aria-hidden="true" />
                          {session.time}
                        </span>
                        <h3>{program?.title || "Programme"}</h3>
                        <p>{session.classLevel}</p>
                        <span>{session.deliveryMode}</span>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
