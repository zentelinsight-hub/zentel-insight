import { getSupabaseClient } from "./supabaseClient";

function list(value) {
  return Array.isArray(value) ? value : [];
}

async function client() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error("The academy service is temporarily unavailable.");
  return supabase;
}

function throwIfError(error, message) {
  if (!error) return;
  if (import.meta.env.DEV) console.info(message, error);
  throw new Error(message);
}

export async function getStudentAcademyDashboard() {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_my_academic_dashboard");
  throwIfError(error, "Your classroom information could not be loaded.");
  return data || { classroom: null, modules: [], timetable: [], assessments: [], grades: [], attendance: [], performance: null, performanceHistory: [] };
}

export async function getAssessmentDetail(assessmentId) {
  if (!assessmentId) return null;
  const supabase = await client();
  const [{ data: assessment, error }, { data: questionData, error: questionError }] = await Promise.all([
    supabase.from("assignments").select("*").eq("id", assessmentId).maybeSingle(),
    supabase.rpc("get_assessment_questions", { target_assessment_id: assessmentId })
  ]);
  throwIfError(error, "This assessment could not be loaded.");
  throwIfError(questionError, "Assessment questions could not be loaded.");
  if (!assessment) return null;
  const { data: submission, error: submissionError } = await supabase
    .from("assignment_submissions")
    .select("*")
    .eq("assignment_id", assessmentId)
    .maybeSingle();
  throwIfError(submissionError, "Your submission could not be loaded.");
  return { assessment, questions: list(questionData), submission };
}

export async function submitStudentAssessment({ assessmentId, body, requestId }) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("submit_classroom_assessment", {
    target_assessment_id: assessmentId,
    submission_body: String(body || "").trim(),
    request_id: requestId
  });
  throwIfError(error, "Your work could not be submitted. Please review it and try again.");
  return data;
}

export async function uploadSubmissionFiles({ submission, files, allowedTypes, maximumSize }) {
  const records = [];
  const selectedFiles = Array.from(files || []);
  if (!selectedFiles.length) return records;
  if (selectedFiles.length > 5) throw new Error("Attach no more than five files to one submission.");
  const supabase = await client();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  throwIfError(userError, "Your account could not be confirmed for file upload.");
  const userId = userData?.user?.id;
  if (!userId || submission?.user_id !== userId) throw new Error("This submission does not belong to your account.");
  const accepted = list(allowedTypes);
  const limit = Number(maximumSize || 10485760);

  for (const file of selectedFiles) {
    if (file.size < 1 || file.size > limit) throw new Error(`${file.name} is larger than the allowed upload size.`);
    if (accepted.length && !accepted.includes(file.type)) throw new Error(`${file.name} is not an accepted file type.`);
    const safeName = String(file.name || "submission-file").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
    const path = `${userId}/${submission.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("assignment-files").upload(path, file, { upsert: false, contentType: file.type });
    throwIfError(uploadError, `${file.name} could not be uploaded.`);
    const { data, error } = await supabase.from("submission_files").insert({
      submission_id: submission.id,
      uploader_id: userId,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type,
      file_size: file.size
    }).select().single();
    if (error) {
      await supabase.storage.from("assignment-files").remove([path]);
      throwIfError(error, `${file.name} could not be attached to the submission.`);
    }
    records.push(data);
  }
  return records;
}

export async function submitStudentQuiz({ assessmentId, answers, requestId }) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("submit_assessment_attempt", {
    target_assessment_id: assessmentId,
    submitted_answers: answers || {},
    attempt_request_id: requestId
  });
  throwIfError(error, "Your answers could not be submitted. Please try again.");
  return data;
}

export async function getStudentTransactions() {
  const supabase = await client();
  const { data, error } = await supabase
    .from("payments")
    .select("id, reference, product_name, product_type, expected_amount_kobo, currency, status, verification_status, fulfilment_status, paid_at, created_at, payment_transactions(id, transaction_status, verification_status, paid_at, created_at), payment_fulfilments(id, fulfilment_type, status, fulfilled_at)")
    .order("created_at", { ascending: false });
  throwIfError(error, "Your transaction history could not be loaded.");
  return list(data);
}

export async function getTutorClassrooms() {
  const supabase = await client();
  const { data, error } = await supabase.rpc("get_my_tutor_classrooms");
  throwIfError(error, "Assigned classrooms could not be loaded.");
  return list(data);
}

export async function getTutorClassroomWorkspace(classroomId) {
  if (!classroomId) return { classroom: null, students: [], modules: [], timetable: [], assessments: [], submissions: [], attendanceSessions: [] };
  const supabase = await client();
  const [classroomResult, studentsResult, modulesResult, timetableResult, assessmentsResult, submissionsResult, attendanceResult] = await Promise.all([
    supabase.from("classrooms").select("*, programs(id, title), program_levels!classrooms_track_id_fkey(id, level_name), cohorts(id, name, start_date, end_date)").eq("id", classroomId).maybeSingle(),
    supabase.rpc("get_classroom_student_performance", { target_classroom_id: classroomId }),
    supabase.from("academy_modules").select("*").eq("classroom_id", classroomId).order("display_order"),
    supabase.from("timetable_entries").select("*").eq("classroom_id", classroomId).order("day_of_week").order("start_time"),
    supabase.from("assignments").select("*").eq("classroom_id", classroomId).order("created_at", { ascending: false }),
    supabase.from("assignment_submissions").select("*, assignments!inner(id, title, assessment_type, maximum_score)").eq("classroom_id", classroomId).order("submitted_at", { ascending: false }),
    supabase.from("attendance_sessions").select("*, attendance_records(*)").eq("classroom_id", classroomId).order("session_date", { ascending: false })
  ]);
  throwIfError(classroomResult.error, "The selected classroom could not be loaded.");
  throwIfError(studentsResult.error, "Classroom Students could not be loaded.");
  throwIfError(modulesResult.error, "Classroom modules could not be loaded.");
  throwIfError(timetableResult.error, "The classroom timetable could not be loaded.");
  throwIfError(assessmentsResult.error, "Classroom assessments could not be loaded.");
  throwIfError(submissionsResult.error, "Assessment submissions could not be loaded.");
  throwIfError(attendanceResult.error, "Classroom attendance could not be loaded.");
  return {
    classroom: classroomResult.data,
    students: list(studentsResult.data),
    modules: list(modulesResult.data),
    timetable: list(timetableResult.data),
    assessments: list(assessmentsResult.data),
    submissions: list(submissionsResult.data),
    attendanceSessions: list(attendanceResult.data)
  };
}

export async function saveClassroomAssessment(values) {
  const supabase = await client();
  const published = values.status === "published";
  const payload = {
    classroom_id: values.classroomId,
    program_id: values.programId,
    program_level_id: values.trackId,
    title: String(values.title || "").trim(),
    instructions: String(values.instructions || "").trim(),
    assessment_type: values.assessmentType || "assignment",
    maximum_score: Math.max(1, Number(values.maximumScore || 100)),
    opens_at: values.opensAt ? new Date(values.opensAt).toISOString() : null,
    due_at: values.dueAt ? new Date(values.dueAt).toISOString() : null,
    late_submission_policy: values.latePolicy || "allow_labelled",
    maximum_attempts: Math.max(1, Number(values.maximumAttempts || 1)),
    time_limit_minutes: values.timeLimit ? Math.max(1, Number(values.timeLimit)) : null,
    status: values.status || "draft",
    published,
    published_at: published ? new Date().toISOString() : null
  };
  const query = values.id
    ? supabase.from("assignments").update(payload).eq("id", values.id)
    : supabase.from("assignments").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error, "The assessment could not be saved.");
  return data;
}

export async function saveAssessmentQuestion(values) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("save_assessment_question", {
    target_question_id: values.id || null,
    target_assessment_id: values.assessmentId,
    next_question_type: values.questionType,
    next_prompt: String(values.prompt || "").trim(),
    next_points: Math.max(1, Number(values.points || 1)),
    next_correct_answer: values.correctAnswer ?? null,
    next_options: values.options || []
  });
  throwIfError(error, "The assessment question could not be saved.");
  return data;
}

export async function saveClassroomTimetableEntry(values) {
  const supabase = await client();
  const payload = {
    classroom_id: values.classroomId,
    cohort_id: values.cohortId,
    program_id: values.programId,
    program_level_id: values.trackId,
    track_id: values.trackId,
    tutor_id: values.tutorId || null,
    title: String(values.title || "").trim(),
    description: String(values.description || "").trim(),
    day_of_week: Number(values.dayOfWeek),
    start_time: values.startTime,
    end_time: values.endTime,
    timezone: "Africa/Lagos",
    delivery_method: values.deliveryMethod || "online",
    meeting_url: String(values.meetingUrl || "").trim() || null,
    published: values.published !== false,
    active: true
  };
  const query = values.id
    ? supabase.from("timetable_entries").update(payload).eq("id", values.id)
    : supabase.from("timetable_entries").insert(payload);
  const { data, error } = await query.select().single();
  throwIfError(error, "The timetable entry could not be saved. Check the time and Tutor conflicts.");
  return data;
}

export async function saveSubmissionGrade({ submissionId, score, feedback, status, reason }) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("save_assessment_grade", {
    target_submission_id: submissionId,
    target_score: score === "" || score == null ? null : Number(score),
    target_feedback: String(feedback || "").trim(),
    target_status: status,
    change_reason: String(reason || "").trim()
  });
  throwIfError(error, "The grade could not be saved.");
  return data;
}

export async function getAdminAcademyWorkspace() {
  const supabase = await client();
  const [classrooms, cohorts, tutorAssignments, weights, transactions, reconciliations, programs] = await Promise.all([
    supabase.from("classrooms").select("*, programs(id, title), program_levels!classrooms_track_id_fkey(id, level_name), cohorts(id, name, start_date, end_date), classroom_memberships(id, member_role, active)").order("created_at", { ascending: false }),
    supabase.from("cohorts").select("*, programs(id, title), program_levels!cohorts_track_id_fkey(id, level_name)").order("start_date", { ascending: false }),
    supabase.from("tutor_classroom_assignments").select("*, classrooms(id, name, code)").order("assigned_at", { ascending: false }),
    supabase.from("grading_weights").select("*").is("effective_until", null),
    supabase.from("payment_transactions").select("*, payments!inner(reference, product_name, customer_email, normalized_email, user_id)").order("created_at", { ascending: false }).limit(200),
    supabase.from("payment_reconciliation_runs").select("*").order("started_at", { ascending: false }).limit(25),
    supabase.from("programs").select("id, title, program_levels(id, level_name, active)").eq("active", true).order("title")
  ]);
  const records = [classrooms, cohorts, tutorAssignments, weights, transactions, reconciliations, programs];
  records.forEach((record) => throwIfError(record.error, "Academy administration records could not be loaded."));
  return {
    classrooms: list(classrooms.data), cohorts: list(cohorts.data), tutorAssignments: list(tutorAssignments.data),
    weights: list(weights.data), transactions: list(transactions.data), reconciliations: list(reconciliations.data), programs: list(programs.data)
  };
}

export async function saveCohort(values) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_save_cohort", {
    target_cohort_id: values.id || null,
    target_program_id: values.programId,
    target_track_id: values.trackId,
    next_name: String(values.name || "").trim(),
    next_code: String(values.code || "").trim(),
    next_start_date: values.startDate,
    next_end_date: values.endDate || null,
    next_status: values.status || "planned"
  });
  throwIfError(error, "The cohort could not be saved.");
  return data;
}

export async function saveClassroom(values) {
  const supabase = await client();
  const { data, error } = await supabase.rpc("admin_save_classroom", {
    target_classroom_id: values.id || null,
    target_cohort_id: values.cohortId,
    next_name: String(values.name || "").trim(),
    next_code: String(values.code || "").trim(),
    next_capacity: values.capacity ? Number(values.capacity) : null,
    next_status: values.status || "planned"
  });
  throwIfError(error, "The classroom could not be saved.");
  return data;
}

export async function saveGradingWeights(classroomId, weights) {
  const supabase = await client();
  const { error } = await supabase.rpc("set_classroom_grading_weights", { target_classroom_id: classroomId, weight_values: weights });
  throwIfError(error, "The grading weights could not be saved. Confirm that they total 100 percent.");
}

export async function assignTutorClassroom({ tutorId, classroomId, role, active, reason }) {
  const supabase = await client();
  const { error } = await supabase.rpc("admin_assign_tutor_classroom", {
    target_tutor_id: tutorId,
    target_classroom_id: classroomId,
    target_role: role,
    assignment_active: active,
    change_reason: String(reason || "").trim()
  });
  throwIfError(error, "The Tutor classroom assignment could not be saved.");
}

export async function assignStudentClassroom({ userId, classroomId, reason }) {
  const supabase = await client();
  const { error } = await supabase.rpc("admin_assign_student_classroom", {
    target_user_id: userId,
    target_classroom_id: classroomId,
    change_reason: String(reason || "").trim()
  });
  throwIfError(error, "The Student classroom assignment could not be saved.");
}
