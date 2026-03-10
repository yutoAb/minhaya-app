import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const globalKey = "__supabase" as const;
const globalObj = globalThis as unknown as Record<string, SupabaseClient | undefined>;

function getClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!globalObj[globalKey]) {
    globalObj[globalKey] = createClient(url, anonKey);
  }
  return globalObj[globalKey]!;
}

export const supabase = getClient();

export async function ensureSession(): Promise<void> {
  if (!supabase) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) return;
    await supabase.auth.signInAnonymously();
  } catch (err) {
    console.error("ensureSession failed:", err);
  }
}

export async function addMissedQuestion(q: {
  questionId: string;
  questionText: string;
  correctAnswer: string;
  chosenAnswer: string;
}): Promise<void> {
  if (!supabase) return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("missed_questions").insert({
      user_id: user.id,
      question_id: q.questionId,
      question_text: q.questionText,
      correct_answer: q.correctAnswer,
      chosen_answer: q.chosenAnswer,
    });
    if (error) console.error("addMissedQuestion error:", error);
  } catch (err) {
    console.error("addMissedQuestion failed:", err);
  }
}

export type MissedQuestion = {
  id: string;
  question_id: string;
  question_text: string;
  correct_answer: string;
  chosen_answer: string;
  created_at: string;
};

// --- Questions CRUD (管理者用) ---

export type QuestionRow = {
  id: string;
  question: string;
  choices: Record<string, string>;
  answer: string;
  explanation: string;
  source_url: string;
  category: string;
  difficulty: number;
  created_at: string;
  updated_at: string;
};

export type QuestionInput = {
  id: string;
  question: string;
  choices: Record<string, string>;
  answer: string;
  explanation: string;
  source_url: string;
  category: string;
  difficulty: number;
};

export async function listQuestions(): Promise<QuestionRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listQuestions error:", error);
    return [];
  }
  return (data ?? []) as QuestionRow[];
}

export async function addQuestion(q: QuestionInput): Promise<{ error?: string }> {
  if (!supabase) return { error: "No client" };
  const { error } = await supabase.from("questions").insert(q);
  if (error) return { error: error.message };
  return {};
}

export async function updateQuestion(id: string, q: Partial<QuestionInput>): Promise<{ error?: string }> {
  if (!supabase) return { error: "No client" };
  const { error } = await supabase.from("questions").update(q).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteQuestion(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: "No client" };
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function listMissedQuestions(): Promise<MissedQuestion[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("missed_questions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("listMissedQuestions error:", error);
      return [];
    }
    return (data ?? []) as MissedQuestion[];
  } catch (err) {
    console.error("listMissedQuestions failed:", err);
    return [];
  }
}
