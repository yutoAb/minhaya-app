"use client";

import { useEffect, useState } from "react";
import {
  listQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,
  type QuestionRow,
  type QuestionInput,
} from "@/lib/supabase";

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

const emptyForm: QuestionInput = {
  id: "",
  question: "",
  choices: { A: "", B: "", C: "", D: "" },
  answer: "A",
  explanation: "",
  source_url: "",
  category: "",
  difficulty: 1,
};

export default function AdminPage(): JSX.Element {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [form, setForm] = useState<QuestionInput>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authed) {
      loadQuestions();
    }
  }, [authed]);

  function handleLogin(): void {
    if (password === ADMIN_PASSWORD) {
      setAuthed(true);
    } else {
      setMessage("パスワードが正しくありません");
    }
  }

  async function loadQuestions(): Promise<void> {
    const data = await listQuestions();
    setQuestions(data);
  }

  function startEdit(q: QuestionRow): void {
    setEditingId(q.id);
    setForm({
      id: q.id,
      question: q.question,
      choices: q.choices as Record<string, string>,
      answer: q.answer,
      explanation: q.explanation,
      source_url: q.source_url,
      category: q.category,
      difficulty: q.difficulty,
    });
    setMessage("");
  }

  function cancelEdit(): void {
    setEditingId(null);
    setForm({ ...emptyForm });
    setMessage("");
  }

  async function handleSubmit(): Promise<void> {
    setLoading(true);
    setMessage("");

    if (!form.id || !form.question || !form.choices.A) {
      setMessage("ID、問題文、選択肢Aは必須です");
      setLoading(false);
      return;
    }

    if (editingId) {
      const { error } = await updateQuestion(editingId, form);
      if (error) {
        setMessage(`更新失敗: ${error}`);
      } else {
        setMessage("更新しました");
        setEditingId(null);
        setForm({ ...emptyForm });
        await loadQuestions();
      }
    } else {
      const { error } = await addQuestion(form);
      if (error) {
        setMessage(`追加失敗: ${error}`);
      } else {
        setMessage("追加しました");
        setForm({ ...emptyForm });
        await loadQuestions();
      }
    }
    setLoading(false);
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm(`問題 "${id}" を削除しますか？`)) return;
    const { error } = await deleteQuestion(id);
    if (error) {
      setMessage(`削除失敗: ${error}`);
    } else {
      setMessage("削除しました");
      if (editingId === id) cancelEdit();
      await loadQuestions();
    }
  }

  if (!authed) {
    return (
      <main>
        <h1>管理者ログイン</h1>
        {message && <p className="error">{message}</p>}
        <div className="card">
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          <button className="primary" onClick={handleLogin} style={{ marginTop: 8 }}>
            ログイン
          </button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>問題管理（{questions.length}問）</h1>
      {message && <p className="error">{message}</p>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2>{editingId ? `編集: ${editingId}` : "新規追加"}</h2>

        <div>
          <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>ID</div>
          <input
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            disabled={!!editingId}
            placeholder="例: jp-new-1"
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>問題文</div>
          <textarea
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            rows={3}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>選択肢</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(["A", "B", "C", "D"] as const).map((k) => (
              <div key={k}>
                <span style={{ fontSize: "0.85em", fontWeight: "bold" }}>{k}</span>
                <input
                  value={form.choices[k] ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, choices: { ...form.choices, [k]: e.target.value } })
                  }
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 2 }}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>正解</div>
          <select value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} style={{ width: "100%" }}>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>解説</div>
          <textarea
            value={form.explanation}
            onChange={(e) => setForm({ ...form, explanation: e.target.value })}
            rows={3}
            style={{ width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>出典URL</div>
            <input
              value={form.source_url}
              onChange={(e) => setForm({ ...form, source_url: e.target.value })}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>カテゴリ</div>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: "0.85em", marginBottom: 4, opacity: 0.8 }}>難易度 ({form.difficulty})</div>
          <input
            type="range"
            min={1}
            max={5}
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: Number(e.target.value) })}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="primary" onClick={handleSubmit} disabled={loading}>
            {editingId ? "更新" : "追加"}
          </button>
          {editingId && <button onClick={cancelEdit}>キャンセル</button>}
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>問題一覧</h2>
      {questions.map((q) => (
        <div key={q.id} className="card" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: "1.1em" }}>{q.id}</strong>
            <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
              難易度 {q.difficulty} / {q.category}
            </span>
          </div>
          <p style={{ marginBottom: 8, lineHeight: 1.5 }}>{q.question}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: "0.9em", marginBottom: 8 }}>
            {(["A", "B", "C", "D"] as const).map((k) => (
              <div key={k} style={{ fontWeight: q.answer === k ? "bold" : "normal", color: q.answer === k ? "#2ecc71" : "inherit" }}>
                {q.answer === k ? "\u25CB " : "\u3000 "}{k}: {q.choices[k]}
              </div>
            ))}
          </div>
          {q.explanation && (
            <p style={{ fontSize: "0.85em", opacity: 0.8, marginBottom: 4 }}>
              {q.explanation}
            </p>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={() => startEdit(q)}>編集</button>
            <button onClick={() => handleDelete(q.id)} style={{ color: "#e74c3c" }}>
              削除
            </button>
          </div>
        </div>
      ))}
    </main>
  );
}
