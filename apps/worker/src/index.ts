import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  ChoiceKey,
  ClientToServerEvent,
  Player,
  Question,
  ServerToClientEvent,
} from "@minhaya/shared";
import questionsData from "../questions.json";

type Env = {
  ROOM: DurableObjectNamespace<Room>;
};

const CODE_LENGTH = 6;
const ROUND_MS = 10_000;
const QUESTIONS_PER_MATCH = 10;
const MAX_PLAYERS = 10;

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.post("/rooms", async (c) => {
  const code = generateCode();
  const id = c.env.ROOM.idFromName(code);
  const stub = c.env.ROOM.get(id);
  await stub.fetch("https://room/init", {
    method: "POST",
    headers: {
      "x-room-code": code,
    },
  });

  return c.json({ code });
});

app.get("/ws/:code", async (c) => {
  const code = (c.req.param("code") || "").toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return c.json({ error: "invalid_code" }, 400);
  }

  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "websocket_upgrade_required" }, 426);
  }

  const id = c.env.ROOM.idFromName(code);
  const stub = c.env.ROOM.get(id);
  return stub.fetch(c.req.raw);
});

app.get("/health", (c) => c.json({ ok: true }));

export default app;

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

type RoomState = {
  code: string;
  phase: "lobby" | "playing" | "ended";
  hostId: string | null;
  players: Player[];
  scores: Record<string, number>;
  questions: Question[];
  currentIndex: number;
  answersByIndex: Record<number, Record<string, { choice: ChoiceKey; latencyMs: number }>>;
  currentQuestionStartedAt: number;
  currentQuestionEndsAt: number;
};

type Session = {
  socket: WebSocket;
  playerId: string | null;
};

export class Room implements DurableObject {
  private readonly ctx: DurableObjectState;
  private readonly sessions = new Set<Session>();
  private state: RoomState;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
    this.state = {
      code: "",
      phase: "lobby",
      hostId: null,
      players: [],
      scores: {},
      questions: [],
      currentIndex: 0,
      answersByIndex: {},
      currentQuestionStartedAt: 0,
      currentQuestionEndsAt: 0,
    };

    ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<RoomState>("room");
      if (stored) {
        this.state = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/init") && request.method === "POST") {
      if (!this.state.code) {
        const code = request.headers.get("x-room-code") ?? "";
        this.state.code = code;
        await this.persist();
      }
      return new Response("ok");
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    if (!this.state.code) {
      const parts = url.pathname.split("/");
      const fromPath = parts[parts.length - 1]?.toUpperCase() ?? "";
      if (/^[A-Z0-9]{6}$/.test(fromPath)) {
        this.state.code = fromPath;
        await this.persist();
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const session: Session = { socket: server, playerId: null };
    this.sessions.add(session);

    server.addEventListener("message", (event) => {
      this.handleMessage(session, String(event.data)).catch((err) => {
        this.send(session.socket, { type: "error", message: "internal_error" });
        console.error("message handling error", err);
      });
    });

    server.addEventListener("close", () => {
      this.sessions.delete(session);
    });

    server.addEventListener("error", () => {
      this.sessions.delete(session);
      try {
        server.close();
      } catch {
        // ignore
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async alarm(): Promise<void> {
    if (this.state.phase !== "playing") {
      return;
    }

    const now = Date.now();
    if (now < this.state.currentQuestionEndsAt) {
      await this.ctx.storage.setAlarm(this.state.currentQuestionEndsAt);
      return;
    }

    await this.finishCurrentQuestion();
  }

  private async handleMessage(session: Session, raw: string): Promise<void> {
    let event: ClientToServerEvent;

    try {
      event = JSON.parse(raw) as ClientToServerEvent;
    } catch {
      this.send(session.socket, { type: "error", message: "invalid_json" });
      return;
    }

    if (event.type === "join") {
      await this.onJoin(session, event);
      return;
    }

    if (!session.playerId) {
      this.send(session.socket, { type: "error", message: "not_joined" });
      return;
    }

    if (event.type === "start") {
      await this.onStart(session.playerId);
      return;
    }

    if (event.type === "answer") {
      await this.onAnswer(session.playerId, event);
    }
  }

  private async onJoin(
    session: Session,
    event: Extract<ClientToServerEvent, { type: "join" }>,
  ): Promise<void> {
    if (this.state.code && event.code.toUpperCase() !== this.state.code) {
      this.send(session.socket, { type: "error", message: "code_mismatch" });
      return;
    }
    if (this.state.phase !== "lobby") {
      this.send(session.socket, { type: "error", message: "game_already_started" });
      return;
    }

    if (session.playerId) {
      this.send(session.socket, { type: "error", message: "already_joined" });
      return;
    }

    if (this.state.players.length >= MAX_PLAYERS) {
      this.send(session.socket, { type: "error", message: "room_full" });
      return;
    }

    const name = event.name.trim().slice(0, 20) || "Player";
    const playerId = crypto.randomUUID();

    session.playerId = playerId;
    this.state.players.push({ playerId, name });
    this.state.scores[playerId] = 0;

    if (!this.state.hostId) {
      this.state.hostId = playerId;
    }

    await this.persist();
    this.broadcastLobby();

    if (this.state.players.length >= 2) {
      this.broadcastReady();
    }
  }

  private async onStart(playerId: string): Promise<void> {
    if (this.state.phase !== "lobby") {
      this.broadcastError("cannot_start_now");
      return;
    }

    if (this.state.players.length < 2 || !this.state.hostId) {
      this.broadcastError("not_ready");
      return;
    }

    if (this.state.hostId !== playerId) {
      this.broadcastError("host_only");
      return;
    }

    this.state.phase = "playing";
    this.state.questions = pickQuestions(questionsData as Question[], QUESTIONS_PER_MATCH);
    this.state.currentIndex = 0;
    this.state.answersByIndex = {};
    this.state.scores = Object.fromEntries(this.state.players.map((p) => [p.playerId, 0]));

    await this.startQuestion(0);
  }

  private async onAnswer(
    playerId: string,
    event: Extract<ClientToServerEvent, { type: "answer" }>,
  ): Promise<void> {
    if (this.state.phase !== "playing") {
      return;
    }

    if (event.index !== this.state.currentIndex) {
      return;
    }

    const currentAnswers = (this.state.answersByIndex[event.index] ??= {});
    if (currentAnswers[playerId]) {
      return;
    }

    const now = Date.now();
    const latencyMs = clamp(now - this.state.currentQuestionStartedAt, 0, ROUND_MS);
    currentAnswers[playerId] = {
      choice: event.choice,
      latencyMs,
    };

    const q = this.state.questions[event.index];
    if (q && q.answer === event.choice) {
      const bonus = Math.max(0, Math.floor(((ROUND_MS - latencyMs) / ROUND_MS) * 50));
      this.state.scores[playerId] = (this.state.scores[playerId] ?? 0) + 100 + bonus;
    }

    this.broadcast({ type: "locked", index: event.index, playerId });
    await this.persist();

    if (Object.keys(currentAnswers).length >= this.state.players.length) {
      await this.finishCurrentQuestion();
    }
  }

  private async startQuestion(index: number): Promise<void> {
    this.state.currentIndex = index;
    this.state.currentQuestionStartedAt = Date.now();
    this.state.currentQuestionEndsAt = this.state.currentQuestionStartedAt + ROUND_MS;
    await this.ctx.storage.setAlarm(this.state.currentQuestionEndsAt);

    const q = this.state.questions[index];
    if (!q) {
      await this.endGame();
      return;
    }

    await this.persist();

    this.broadcast({
      type: "question",
      index,
      question: q.question,
      choices: q.choices,
      endsAtTs: this.state.currentQuestionEndsAt,
    });
  }

  private async finishCurrentQuestion(): Promise<void> {
    if (this.state.phase !== "playing") {
      return;
    }

    this.broadcast({ type: "score", scores: this.state.scores });

    const nextIndex = this.state.currentIndex + 1;
    if (nextIndex >= this.state.questions.length || nextIndex >= QUESTIONS_PER_MATCH) {
      await this.endGame();
      return;
    }

    await this.startQuestion(nextIndex);
  }

  private async endGame(): Promise<void> {
    this.state.phase = "ended";

    const review = this.state.questions.map((q, index) => ({
      id: q.id,
      index,
      correctChoice: q.answer,
      explanation: q.explanation,
      source_url: q.source_url,
      question: q.question,
    }));

    const winnerId = decideWinner(this.state.scores);

    await this.persist();
    this.broadcast({
      type: "ended",
      winnerId,
      scores: this.state.scores,
      review,
    });
  }

  private broadcastLobby(): void {
    for (const session of this.sessions) {
      const payload: ServerToClientEvent = {
        type: "lobby",
        code: this.state.code,
        players: this.state.players,
        hostId: this.state.hostId ?? "",
        selfId: session.playerId ?? undefined,
      };
      this.send(session.socket, payload);
    }
  }

  private broadcastReady(): void {
    for (const session of this.sessions) {
      const payload: ServerToClientEvent = {
        type: "ready",
        players: this.state.players,
        hostId: this.state.hostId ?? "",
        selfId: session.playerId ?? undefined,
      };
      this.send(session.socket, payload);
    }
  }

  private broadcastError(message: string): void {
    this.broadcast({ type: "error", message });
  }

  private broadcast(event: ServerToClientEvent): void {
    for (const session of this.sessions) {
      this.send(session.socket, event);
    }
  }

  private send(socket: WebSocket, event: ServerToClientEvent): void {
    try {
      socket.send(JSON.stringify(event));
    } catch {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put("room", this.state);
  }
}

function pickQuestions(pool: Question[], n: number): Question[] {
  const preferred = shuffle(pool.filter((q) => q.difficulty <= 3));
  const fallback = shuffle(pool.filter((q) => q.difficulty > 3));
  const selected: Question[] = [];
  const seen = new Set<string>();

  for (const q of preferred) {
    if (selected.length >= n) {
      break;
    }
    selected.push(q);
    seen.add(q.id);
  }

  for (const q of fallback) {
    if (selected.length >= n) {
      break;
    }
    if (seen.has(q.id)) {
      continue;
    }
    selected.push(q);
    seen.add(q.id);
  }

  return selected.slice(0, n);
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j] as T;
    out[j] = tmp as T;
  }
  return out;
}

function decideWinner(scores: Record<string, number>): string | null {
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return null;
  }

  entries.sort((a, b) => b[1] - a[1]);
  if (entries.length >= 2 && entries[0][1] === entries[1][1]) {
    return null;
  }

  return entries[0][0];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
