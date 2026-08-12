export const GAME_PHASES = [
  "LOBBY",
  "JUDGE_SELECT",
  "JUDGE_RANK",
  "GUESS_PROMPT",
  "ROUND_RESULTS",
  "GAME_OVER",
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

export type PromptOption = {
  id: string;
  text: string;
  isRisky: boolean;
};

export type PlayerRole = "host" | "player";

export type PlayerView = {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  role: PlayerRole;
  isReady: boolean;
  isConnected: boolean;
  score: number;
  hasGuessed: boolean;
};

export type RankedIdView = {
  playerId: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  rank: number;
  pointsAwarded?: number;
};

export type ScoreEvent = {
  playerId: string;
  label: string;
  points: number;
};

export type RoomSettings = {
  roundsPerPlayer: number;
  allowRiskyPrompts: boolean;
  showStandings: boolean;
};

export type GameRoomView = {
  roomCode: string;
  phase: GamePhase;
  roundNumber: number;
  roundLimit: number;
  hostPlayerId: string;
  judgePlayerId: string | null;
  players: PlayerView[];
  settings: RoomSettings;
  promptOptions?: PromptOption[];
  secretPrompt?: PromptOption;
  rankablePlayers?: RankedIdView[];
  ranking?: RankedIdView[];
  scoreEvents?: ScoreEvent[];
  message?: string;
};

export type JoinSession = {
  roomCode: string;
  playerId: string;
  sessionToken: string;
};

export type SocketSuccess<T> = {
  ok: true;
  data: T;
};

export type SocketFailure = {
  ok: false;
  error: string;
};

export type SocketResult<T> = SocketSuccess<T> | SocketFailure;

export const isTerminalPhase = (phase: GamePhase) => phase === "GAME_OVER";

export const phaseLabel = (phase: GamePhase) => {
  const labels: Record<GamePhase, string> = {
    LOBBY: "Lobby",
    JUDGE_SELECT: "Judge chooses a prompt",
    JUDGE_RANK: "Judge ranks the players",
    GUESS_PROMPT: "Ranking reveal and prompt guess",
    ROUND_RESULTS: "Round results",
    GAME_OVER: "Game over",
  };

  return labels[phase];
};
