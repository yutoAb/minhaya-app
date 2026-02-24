"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChoiceKey,
  ClientToServerEvent,
  Player,
  ServerToClientEvent,
} from "@minhaya/shared";
import { addMissedQuestion, listMissedQuestions, type MissedQuestion } from "@/lib/supabase";

type View = "home" | "lobby" | "match" | "result";

type Review = Extract<ServerToClientEvent, { type: "ended" }>["review"];

const defaultWorkerBase = "http://127.0.0.1:8787";

export default function Page(): JSX.Element {
  const [view, setView] = useState<View>("home");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [hostId, setHostId] = useState("");
  const [selfId, setSelfId] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionText, setQuestionText] = useState("");
  const [choices, setChoices] = useState<Record<ChoiceKey, string>>({
    A: "",
    B: "",
    C: "",
    D: "",
  });
  const [endsAtTs, setEndsAtTs] = useState(0);
  const [lockedByQuestion, setLockedByQuestion] = useState<Record<number, string[]>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [review, setReview] = useState<Review>([]);
  const [error, setError] = useState("");
  const [nowTs, setNowTs] = useState(Date.now());
  const [myAnswers, setMyAnswers] = useState<Record<number, ChoiceKey>>({});
  const [missedHistory, setMissedHistory] = useState<MissedQuestion[]>([]);
  const [showMissedHistory, setShowMissedHistory] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const myAnswersRef = useRef<Record<number, ChoiceKey>>({});

  const workerBase = useMemo(
    () => (process.env.NEXT_PUBLIC_WORKER_URL ?? defaultWorkerBase).replace(/\/$/, ""),
    [],
  );

  const wsBase = useMemo(() => {
    if (workerBase.startsWith("https://")) {
      return workerBase.replace("https://", "wss://");
    }
    if (workerBase.startsWith("http://")) {
      return workerBase.replace("http://", "ws://");
    }
    return workerBase;
  }, [workerBase]);

  const secLeft = Math.max(0, Math.ceil((endsAtTs - nowTs) / 1000));

  useEffect(() => {
    const id = setInterval(() => {
      if (view === "match") {
        setNowTs(Date.now());
      }
    }, 250);
    return () => clearInterval(id);
  }, [view]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  async function createRoom(): Promise<void> {
    setError("");
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }

    const res = await fetch(`${workerBase}/rooms`, { method: "POST" });
    if (!res.ok) {
      setError("ルーム作成に失敗しました");
      return;
    }

    const data = (await res.json()) as { code: string };
    connectAndJoin(data.code, name.trim());
  }

  function joinRoom(): void {
    setError("");
    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("6桁英数字コードを入力してください");
      return;
    }

    connectAndJoin(code, name.trim());
  }

  function connectAndJoin(code: string, playerName: string): void {
    wsRef.current?.close();
    setMyAnswers({});
    myAnswersRef.current = {};
    setShowMissedHistory(false);
    const ws = new WebSocket(`${wsBase}/ws/${code}`);
    wsRef.current = ws;

    ws.onopen = () => {
      const payload: ClientToServerEvent = {
        type: "join",
        code,
        name: playerName,
      };
      ws.send(JSON.stringify(payload));
    };

    ws.onmessage = (ev) => {
      const event = JSON.parse(String(ev.data)) as ServerToClientEvent;
      handleServerEvent(event, code);
    };

    ws.onerror = () => {
      setError("接続に失敗しました");
    };

    ws.onclose = () => {
      if (view !== "result") {
        setError("接続が切断されました");
      }
    };
  }

  function handleServerEvent(event: ServerToClientEvent, code: string): void {
    if (event.type === "error") {
      setError(event.message);
      return;
    }

    if (event.type === "lobby" || event.type === "ready") {
      setView("lobby");
      setRoomCode(event.type === "lobby" ? event.code : code);
      setPlayers(event.players);
      setHostId(event.hostId);
      if (event.selfId) {
        setSelfId(event.selfId);
      }
      return;
    }

    if (event.type === "question") {
      setView("match");
      setQuestionIndex(event.index);
      setQuestionText(event.question);
      setChoices(event.choices);
      setEndsAtTs(event.endsAtTs);
      return;
    }

    if (event.type === "locked") {
      setLockedByQuestion((prev) => {
        const list = prev[event.index] ?? [];
        if (list.includes(event.playerId)) {
          return prev;
        }
        return { ...prev, [event.index]: [...list, event.playerId] };
      });
      return;
    }

    if (event.type === "score") {
      setScores(event.scores);
      return;
    }

    if (event.type === "ended") {
      setWinnerId(event.winnerId);
      setScores(event.scores);
      setReview(event.review);
      setView("result");

      // Save missed questions (fire-and-forget)
      for (const r of event.review) {
        const chosen = myAnswersRef.current[r.index];
        if (chosen && chosen !== r.correctChoice) {
          addMissedQuestion({
            questionId: r.id,
            questionText: r.question,
            correctAnswer: r.correctChoice,
            chosenAnswer: chosen,
          });
        }
      }
    }
  }

  function sendStart(): void {
    const payload: ClientToServerEvent = { type: "start" };
    wsRef.current?.send(JSON.stringify(payload));
  }

  function sendAnswer(choice: ChoiceKey): void {
    setMyAnswers((prev) => ({ ...prev, [questionIndex]: choice }));
    myAnswersRef.current[questionIndex] = choice;
    const payload: ClientToServerEvent = {
      type: "answer",
      index: questionIndex,
      choice,
      clientTs: Date.now(),
    };
    wsRef.current?.send(JSON.stringify(payload));
  }

  const meLocked = (lockedByQuestion[questionIndex] ?? []).includes(selfId);

  return (
    <main>
      <h1>みんはや政治クイズ 1v1 MVP</h1>
      {error && <p className="error">{error}</p>}

      {view === "home" && (
        <div className="card">
          <div className="row">
            <input
              placeholder="表示名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="primary" onClick={createRoom}>
              ルーム作成
            </button>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <input
              placeholder="招待コード (6桁)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <button onClick={joinRoom}>コードで参加</button>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              onClick={async () => {
                const data = await listMissedQuestions();
                setMissedHistory(data);
                setShowMissedHistory((prev) => !prev);
              }}
            >
              {showMissedHistory ? "履歴を閉じる" : "過去の履歴を見る"}
            </button>
          </div>
          {showMissedHistory && (
            <div style={{ marginTop: 12 }}>
              <h3>間違えた問題の履歴</h3>
              {missedHistory.length === 0 && <p>まだ記録がありません</p>}
              {missedHistory.map((m) => (
                <div key={m.id} className="card" style={{ marginTop: 8 }}>
                  <strong>{m.question_text}</strong>
                  <p>正解: {m.correct_answer} / あなたの回答: {m.chosen_answer}</p>
                  <p style={{ fontSize: "0.8em", opacity: 0.7 }}>
                    {new Date(m.created_at).toLocaleString("ja-JP")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "lobby" && (
        <div className="card">
          <p>
            招待コード: <strong>{roomCode}</strong>
          </p>
          <button onClick={() => navigator.clipboard?.writeText(roomCode)}>コードをコピー</button>
          <p style={{ marginTop: 12 }}>
            参加者: {players.length}/2
          </p>
          {players.map((p) => (
            <div key={p.playerId} className="row" style={{ marginTop: 6 }}>
              <span>{p.name}</span>
              <span className="badge">{p.playerId === hostId ? "HOST" : "GUEST"}</span>
            </div>
          ))}

          {players.length === 2 && selfId === hostId && (
            <button className="primary" onClick={sendStart} style={{ marginTop: 16 }}>
              Start
            </button>
          )}
        </div>
      )}

      {view === "match" && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>
              Q{questionIndex + 1} / 10
            </span>
            <span className="timer">{secLeft}s</span>
          </div>
          <h2>{questionText}</h2>
          <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            {(["A", "B", "C", "D"] as ChoiceKey[]).map((k) => (
              <button
                key={k}
                className="choice"
                onClick={() => sendAnswer(k)}
                disabled={meLocked}
              >
                {k}. {choices[k]}
              </button>
            ))}
          </div>
          <p>{meLocked ? "あなたは回答ロック済み" : "回答してください（最初の回答でロック）"}</p>
          <p>
            相手: {(lockedByQuestion[questionIndex] ?? []).filter((id) => id !== selfId).length > 0
              ? "回答済み"
              : "未回答"}
          </p>
          <div className="card">
            <strong>Scores</strong>
            {players.map((p) => (
              <div key={p.playerId}>
                {p.name}: {scores[p.playerId] ?? 0}
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "result" && (
        <div className="card">
          <h2>
            {winnerId === null
              ? "引き分け"
              : winnerId === selfId
                ? "あなたの勝ち"
                : "あなたの負け"}
          </h2>
          {players.map((p) => (
            <p key={p.playerId}>
              {p.name}: {scores[p.playerId] ?? 0}
            </p>
          ))}
          <h3>解説</h3>
          {review.map((r) => (
            <div key={r.index} className="card">
              <strong>
                Q{r.index + 1}: {r.question}
              </strong>
              <p>正解: {r.correctChoice}</p>
              <p>{r.explanation}</p>
              <a href={r.source_url} target="_blank" rel="noreferrer">
                出典
              </a>
            </div>
          ))}

          <button
            className="primary"
            style={{ marginTop: 16 }}
            onClick={() => {
              wsRef.current?.close();
              setView("home");
              setError("");
            }}
          >
            ホームに戻る
          </button>
        </div>
      )}
    </main>
  );
}
