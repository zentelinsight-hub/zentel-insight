import { useEffect, useState } from "react";
import {
  CreditCard,
  GraduationCap,
  RefreshCw,
  School,
  Send,
  Users
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import PortalBackButton from "../components/portal/PortalBackButton";
import { useAuth } from "../context/authHooks";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  getAdminAcademyWorkspace,
  getAssessmentDetail,
  getStudentAcademyDashboard,
  getStudentTransactions,
  getTutorClassroomWorkspace,
  getTutorClassrooms,
  assignStudentClassroom,
  assignTutorClassroom,
  saveAssessmentQuestion,
  saveClassroom,
  saveClassroomAssessment,
  saveClassroomTimetableEntry,
  saveCohort,
  saveGradingWeights,
  saveSubmissionGrade,
  submitStudentAssessment,
  submitStudentQuiz,
  uploadSubmissionFiles
} from "../services/academyService";
import { searchAdminStudents, searchAdminTutors } from "../services/adminService";
import { formatCurrency, formatDateTime } from "../utils/format";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function percent(value) {
  return value == null ? "Not calculated" : `${Number(value).toFixed(1)}%`;
}

function AcademyError({ message, retry }) {
  return (
    <div className="notice-card portal-state-card" role="alert">
      <h2>We could not load this section</h2>
      <p>{message || "Try again. Your records have not been changed."}</p>
      <button className="button button-primary" type="button" onClick={retry}><RefreshCw size={17} />Try Again</button>
    </div>
  );
}

function AcademyEmpty({ title, message }) {
  return <div className="notice-card portal-state-card"><h2>{title}</h2><p>{message}</p></div>;
}

function PageHeading({ eyebrow, title, description, backTo, actions }) {
  return (
    <div className="portal-page-heading academy-heading">
      <div>
        {backTo ? <PortalBackButton fallback={backTo} /> : null}
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions}
    </div>
  );
}

function SectionTabs({ items }) {
  const location = useLocation();
  return (
    <nav className="academy-tabs" aria-label="Section pages">
      {items.map(([to, label, Icon]) => (
        <Link className={location.pathname === to || location.pathname.startsWith(`${to}/`) ? "active" : ""} to={to} key={to}>
          <Icon size={17} aria-hidden="true" />{label}
        </Link>
      ))}
    </nav>
  );
}

function AssessmentList({ assessments, filter = "all" }) {
  const records = list(assessments).filter((item) => filter === "all" || item.assessment_type === filter);
  if (!records.length) return <AcademyEmpty title="No assessments here" message="Published classroom work will appear here when your Tutor releases it." />;
  return (
    <div className="portal-record-grid academy-record-grid">
      {records.map((item) => (
        <article className="portal-record-card" key={item.id}>
          <div><span className="portal-tag">{String(item.assessment_type || "assignment").replace(/_/g, " ")}</span>{item.submission_status ? <span className="portal-tag success">{item.submission_status.replace(/_/g, " ")}</span> : null}</div>
          <h3>{item.title}</h3>
          <p>{item.instructions || "Open this assessment for the complete instructions."}</p>
          <small>{item.due_at ? `Due ${formatDateTime(item.due_at)}` : "No due date"}</small>
          <Link className="button button-secondary" to={`/portal/learning/assessments/${item.id}`}>Open assessment</Link>
        </article>
      ))}
    </div>
  );
}

function StudentAssessmentDetail() {
  const { assessmentId } = useParams();
  const query = useAsyncData(() => getAssessmentDetail(assessmentId), [assessmentId], { errorMessage: "This assessment could not be loaded." });
  const [body, setBody] = useState("");
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const detail = query.data;
  const assessment = detail?.assessment;
  const isOnline = ["quiz", "test"].includes(assessment?.assessment_type);

  useEffect(() => setBody(detail?.submission?.submission_text || ""), [detail?.submission?.submission_text]);

  function updateAnswer(question, value, checked) {
    setAnswers((current) => {
      if (question.questionType !== "multiple_response") return { ...current, [question.id]: value };
      const existing = list(current[question.id]);
      return { ...current, [question.id]: checked ? [...new Set([...existing, value])] : existing.filter((item) => item !== value) };
    });
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setStatus({ type: "", message: "" });
    try {
      const requestId = crypto.randomUUID();
      if (isOnline) {
        const result = await submitStudentQuiz({ assessmentId, answers, requestId });
        setStatus({ type: "success", message: result.resultPublished ? `Submitted. Your score is ${result.autoScore}/${result.maximumScore}.` : "Submitted successfully. Your result will appear after release." });
      } else {
        const submission = await submitStudentAssessment({ assessmentId, body, requestId });
        await uploadSubmissionFiles({ submission, files, allowedTypes: assessment.allowed_file_types, maximumSize: assessment.maximum_file_size });
        setStatus({ type: "success", message: `Submitted successfully. Receipt: ${submission.receipt_number}` });
      }
      query.refetch();
    } catch (error) {
      setStatus({ type: "warning", message: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (query.loading) return <div className="route-loader">Loading assessment</div>;
  if (query.error) return <AcademyError message={query.error} retry={query.refetch} />;
  if (!assessment) return <AcademyEmpty title="Assessment not found" message="It may have been withdrawn or is not assigned to your classroom." />;

  return (
    <div className="portal-page academy-workspace">
      <PageHeading eyebrow="Learning" title={assessment.title} description={assessment.instructions || "Complete and submit your work below."} backTo="/portal/learning/assignments" />
      <div className="academy-detail-meta"><span className="portal-tag">{assessment.assessment_type}</span><span>Maximum score: {assessment.maximum_score}</span><span>{assessment.due_at ? `Due ${formatDateTime(assessment.due_at)}` : "No due date"}</span></div>
      <form className="form-card academy-submission-form" onSubmit={submit}>
        {isOnline ? list(detail.questions).map((question, index) => (
          <fieldset className="academy-question" key={question.id}>
            <legend>{index + 1}. {question.prompt} <small>({question.points} points)</small></legend>
            {["multiple_choice", "multiple_response", "true_false"].includes(question.questionType)
              ? list(question.options).map((option) => (
                <label className="academy-option" key={option.id}>
                  <input
                    type={question.questionType === "multiple_response" ? "checkbox" : "radio"}
                    name={question.id}
                    value={option.id}
                    checked={question.questionType === "multiple_response" ? list(answers[question.id]).includes(option.id) : answers[question.id] === option.id}
                    onChange={(event) => updateAnswer(question, option.id, event.target.checked)}
                  />
                  <span>{option.text}</span>
                </label>
              ))
              : <textarea value={answers[question.id] || ""} onChange={(event) => updateAnswer(question, event.target.value, true)} rows={question.questionType === "essay" ? 7 : 3} required />}
          </fieldset>
        )) : (
          <>
            <label><span>Your work</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows="10" placeholder="Write your response here" /></label>
            <label><span>Attachments</span><input type="file" multiple accept={list(assessment.allowed_file_types).join(",")} onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
            {files.length ? <p>{files.length} file{files.length === 1 ? "" : "s"} selected</p> : null}
          </>
        )}
        {status.message ? <div className={`form-status ${status.type}`} role="status">{status.message}</div> : null}
        <button className="button button-primary" disabled={busy} type="submit"><Send size={17} />{busy ? "Submitting..." : "Submit work"}</button>
      </form>
    </div>
  );
}

function StudentTransactions() {
  const query = useAsyncData(getStudentTransactions, [], { errorMessage: "Your transaction history could not be loaded." });
  if (query.loading) return <div className="route-loader">Loading transactions</div>;
  if (query.error) return <AcademyError message={query.error} retry={query.refetch} />;
  return (
    <div className="portal-page academy-workspace">
      <PageHeading eyebrow="Account" title="Transactions" description="Server-verified programme and Zentel AI payments connected to your account." />
      <SectionTabs items={[["/portal/account", "Account", GraduationCap], ["/portal/account/payments", "Transactions", CreditCard]]} />
      {!query.data?.length ? <AcademyEmpty title="No connected transactions" message="Verified payments will appear here after Paystack confirmation or secure email claiming." /> : (
        <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Reference</th><th>Item</th><th>Amount</th><th>Payment</th><th>Fulfilment</th><th>Date</th></tr></thead><tbody>
          {query.data.map((item) => <tr key={item.id}><td>{item.reference}</td><td>{item.product_name}</td><td>{formatCurrency(Number(item.expected_amount_kobo || 0) / 100)}</td><td><span className={item.verification_status === "verified" ? "portal-tag success" : "portal-tag warning"}>{item.verification_status}</span></td><td>{item.fulfilment_status?.replace(/_/g, " ")}</td><td>{formatDateTime(item.paid_at || item.created_at)}</td></tr>)}
        </tbody></table></div>
      )}
    </div>
  );
}

function StudentAcademyDashboard({ view }) {
  const query = useAsyncData(getStudentAcademyDashboard, [], { errorMessage: "Your academy workspace could not be loaded." });
  if (query.loading) return <div className="route-loader">Loading academy workspace</div>;
  if (query.error) return <AcademyError message={query.error} retry={query.refetch} />;
  const data = query.data || {};
  if (!data.classroom) return <div className="portal-page"><PageHeading eyebrow="Student Portal" title="Academy" description="Your learning workspace." /><AcademyEmpty title="Classroom assignment pending" message="Your active programme payment or Admin assignment must be linked before classroom content becomes available." /></div>;
  const filter = view === "quizzes" ? "quiz" : view === "tests" ? "test" : view === "projects" ? "project" : "all";
  const titles = { learning: "Modules & Lessons", timetable: "Timetable", assignments: "Assignments", quizzes: "Quizzes", tests: "Tests", projects: "Projects", grades: "Grades", performance: "Performance", attendance: "Attendance", account: "Account" };
  return (
    <div className="portal-page academy-workspace">
      <PageHeading eyebrow="Learning" title={titles[view] || "Learning"} description={`${data.classroom.program_title} | ${data.classroom.track_title} | ${data.classroom.cohort_name}`} />
      {view === "learning" ? <section><h3>Modules</h3>{list(data.modules).length ? <div className="portal-list">{data.modules.map((item) => <article className="portal-record-card" key={item.id}><strong>{item.title}</strong><span>{item.description || "Published classroom module"}</span></article>)}</div> : <AcademyEmpty title="No modules published" message="Published modules and lessons will appear here." />}</section> : null}
      {view === "timetable" ? <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Day</th><th>Class</th><th>Time</th><th>Delivery</th></tr></thead><tbody>{list(data.timetable).map((item) => <tr key={item.id}><td>{days[item.day_of_week]}</td><td>{item.title}<small>{item.module_title ? ` | ${item.module_title}` : ""}</small></td><td>{String(item.start_time).slice(0, 5)} - {String(item.end_time).slice(0, 5)} WAT</td><td>{item.delivery_method || "Online"}</td></tr>)}</tbody></table></div> : null}
      {["assignments", "quizzes", "tests", "projects"].includes(view) ? <AssessmentList assessments={data.assessments} filter={filter} /> : null}
      {view === "grades" ? <section><h3>Published grades</h3>{list(data.grades).length ? <div className="portal-list">{data.grades.map((grade) => <article className="portal-record-card" key={grade.id}><strong>{grade.title}</strong><span>{grade.score}/{grade.maximum_score} | {percent(grade.percentage)}</span><p>{grade.feedback || "No feedback added."}</p></article>)}</div> : <AcademyEmpty title="No grades published" message="Published results will appear here." />}</section> : null}
      {view === "performance" ? <dl className="portal-detail-rows"><div><dt>Overall</dt><dd>{percent(data.performance?.overall_percentage)}</dd></div><div><dt>Attendance</dt><dd>{percent(data.performance?.attendance_percentage)}</dd></div><div><dt>Completed assessments</dt><dd>{data.performance?.completed_assessments || 0}</dd></div><div><dt>Missing assessments</dt><dd>{data.performance?.missing_assessments || 0}</dd></div></dl> : null}
      {view === "attendance" ? <section><h3>Attendance</h3>{list(data.attendance).length ? <div className="portal-list">{data.attendance.map((record) => <article className="portal-record-card" key={record.id}><strong>{record.title}</strong><span>{record.session_date} | {record.status.replace(/_/g, " ")}</span></article>)}</div> : <AcademyEmpty title="No attendance records" message="Your classroom attendance will appear here." />}</section> : null}
    </div>
  );
}

export function StudentAcademyPage({ view = "learning" }) {
  if (view === "assessment-detail") return <StudentAssessmentDetail />;
  if (view === "transactions") return <StudentTransactions />;
  return <StudentAcademyDashboard view={view} />;
}

function GradeForm({ submission, onSaved }) {
  const [score, setScore] = useState(submission.score ?? "");
  const [feedback, setFeedback] = useState(submission.feedback || "");
  const [status, setStatus] = useState("draft");
  const [reason, setReason] = useState("Initial grading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await saveSubmissionGrade({ submissionId: submission.id, score, feedback, status, reason }); setMessage(status === "published" ? "Grade published." : "Grade saved."); onSaved(); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <form className="academy-grade-form" onSubmit={save}><strong>{submission.assignments?.title || "Submission"}</strong><small>{submission.receipt_number || submission.id}</small><label><span>Score</span><input type="number" min="0" max={submission.assignments?.maximum_score || 100} value={score} onChange={(event) => setScore(event.target.value)} /></label><label><span>Feedback</span><textarea rows="3" value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label><label><span>Decision</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Save draft</option><option value="published">Publish grade</option><option value="returned_for_correction">Return for correction</option><option value="withheld">Withhold</option></select></label><label><span>Change reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} required /></label>{message ? <div className="form-status" role="status">{message}</div> : null}<button className="button button-primary" disabled={busy} type="submit">{busy ? "Saving..." : "Save grade"}</button></form>;
}

export function TutorAcademySection({ view = "classrooms", classroomIdOverride = "" }) {
  const { user } = useAuth();
  const classroomsQuery = useAsyncData(getTutorClassrooms, [], { errorMessage: "Your assigned classrooms could not be loaded." });
  const [classroomId, setClassroomId] = useState(() => classroomIdOverride || window.sessionStorage.getItem("zentel:tutor-classroom") || "");
  useEffect(() => { if (classroomIdOverride) setClassroomId(classroomIdOverride); }, [classroomIdOverride]);
  useEffect(() => { if (!classroomId && classroomsQuery.data?.[0]) setClassroomId(classroomsQuery.data[0].classroom_id); }, [classroomId, classroomsQuery.data]);
  useEffect(() => { if (classroomId) window.sessionStorage.setItem("zentel:tutor-classroom", classroomId); }, [classroomId]);
  const workspaceQuery = useAsyncData(() => getTutorClassroomWorkspace(classroomId), [classroomId], { enabled: Boolean(classroomId), errorMessage: "The selected classroom could not be loaded." });
  const [assessment, setAssessment] = useState({ title: "", instructions: "", assessmentType: "assignment", maximumScore: 100, status: "draft", dueAt: "", maximumAttempts: 1, timeLimit: "" });
  const [question, setQuestion] = useState({ assessmentId: "", questionType: "multiple_choice", prompt: "", points: 1, optionA: "", optionB: "", correct: "a" });
  const [timetable, setTimetable] = useState({ title: "", dayOfWeek: 1, startTime: "16:00", endTime: "17:00", deliveryMethod: "online", meetingUrl: "" });
  const [status, setStatus] = useState("");
  const data = workspaceQuery.data || {};
  const classroom = data.classroom;

  async function createAssessment(event) {
    event.preventDefault(); setStatus("");
    try {
      const saved = await saveClassroomAssessment({ ...assessment, classroomId, programId: classroom.program_id, trackId: classroom.track_id });
      setQuestion((current) => ({ ...current, assessmentId: saved.id }));
      setAssessment({ title: "", instructions: "", assessmentType: "assignment", maximumScore: 100, status: "draft", dueAt: "", maximumAttempts: 1, timeLimit: "" });
      setStatus("Assessment saved. Add questions for quizzes and tests, then publish when ready."); workspaceQuery.refetch();
    } catch (error) { setStatus(error.message); }
  }

  async function createQuestion(event) {
    event.preventDefault(); setStatus("");
    try {
      const objective = ["multiple_choice", "true_false"].includes(question.questionType);
      const options = objective ? [{ text: question.optionA, isCorrect: question.correct === "a", displayOrder: 1 }, { text: question.optionB, isCorrect: question.correct === "b", displayOrder: 2 }] : [];
      await saveAssessmentQuestion({ ...question, options, correctAnswer: null });
      setQuestion((current) => ({ ...current, prompt: "", optionA: "", optionB: "" })); setStatus("Question saved.");
    } catch (error) { setStatus(error.message); }
  }

  async function createTimetable(event) {
    event.preventDefault(); setStatus("");
    try { await saveClassroomTimetableEntry({ ...timetable, classroomId, cohortId: classroom.cohort_id, programId: classroom.program_id, trackId: classroom.track_id, tutorId: user?.id }); setStatus("Timetable entry saved."); workspaceQuery.refetch(); }
    catch (error) { setStatus(error.message); }
  }

  if (classroomsQuery.loading) return <div className="route-loader">Loading classrooms</div>;
  if (classroomsQuery.error) return <AcademyError message={classroomsQuery.error} retry={classroomsQuery.refetch} />;
  if (!classroomsQuery.data?.length) return <AcademyEmpty title="No assigned classrooms" message="An Admin must assign your Tutor account to at least one active classroom." />;
  return (
    <div className="portal-page academy-workspace">
      <PageHeading eyebrow="Tutor Portal" title={{ students: "Students", timetable: "Timetable", modules: "Modules & Lessons", quizzes: "Quizzes & Tests", submissions: "Submissions", gradebook: "Gradebook", performance: "Performance", assessment: "Assessment", teaching: "Teaching" }[view] || "Classrooms"} description="Review the selected classroom workspace." actions={<label className="academy-classroom-switcher"><span>Current classroom</span><select value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>{classroomsQuery.data.map((item) => <option value={item.classroom_id} key={item.classroom_id}>{item.classroom_name} | {item.cohort_name}</option>)}</select></label>} />
      {workspaceQuery.loading ? <div className="route-loader">Loading selected classroom</div> : null}
      {workspaceQuery.error ? <AcademyError message={workspaceQuery.error} retry={workspaceQuery.refetch} /> : null}
      {status ? <div className="form-status" role="status">{status}</div> : null}
      {classroom && ["classrooms", "students"].includes(view) ? <><div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Student</th><th>ID</th><th>Status</th><th>Performance</th><th>Attendance</th></tr></thead><tbody>{list(data.students).map((student) => <tr key={student.user_id}><td>{student.full_name}</td><td>{student.portal_id}</td><td>{student.account_status}</td><td>{percent(student.overall_percentage)}</td><td>{percent(student.attendance_percentage)}</td></tr>)}</tbody></table></div></> : null}
      {classroom && ["teaching", "timetable"].includes(view) ? <div className="portal-two-column"><form className="form-card management-form" onSubmit={createTimetable}><h3>Add timetable period</h3><label><span>Class title</span><input value={timetable.title} onChange={(event) => setTimetable({ ...timetable, title: event.target.value })} required /></label><label><span>Day</span><select value={timetable.dayOfWeek} onChange={(event) => setTimetable({ ...timetable, dayOfWeek: event.target.value })}>{days.slice(1, 6).map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></label><div className="form-grid"><label><span>Starts</span><input type="time" min="16:00" max="21:00" value={timetable.startTime} onChange={(event) => setTimetable({ ...timetable, startTime: event.target.value })} /></label><label><span>Ends</span><input type="time" min="16:00" max="21:00" value={timetable.endTime} onChange={(event) => setTimetable({ ...timetable, endTime: event.target.value })} /></label></div><label><span>Meeting URL</span><input type="url" value={timetable.meetingUrl} onChange={(event) => setTimetable({ ...timetable, meetingUrl: event.target.value })} /></label><button className="button button-primary" type="submit">Save period</button></form><section><h3>Published timetable</h3><div className="portal-list">{list(data.timetable).map((item) => <article className="portal-record-card" key={item.id}><strong>{days[item.day_of_week]} | {item.title}</strong><span>{String(item.start_time).slice(0, 5)} - {String(item.end_time).slice(0, 5)} WAT</span></article>)}</div></section></div> : null}
      {classroom && view === "modules" ? <div className="portal-list">{list(data.modules).map((item) => <article className="portal-record-card" key={item.id}><strong>{item.title}</strong><span>{item.description || "Published classroom module"}</span></article>)}{!list(data.modules).length ? <AcademyEmpty title="No modules published" message="Published modules and lessons will appear here." /> : null}</div> : null}
      {classroom && ["assessment", "quizzes", "submissions", "gradebook"].includes(view) ? <><div className="portal-two-column"><form className="form-card management-form" onSubmit={createAssessment}><h3>Create assessment</h3><label><span>Title</span><input value={assessment.title} onChange={(event) => setAssessment({ ...assessment, title: event.target.value })} required /></label><label><span>Type</span><select value={assessment.assessmentType} onChange={(event) => setAssessment({ ...assessment, assessmentType: event.target.value })}><option value="assignment">Assignment</option><option value="quiz">Quiz</option><option value="test">Test</option><option value="project">Project</option><option value="practical">Practical</option></select></label><label><span>Instructions</span><textarea rows="4" value={assessment.instructions} onChange={(event) => setAssessment({ ...assessment, instructions: event.target.value })} /></label><div className="form-grid"><label><span>Maximum score</span><input type="number" min="1" value={assessment.maximumScore} onChange={(event) => setAssessment({ ...assessment, maximumScore: event.target.value })} /></label><label><span>Due date</span><input type="datetime-local" value={assessment.dueAt} onChange={(event) => setAssessment({ ...assessment, dueAt: event.target.value })} /></label></div><label><span>Status</span><select value={assessment.status} onChange={(event) => setAssessment({ ...assessment, status: event.target.value })}><option value="draft">Draft</option><option value="published">Publish now</option></select></label><button className="button button-primary" type="submit">Save assessment</button></form><form className="form-card management-form" onSubmit={createQuestion}><h3>Add assessment question</h3><label><span>Assessment</span><select value={question.assessmentId} onChange={(event) => setQuestion({ ...question, assessmentId: event.target.value })} required><option value="">Choose assessment</option>{list(data.assessments).filter((item) => ["quiz", "test"].includes(item.assessment_type)).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label><span>Question type</span><select value={question.questionType} onChange={(event) => setQuestion({ ...question, questionType: event.target.value })}><option value="multiple_choice">Multiple choice</option><option value="true_false">True or false</option><option value="short_answer">Short answer</option><option value="essay">Essay</option></select></label><label><span>Question</span><textarea value={question.prompt} onChange={(event) => setQuestion({ ...question, prompt: event.target.value })} required /></label>{["multiple_choice", "true_false"].includes(question.questionType) ? <><label><span>Option A</span><input value={question.optionA} onChange={(event) => setQuestion({ ...question, optionA: event.target.value })} required /></label><label><span>Option B</span><input value={question.optionB} onChange={(event) => setQuestion({ ...question, optionB: event.target.value })} required /></label><label><span>Correct option</span><select value={question.correct} onChange={(event) => setQuestion({ ...question, correct: event.target.value })}><option value="a">Option A</option><option value="b">Option B</option></select></label></> : null}<button className="button button-primary" type="submit">Save question</button></form></div><h3>Submissions and grading</h3>{list(data.submissions).length ? <div className="academy-grade-grid">{data.submissions.map((submission) => <GradeForm submission={submission} onSaved={workspaceQuery.refetch} key={submission.id} />)}</div> : <AcademyEmpty title="No submissions" message="Student work will appear here after submission." />}</> : null}
      {classroom && view === "performance" ? <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Student</th><th>Overall</th><th>Attendance</th><th>Completed</th><th>Missing</th></tr></thead><tbody>{list(data.students).map((student) => <tr key={student.user_id}><td>{student.full_name}</td><td>{percent(student.overall_percentage)}</td><td>{percent(student.attendance_percentage)}</td><td>{student.completed_assessments}</td><td>{student.missing_assessments}</td></tr>)}</tbody></table></div> : null}
    </div>
  );
}

export function AdminAcademySection({ view = "academics" }) {
  const query = useAsyncData(getAdminAcademyWorkspace, [], { errorMessage: "Academy administration records could not be loaded." });
  const tutorQuery = useAsyncData(() => searchAdminTutors({ pageSize: 50 }), [], { enabled: view === "academics", errorMessage: "Tutor accounts could not be loaded." });
  const studentQuery = useAsyncData(() => searchAdminStudents({ pageSize: 50 }), [], { enabled: view === "academics", errorMessage: "Student accounts could not be loaded." });
  const [cohort, setCohort] = useState({ programId: "", trackId: "", name: "", code: "", startDate: "", endDate: "", status: "planned" });
  const [classroom, setClassroom] = useState({ cohortId: "", name: "", code: "", capacity: "", status: "planned" });
  const [tutorAssignment, setTutorAssignment] = useState({ tutorId: "", classroomId: "", role: "lead_tutor", active: true, reason: "Tutor classroom assignment" });
  const [studentAssignment, setStudentAssignment] = useState({ userId: "", classroomId: "", reason: "Student classroom assignment" });
  const [weightForm, setWeightForm] = useState({ classroomId: "", assignment: 25, quiz: 15, test: 20, project: 30, attendance: 10 });
  const [message, setMessage] = useState("");
  if (query.loading) return <div className="route-loader">Loading academy administration</div>;
  if (query.error) return <AcademyError message={query.error} retry={query.refetch} />;
  const data = query.data || {};
  const finance = view === "finance";
  const tracks = list(data.programs).find((item) => item.id === cohort.programId)?.program_levels || [];

  async function submitCohort(event) {
    event.preventDefault(); setMessage("");
    try { await saveCohort(cohort); setCohort({ programId: "", trackId: "", name: "", code: "", startDate: "", endDate: "", status: "planned" }); setMessage("Cohort saved."); query.refetch(); }
    catch (error) { setMessage(error.message); }
  }
  async function submitClassroom(event) {
    event.preventDefault(); setMessage("");
    try { await saveClassroom(classroom); setClassroom({ cohortId: "", name: "", code: "", capacity: "", status: "planned" }); setMessage("Classroom saved."); query.refetch(); }
    catch (error) { setMessage(error.message); }
  }
  async function submitTutorAssignment(event) {
    event.preventDefault(); setMessage("");
    try { await assignTutorClassroom(tutorAssignment); setMessage("Tutor classroom assignment saved."); query.refetch(); }
    catch (error) { setMessage(error.message); }
  }
  async function submitStudentAssignment(event) {
    event.preventDefault(); setMessage("");
    try { await assignStudentClassroom(studentAssignment); setMessage("Student classroom assignment saved."); query.refetch(); }
    catch (error) { setMessage(error.message); }
  }
  async function submitWeights(event) {
    event.preventDefault(); setMessage("");
    try {
      const { classroomId, ...weights } = weightForm;
      await saveGradingWeights(classroomId, weights);
      setMessage("Grading weights saved."); query.refetch();
    } catch (error) { setMessage(error.message); }
  }
  return (
    <div className="portal-page academy-workspace">
      <PageHeading eyebrow="Admin Portal" title={finance ? "Finance" : "Academics"} description={finance ? "Immutable verified transaction and reconciliation records." : "Cohorts, classrooms, Tutor coverage and academic controls."} />
      <SectionTabs items={[["/admin/academics", "Academics", School], ["/admin/finance", "Finance", CreditCard]]} />
      {message ? <div className="form-status" role="status">{message}</div> : null}
      {finance ? <><div className="dashboard-grid"><article className="dashboard-card"><CreditCard size={20} /><span>Transactions</span><strong>{list(data.transactions).length}</strong><small>Latest 200 immutable records</small></article><article className="dashboard-card"><RefreshCw size={20} /><span>Reconciliation Runs</span><strong>{list(data.reconciliations).length}</strong><small>Scheduled, manual and dry runs</small></article></div><div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Reference</th><th>Account</th><th>Amount</th><th>Transaction</th><th>Verification</th><th>Date</th></tr></thead><tbody>{list(data.transactions).map((item) => <tr key={item.id}><td>{item.reference}</td><td>{item.payments?.normalized_email || "Unlinked"}</td><td>{formatCurrency(Number(item.amount_kobo || 0) / 100)}</td><td>{item.transaction_status}</td><td>{item.verification_status}</td><td>{formatDateTime(item.paid_at || item.created_at)}</td></tr>)}</tbody></table></div></> : <>
        <div className="dashboard-grid"><article className="dashboard-card"><School size={20} /><span>Classrooms</span><strong>{list(data.classrooms).length}</strong><small>All statuses</small></article><article className="dashboard-card"><GraduationCap size={20} /><span>Cohorts</span><strong>{list(data.cohorts).length}</strong><small>Programme track intakes</small></article><article className="dashboard-card"><Users size={20} /><span>Tutor Assignments</span><strong>{list(data.tutorAssignments).filter((item) => item.active).length}</strong><small>Active classroom assignments</small></article></div>
        <div className="academy-admin-forms">
          <form className="form-card management-form" onSubmit={submitCohort}><h3>Create cohort</h3><label><span>Programme</span><select value={cohort.programId} onChange={(event) => setCohort({ ...cohort, programId: event.target.value, trackId: "" })} required><option value="">Choose programme</option>{list(data.programs).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label><span>Track</span><select value={cohort.trackId} onChange={(event) => setCohort({ ...cohort, trackId: event.target.value })} required><option value="">Choose track</option>{tracks.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.level_name}</option>)}</select></label><label><span>Name</span><input value={cohort.name} onChange={(event) => setCohort({ ...cohort, name: event.target.value })} required /></label><label><span>Code</span><input value={cohort.code} onChange={(event) => setCohort({ ...cohort, code: event.target.value })} required /></label><label><span>Start date</span><input type="date" value={cohort.startDate} onChange={(event) => setCohort({ ...cohort, startDate: event.target.value })} required /></label><button className="button button-primary" type="submit">Save cohort</button></form>
          <form className="form-card management-form" onSubmit={submitClassroom}><h3>Create classroom</h3><label><span>Cohort</span><select value={classroom.cohortId} onChange={(event) => setClassroom({ ...classroom, cohortId: event.target.value })} required><option value="">Choose cohort</option>{list(data.cohorts).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Name</span><input value={classroom.name} onChange={(event) => setClassroom({ ...classroom, name: event.target.value })} required /></label><label><span>Code</span><input value={classroom.code} onChange={(event) => setClassroom({ ...classroom, code: event.target.value })} required /></label><label><span>Capacity</span><input type="number" min="1" value={classroom.capacity} onChange={(event) => setClassroom({ ...classroom, capacity: event.target.value })} /></label><button className="button button-primary" type="submit">Save classroom</button></form>
          <form className="form-card management-form" onSubmit={submitTutorAssignment}><h3>Assign Tutor</h3><label><span>Tutor</span><select value={tutorAssignment.tutorId} onChange={(event) => setTutorAssignment({ ...tutorAssignment, tutorId: event.target.value })} required><option value="">Choose Tutor</option>{list(tutorQuery.data?.records).map((item) => <option value={item.user_id || item.id} key={item.user_id || item.id}>{item.full_name} ({item.portal_id})</option>)}</select></label><label><span>Classroom</span><select value={tutorAssignment.classroomId} onChange={(event) => setTutorAssignment({ ...tutorAssignment, classroomId: event.target.value })} required><option value="">Choose classroom</option>{list(data.classrooms).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Role</span><select value={tutorAssignment.role} onChange={(event) => setTutorAssignment({ ...tutorAssignment, role: event.target.value })}><option value="lead_tutor">Lead Tutor</option><option value="assistant_tutor">Assistant Tutor</option><option value="reviewer">Reviewer</option></select></label><label><span>Reason</span><input value={tutorAssignment.reason} onChange={(event) => setTutorAssignment({ ...tutorAssignment, reason: event.target.value })} required /></label><button className="button button-primary" type="submit">Save assignment</button></form>
          <form className="form-card management-form" onSubmit={submitStudentAssignment}><h3>Assign Student</h3><label><span>Student</span><select value={studentAssignment.userId} onChange={(event) => setStudentAssignment({ ...studentAssignment, userId: event.target.value })} required><option value="">Choose Student</option>{list(studentQuery.data?.records).map((item) => <option value={item.user_id || item.id} key={item.user_id || item.id}>{item.full_name} ({item.portal_id})</option>)}</select></label><label><span>Classroom</span><select value={studentAssignment.classroomId} onChange={(event) => setStudentAssignment({ ...studentAssignment, classroomId: event.target.value })} required><option value="">Choose classroom</option>{list(data.classrooms).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>Reason</span><input value={studentAssignment.reason} onChange={(event) => setStudentAssignment({ ...studentAssignment, reason: event.target.value })} required /></label><button className="button button-primary" type="submit">Save assignment</button></form>
          <form className="form-card management-form" onSubmit={submitWeights}><h3>Grading weights</h3><label><span>Classroom</span><select value={weightForm.classroomId} onChange={(event) => setWeightForm({ ...weightForm, classroomId: event.target.value })} required><option value="">Choose classroom</option>{list(data.classrooms).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{["assignment", "quiz", "test", "project", "attendance"].map((key) => <label key={key}><span>{key}</span><input type="number" min="0" max="100" value={weightForm[key]} onChange={(event) => setWeightForm({ ...weightForm, [key]: Number(event.target.value) })} /></label>)}<button className="button button-primary" type="submit">Save weights</button></form>
        </div>
        <div className="portal-table-wrap"><table className="portal-table"><thead><tr><th>Classroom</th><th>Programme</th><th>Track</th><th>Cohort</th><th>Students</th><th>Status</th></tr></thead><tbody>{list(data.classrooms).map((item) => <tr key={item.id}><td>{item.name}<small>{item.code}</small></td><td>{item.programs?.title}</td><td>{item.program_levels?.level_name}</td><td>{item.cohorts?.name}</td><td>{list(item.classroom_memberships).filter((member) => member.member_role === "student" && member.active).length}</td><td>{item.status}</td></tr>)}</tbody></table></div>
      </>}
    </div>
  );
}
