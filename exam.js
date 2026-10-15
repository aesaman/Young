/** Offline exam / answer-sheet — flexible, 1-2-3-4 choices. */

import { uid } from "./timer.js";

export function createExam({
  title,
  from,
  to,
  parity = "all", // all | odd | even
  choices = 4,
  subject = "",
  negative = true
}) {
  const start = Math.max(1, Number(from) || 1);
  const end = Math.max(start, Number(to) || start);
  const questions = [];
  for (let n = start; n <= end && questions.length < 250; n++) {
    if (parity === "odd" && n % 2 === 0) continue;
    if (parity === "even" && n % 2 === 1) continue;
    questions.push({ n, answer: null });
  }
  if (!questions.length) {
    questions.push({ n: start, answer: null });
  }
  return {
    id: uid("exam"),
    title: title || `آزمون ${start}–${end}`,
    subject: subject || "",
    from: start,
    to: end,
    parity,
    choices,
    negative: !!negative,
    questions,
    key: null,
    result: null,
    status: "draft",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

export function setAnswer(exam, index, choice) {
  if (!exam.questions[index]) return exam;
  const cur = exam.questions[index].answer;
  const next = cur === choice ? null : choice; // toggle off
  const questions = exam.questions.slice();
  questions[index] = { ...questions[index], answer: next };
  return { ...exam, questions, updatedAt: Date.now() };
}

/** Key: only digits 1-4 in order of questions, e.g. "31421342..." */
export function parseKey(keyStr, exam) {
  const raw = String(keyStr || "")
    .trim()
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[^1-4]/g, "");
  if (!raw.length) return null;
  const map = {};
  const qs = exam.questions;
  if (raw.length < qs.length) {
    // partial key still ok for answered portion
  }
  qs.forEach((q, i) => {
    if (i < raw.length) map[q.n] = raw[i];
  });
  return Object.keys(map).length ? map : null;
}

export function gradeExam(exam, keyMap) {
  let correct = 0, wrong = 0, blank = 0;
  const detail = exam.questions.map((q) => {
    const key = keyMap[q.n];
    const ans = q.answer;
    let status = "blank";
    if (!ans) { blank++; status = "blank"; }
    else if (String(ans) === String(key)) { correct++; status = "ok"; }
    else { wrong++; status = "bad"; }
    return { n: q.n, ans, key, status };
  });
  const total = exam.questions.length;
  const pctRaw = total ? (correct / total) * 100 : 0;
  const useNeg = exam.negative !== false;
  const pctNeg = total ? ((correct * 3 - wrong) / (total * 3)) * 100 : 0;
  return {
    correct, wrong, blank, total,
    pctRaw: Math.round(pctRaw * 10) / 10,
    pctNeg: Math.round((useNeg ? pctNeg : pctRaw) * 10) / 10,
    negative: useNeg,
    detail,
    gradedAt: Date.now()
  };
}

export function examShareText(exam) {
  const r = exam.result;
  if (!r) return exam.title;
  const sub = exam.subject ? ` (${exam.subject})` : "";
  return `کارنامه ${exam.title}${sub}
از ${exam.from} تا ${exam.to}${exam.parity === "odd" ? " · فرد" : exam.parity === "even" ? " · زوج" : ""}
صحیح: ${r.correct} | غلط: ${r.wrong} | نزده: ${r.blank}
درصد خام: ${r.pctRaw}%
${r.negative ? `با نمره منفی: ${r.pctNeg}%` : ""}`;
}

export function parityLabel(p) {
  if (p === "odd") return "فقط فرد";
  if (p === "even") return "فقط زوج";
  return "همه";
}
