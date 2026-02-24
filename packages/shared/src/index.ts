export type ChoiceKey = "A" | "B" | "C" | "D";

export type Question = {
  id: string;
  question: string;
  choices: Record<ChoiceKey, string>;
  answer: ChoiceKey;
  explanation: string;
  source_url: string;
  category: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
};

export type PublicQuestion = Omit<Question, "answer" | "explanation" | "source_url">;

export type Player = {
  playerId: string;
  name: string;
};

export type ClientToServerEvent =
  | {
      type: "join";
      code: string;
      name: string;
    }
  | {
      type: "start";
    }
  | {
      type: "answer";
      index: number;
      choice: ChoiceKey;
      clientTs: number;
    };

export type ServerToClientEvent =
  | {
      type: "lobby";
      code: string;
      players: Player[];
      hostId: string;
      selfId?: string;
    }
  | {
      type: "ready";
      players: Player[];
      hostId: string;
      selfId?: string;
    }
  | {
      type: "question";
      index: number;
      question: string;
      choices: Record<ChoiceKey, string>;
      endsAtTs: number;
    }
  | {
      type: "locked";
      index: number;
      playerId: string;
    }
  | {
      type: "score";
      scores: Record<string, number>;
    }
  | {
      type: "ended";
      winnerId: string | null;
      scores: Record<string, number>;
      review: Array<{
        id: string;
        index: number;
        correctChoice: ChoiceKey;
        explanation: string;
        source_url: string;
        question: string;
      }>;
    }
  | {
      type: "error";
      message: string;
    };
