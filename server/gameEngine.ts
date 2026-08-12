import { customAlphabet } from "nanoid";
import type {
  GamePhase,
  GameRoomView,
  JoinSession,
  PlayerRole,
  PromptOption,
  RankedIdView,
  RoomSettings,
  ScoreEvent,
} from "../shared/game";

const roomCodeAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);
const identifierAlphabet = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 14);

const AVATAR_COLORS = [
  "#A7E8BD",
  "#C8B6FF",
  "#FFE66D",
  "#FFAAA5",
  "#9AD0EC",
  "#F7B2D7",
  "#B8F2E6",
  "#FFC6A5",
  "#D7F9F1",
  "#BDE0FE",
  "#FFD6A5",
];

export const DEFAULT_PROMPTS: PromptOption[] = [
  { id: "p-001", text: "…most likely to get lost in their own hometown", isRisky: false },
  { id: "p-002", text: "…most likely to survive a zombie apocalypse", isRisky: false },
  { id: "p-003", text: "…most likely to accidentally start a cult", isRisky: false },
  { id: "p-004", text: "…most likely to become a secret millionaire", isRisky: false },
  { id: "p-005", text: "…most likely to adopt a pet on impulse", isRisky: false },
  { id: "p-006", text: "…most likely to befriend a celebrity", isRisky: false },
  { id: "p-007", text: "…most likely to forget their own birthday", isRisky: false },
  { id: "p-008", text: "…most likely to have a surprisingly useful survival skill", isRisky: false },
  { id: "p-009", text: "…most likely to send a message to the wrong group chat", isRisky: false },
  { id: "p-010", text: "…most likely to win a reality competition", isRisky: false },
  { id: "p-011", text: "…most likely to start dancing before anyone else", isRisky: false },
  { id: "p-012", text: "…most likely to make friends in a queue", isRisky: false },
  { id: "p-013", text: "…most likely to turn a tiny errand into an adventure", isRisky: false },
  { id: "p-014", text: "…most likely to know the answer to a very strange question", isRisky: false },
  { id: "p-015", text: "…most likely to make an accidental fashion statement", isRisky: false },
  { id: "p-016", text: "…most likely to become the star of a viral video", isRisky: false },
  { id: "p-017", text: "…most likely to bring snacks for everyone", isRisky: false },
  { id: "p-018", text: "…most likely to call their parents for advice", isRisky: false },
  { id: "p-019", text: "…most likely to win an argument with a perfect analogy", isRisky: false },
  { id: "p-020", text: "…most likely to turn a bad day into a good story", isRisky: false },
  { id: "p-021", text: "…most likely to become a world-class detective", isRisky: false },
  { id: "p-022", text: "…most likely to volunteer for an impossible challenge", isRisky: false },
];

export type CreateRoomInput = {
  displayName: string;
  avatarUrl?: string;
  settings?: Partial<RoomSettings>;
};

type EnginePlayer = {
  id: string;
  sessionToken: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  role: PlayerRole;
  isReady: boolean;
  isConnected: boolean;
  score: number;
  guessedPromptId?: string;
};

type EngineRoom = {
  roomCode: string;
  phase: GamePhase;
  hostPlayerId: string;
  judgePlayerId: string | null;
  players: EnginePlayer[];
  settings: RoomSettings;
  roundNumber: number;
  totalRounds: number;
  candidatePromptIds: string[];
  secretPromptId: string | null;
  rankingPlayerIds: string[];
  usedPromptIds: string[];
  scoreEvents: ScoreEvent[];
  createdAt: number;
  updatedAt: number;
};

export type PersistableRoom = Omit<EngineRoom, "players"> & {
  players: Array<Omit<EnginePlayer, "sessionToken">>;
};

const DEFAULT_SETTINGS: RoomSettings = {
  roundsPerPlayer: 2,
  allowRiskyPrompts: false,
  showStandings: true,
};

function normaliseDisplayName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex]!, result[index]!];
  }
  return result;
}

function getRankingPoints(rank: number, entryCount: number) {
  return Math.max(1, entryCount - rank + 1);
}

function requireValue<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

export class GameManager {
  private readonly rooms = new Map<string, EngineRoom>();
  private prompts: PromptOption[];

  constructor(initialPrompts: PromptOption[] = DEFAULT_PROMPTS) {
    this.prompts = this.cleanPromptCatalog(initialPrompts);
  }

  public setPromptCatalog(prompts: PromptOption[]) {
    const cleaned = this.cleanPromptCatalog(prompts);
    if (cleaned.length < 10) {
      throw new Error("The prompt catalog needs at least 10 eligible prompts.");
    }
    this.prompts = cleaned;
  }

  public getPromptCatalog() {
    return [...this.prompts];
  }

  public createRoom(input: CreateRoomInput): { session: JoinSession; room: GameRoomView } {
    const displayName = this.validateDisplayName(input.displayName);
    let roomCode = roomCodeAlphabet();
    while (this.rooms.has(roomCode)) roomCode = roomCodeAlphabet();

    const host = this.createPlayer(displayName, "host", 0, this.validateAvatarUrl(input.avatarUrl));
    host.isReady = true;

    const settings: RoomSettings = {
      ...DEFAULT_SETTINGS,
      ...input.settings,
    };
    this.validateSettings(settings);

    const room: EngineRoom = {
      roomCode,
      phase: "LOBBY",
      hostPlayerId: host.id,
      judgePlayerId: null,
      players: [host],
      settings,
      roundNumber: 0,
      totalRounds: 0,
      candidatePromptIds: [],
      secretPromptId: null,
      rankingPlayerIds: [],
      usedPromptIds: [],
      scoreEvents: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.rooms.set(roomCode, room);
    return {
      session: this.toSession(room, host),
      room: this.getRoomView(roomCode, host.id),
    };
  }

  public joinRoom(roomCode: string, rawDisplayName: string, avatarUrl?: string): { session: JoinSession; room: GameRoomView } {
    const room = this.getRoom(roomCode);
    const displayName = this.validateDisplayName(rawDisplayName);

    if (room.phase !== "LOBBY") {
      throw new Error("This game has already started. New players can join the next room.");
    }
    if (room.players.length >= 11) {
      throw new Error("This room is full. The maximum is 11 players.");
    }
    if (room.players.some(player => player.displayName.toLocaleLowerCase() === displayName.toLocaleLowerCase())) {
      throw new Error("That display name is already in this room.");
    }

    const player = this.createPlayer(displayName, "player", room.players.length, this.validateAvatarUrl(avatarUrl));
    room.players.push(player);
    this.touch(room);

    return {
      session: this.toSession(room, player),
      room: this.getRoomView(roomCode, player.id),
    };
  }

  public reconnect(session: JoinSession): GameRoomView {
    const room = this.getRoom(session.roomCode);
    const player = this.getPlayer(room, session.playerId);
    if (player.sessionToken !== session.sessionToken) {
      throw new Error("Your saved session could not be verified. Please rejoin the room.");
    }
    player.isConnected = true;
    this.touch(room);
    return this.getRoomView(room.roomCode, player.id);
  }

  public disconnect(roomCode: string, playerId: string) {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return;
    const player = room.players.find(candidate => candidate.id === playerId);
    if (!player) return;
    player.isConnected = false;
    this.touch(room);
  }

  public getRoomView(roomCode: string, viewerPlayerId: string): GameRoomView {
    const room = this.getRoom(roomCode);
    const viewer = this.getPlayer(room, viewerPlayerId);
    const judge = room.judgePlayerId === viewer.id;
    const secretPrompt = room.secretPromptId ? this.getPrompt(room.secretPromptId) : undefined;
    const submittedIds = this.buildRanking(room);

    const view: GameRoomView = {
      roomCode: room.roomCode,
      phase: room.phase,
      roundNumber: room.roundNumber,
      roundLimit: room.totalRounds,
      hostPlayerId: room.hostPlayerId,
      judgePlayerId: room.judgePlayerId,
      players: room.players.map(player => ({
        id: player.id,
        displayName: player.displayName,
        avatarColor: player.avatarColor,
        avatarUrl: player.avatarUrl,
        role: player.role,
        isReady: player.isReady,
        isConnected: player.isConnected,
        score: player.score,
        hasGuessed: Boolean(player.guessedPromptId),
      })),
      settings: { ...room.settings },
      scoreEvents: room.phase === "ROUND_RESULTS" || room.phase === "GAME_OVER" ? [...room.scoreEvents] : undefined,
    };

    if (room.phase === "JUDGE_SELECT" && judge) {
      view.promptOptions = this.getCandidatePrompts(room);
      view.message = "Choose one private prompt for this round.";
    }

    if (room.phase === "JUDGE_RANK" && judge) {
      view.rankablePlayers = submittedIds;
      view.message = "Drag the player IDs from best to worst fit.";
    }

    if (room.phase === "JUDGE_RANK" && !judge) {
      view.message = "The Judge is ranking the player IDs.";
    }

    if (room.phase === "GUESS_PROMPT") {
      view.ranking = this.applyRanking(room, submittedIds);
      if (!judge) view.promptOptions = this.getCandidatePrompts(room);
      view.message = judge ? "The ranking is revealed while players choose a prompt." : "Study the revealed ranking, then lock in the prompt that explains it.";
    }

    if (room.phase === "ROUND_RESULTS" || room.phase === "GAME_OVER") {
      view.ranking = this.applyRanking(room, submittedIds, true);
      view.secretPrompt = secretPrompt;
      view.promptOptions = room.phase === "ROUND_RESULTS" ? this.getCandidatePrompts(room) : undefined;
      view.message = room.phase === "GAME_OVER" ? "The game is complete — crowns are earned." : "The secret prompt and score changes are revealed.";
    }

    return view;
  }

  public setReady(roomCode: string, playerId: string, isReady: boolean) {
    const room = this.getRoom(roomCode);
    this.requirePhase(room, "LOBBY");
    const player = this.getPlayer(room, playerId);
    player.isReady = isReady;
    this.touch(room);
  }

  public updateSettings(roomCode: string, playerId: string, settings: Partial<RoomSettings>) {
    const room = this.getRoom(roomCode);
    this.requireHost(room, playerId);
    this.requirePhase(room, "LOBBY");
    const updated: RoomSettings = { ...room.settings, ...settings };
    this.validateSettings(updated);
    room.settings = updated;
    this.touch(room);
  }

  public startGame(roomCode: string, playerId: string) {
    const room = this.getRoom(roomCode);
    this.requireHost(room, playerId);
    this.requirePhase(room, "LOBBY");

    if (room.players.length < 3) {
      throw new Error("Invite at least three players before starting the game.");
    }
    if (room.players.some(player => !player.isReady)) {
      throw new Error("Everyone needs to be ready before the game starts.");
    }

    room.roundNumber = 1;
    room.totalRounds = room.settings.roundsPerPlayer === 0 ? 0 : room.settings.roundsPerPlayer * room.players.length;
    this.beginJudgeSelection(room);
  }

  public selectSecretPrompt(roomCode: string, playerId: string, promptId: string) {
    const room = this.getRoom(roomCode);
    this.requirePhase(room, "JUDGE_SELECT");
    this.requireJudge(room, playerId);

    if (!room.candidatePromptIds.includes(promptId)) {
      throw new Error("Choose one of the ten private prompt options for this round.");
    }

    room.secretPromptId = promptId;
    if (!room.usedPromptIds.includes(promptId)) {
      room.usedPromptIds.push(promptId);
    }
    room.phase = "JUDGE_RANK";
    this.touch(room);
  }

  public submitRanking(roomCode: string, playerId: string, rankingPlayerIds: string[]) {
    const room = this.getRoom(roomCode);
    this.requirePhase(room, "JUDGE_RANK");
    this.requireJudge(room, playerId);

    const submittedIds = this.getNonJudgePlayers(room).map(player => player.id);

    if (rankingPlayerIds.length !== submittedIds.length || new Set(rankingPlayerIds).size !== submittedIds.length) {
      throw new Error("Rank every player ID exactly once.");
    }
    if (rankingPlayerIds.some(id => !submittedIds.includes(id))) {
      throw new Error("The ranking includes a player who is not eligible this round.");
    }

    room.rankingPlayerIds = [...rankingPlayerIds];
    room.phase = "GUESS_PROMPT";
    this.touch(room);
  }

  public submitGuess(roomCode: string, playerId: string, promptId: string) {
    const room = this.getRoom(roomCode);
    this.requirePhase(room, "GUESS_PROMPT");
    this.requireNonJudge(room, playerId);

    if (!room.candidatePromptIds.includes(promptId)) {
      throw new Error("Choose one of the prompt options shown for this round.");
    }

    const player = this.getPlayer(room, playerId);
    player.guessedPromptId = promptId;
    this.touch(room);

    if (this.getNonJudgePlayers(room).every(candidate => Boolean(candidate.guessedPromptId))) {
      this.settleRound(room);
    }
  }

  public revealResults(roomCode: string, playerId: string) {
    const room = this.getRoom(roomCode);
    this.requireHostOrJudge(room, playerId);
    this.requirePhase(room, "GUESS_PROMPT");
    this.settleRound(room);
  }

  public advanceRound(roomCode: string, playerId: string) {
    const room = this.getRoom(roomCode);
    this.requireHost(room, playerId);
    this.requirePhase(room, "ROUND_RESULTS");

    if (room.totalRounds !== 0 && room.roundNumber >= room.totalRounds) {
      room.phase = "GAME_OVER";
      this.touch(room);
      return;
    }

    room.roundNumber += 1;
    room.players.forEach(player => {
      player.guessedPromptId = undefined;
    });
    room.secretPromptId = null;
    room.rankingPlayerIds = [];
    room.scoreEvents = [];
    this.beginJudgeSelection(room);
  }

  public toPersistableRoom(roomCode: string): PersistableRoom {
    const room = this.getRoom(roomCode);
    return {
      ...room,
      players: room.players.map(({ sessionToken: _sessionToken, ...player }) => player),
    };
  }

  public listRoomCodes() {
    return Array.from(this.rooms.keys());
  }

  private beginJudgeSelection(room: EngineRoom) {
    const judgeIndex = (room.roundNumber - 1) % room.players.length;
    room.judgePlayerId = room.players[judgeIndex]!.id;
    room.candidatePromptIds = this.selectCandidatePromptIds(room);
    room.phase = "JUDGE_SELECT";
    this.touch(room);
  }

  private settleRound(room: EngineRoom) {
    const secretPromptId = requireValue(room.secretPromptId, "The round does not have a selected secret prompt.");
    const nonJudgePlayers = this.getNonJudgePlayers(room);
    const judge = this.getPlayer(room, requireValue(room.judgePlayerId, "The round has no Judge."));
    const scoreEvents: ScoreEvent[] = [];

    room.rankingPlayerIds.forEach((rankedPlayerId, index) => {
      const player = this.getPlayer(room, rankedPlayerId);
      // Only award ranking points if the player guessed the prompt correctly
      if (player.guessedPromptId === secretPromptId) {
        const points = getRankingPoints(index + 1, room.rankingPlayerIds.length);
        player.score += points;
        scoreEvents.push({ playerId: player.id, label: `Rank #${index + 1} ID`, points });
      }
    });

    const correctGuessers = nonJudgePlayers.filter(player => player.guessedPromptId === secretPromptId);
    correctGuessers.forEach(player => {
      player.score += 2;
      scoreEvents.push({ playerId: player.id, label: "Correct prompt guess", points: 2 });
    });

    if (correctGuessers.length > 0) {
      judge.score += correctGuessers.length;
      scoreEvents.push({ playerId: judge.id, label: `${correctGuessers.length} correct guess${correctGuessers.length === 1 ? "" : "es"} as Judge`, points: correctGuessers.length });
    }

    if (nonJudgePlayers.length > 0 && correctGuessers.length === nonJudgePlayers.length) {
      judge.score += 5;
      scoreEvents.push({ playerId: judge.id, label: "Mind Meld bonus", points: 5 });
      correctGuessers.forEach(player => {
        player.score += 1;
        scoreEvents.push({ playerId: player.id, label: "Mind Meld bonus", points: 1 });
      });
    }

    room.scoreEvents = scoreEvents;
    room.phase = "ROUND_RESULTS";
    this.touch(room);
  }

  private buildRanking(room: EngineRoom): RankedIdView[] {
    return this.getNonJudgePlayers(room).map(player => ({
      playerId: player.id,
      displayName: player.displayName,
      avatarColor: player.avatarColor,
      avatarUrl: player.avatarUrl,
      rank: 0,
    }));
  }

  private applyRanking(room: EngineRoom, entries: RankedIdView[], includePoints = false): RankedIdView[] {
    const byId = new Map(entries.map(entry => [entry.playerId, entry]));
    const ranked: RankedIdView[] = [];

    room.rankingPlayerIds.forEach((playerId, index) => {
      const entry = byId.get(playerId);
      if (!entry) return;

      const rank = index + 1;
      const player = this.getPlayer(room, playerId);
      const earnedRankingPoints = includePoints && player.guessedPromptId === room.secretPromptId
        ? getRankingPoints(rank, room.rankingPlayerIds.length)
        : undefined;
      ranked.push({
        ...entry,
        rank,
        ...(earnedRankingPoints ? { pointsAwarded: earnedRankingPoints } : {}),
      });
    });

    return ranked;
  }

  private getCandidatePrompts(room: EngineRoom) {
    return room.candidatePromptIds
      .map(promptId => this.prompts.find(prompt => prompt.id === promptId))
      .filter((prompt): prompt is PromptOption => Boolean(prompt));
  }

  private selectCandidatePromptIds(room: EngineRoom) {
    const eligible = this.prompts.filter(prompt => room.settings.allowRiskyPrompts || !prompt.isRisky);
    if (eligible.length < 10) {
      throw new Error("Add at least 10 eligible prompts before starting a round.");
    }

    let unused = eligible.filter(prompt => !room.usedPromptIds.includes(prompt.id));
    if (unused.length < 10) {
      room.usedPromptIds = [];
      unused = eligible;
    }

    return shuffle(unused).slice(0, 10).map(prompt => prompt.id);
  }

  private getPrompt(promptId: string) {
    return requireValue(this.prompts.find(prompt => prompt.id === promptId), "The selected prompt is no longer available.");
  }

  private createPlayer(displayName: string, role: PlayerRole, playerIndex: number, avatarUrl?: string): EnginePlayer {
    return {
      id: `player_${identifierAlphabet()}`,
      sessionToken: `session_${identifierAlphabet()}`,
      displayName,
      avatarColor: AVATAR_COLORS[playerIndex % AVATAR_COLORS.length]!,
      avatarUrl,
      role,
      isReady: false,
      isConnected: true,
      score: 0,
    };
  }

  private validateAvatarUrl(value?: string) {
    if (!value) return undefined;
    if (!value.startsWith("/manus-storage/game-avatars/")) {
      throw new Error("The selected avatar could not be verified.");
    }
    return value;
  }

  private toSession(room: EngineRoom, player: EnginePlayer): JoinSession {
    return {
      roomCode: room.roomCode,
      playerId: player.id,
      sessionToken: player.sessionToken,
    };
  }

  private getRoom(roomCode: string) {
    const room = this.rooms.get(roomCode.toUpperCase().trim());
    return requireValue(room, "We could not find that room code.");
  }

  private getPlayer(room: EngineRoom, playerId: string) {
    return requireValue(room.players.find(player => player.id === playerId), "Your player session is no longer available in this room.");
  }

  private getNonJudgePlayers(room: EngineRoom) {
    return room.players.filter(player => player.id !== room.judgePlayerId);
  }

  private requirePhase(room: EngineRoom, phase: GamePhase) {
    if (room.phase !== phase) {
      throw new Error("That action is not available during the current game step.");
    }
  }

  private requireHost(room: EngineRoom, playerId: string) {
    if (room.hostPlayerId !== playerId) {
      throw new Error("Only the host can do that.");
    }
  }

  private requireJudge(room: EngineRoom, playerId: string) {
    if (room.judgePlayerId !== playerId) {
      throw new Error("Only the current Judge can do that.");
    }
  }

  private requireNonJudge(room: EngineRoom, playerId: string) {
    if (room.judgePlayerId === playerId) {
      throw new Error("The Judge cannot do that during this round.");
    }
    this.getPlayer(room, playerId);
  }

  private requireHostOrJudge(room: EngineRoom, playerId: string) {
    if (room.hostPlayerId !== playerId && room.judgePlayerId !== playerId) {
      throw new Error("Only the host or current Judge can do that.");
    }
  }

  private validateDisplayName(rawDisplayName: string) {
    const displayName = normaliseDisplayName(rawDisplayName);
    if (displayName.length < 2 || displayName.length > 24) {
      throw new Error("Enter a display name between 2 and 24 characters.");
    }
    return displayName;
  }

  private validateSettings(settings: RoomSettings) {
    if (!Number.isInteger(settings.roundsPerPlayer) || settings.roundsPerPlayer < 0 || settings.roundsPerPlayer > 5) {
      throw new Error("Rounds per player must be a whole number from 0 to 5.");
    }
  }

  private cleanPromptCatalog(prompts: PromptOption[]) {
    const seen = new Set<string>();
    const clean: PromptOption[] = [];
    prompts.forEach(prompt => {
      const text = prompt.text.replace(/\s+/g, " ").trim();
      const fingerprint = text.toLocaleLowerCase();
      if (!prompt.id || text.length < 5 || seen.has(fingerprint)) return;
      seen.add(fingerprint);
      clean.push({ id: prompt.id, text, isRisky: Boolean(prompt.isRisky) });
    });
    return clean;
  }

  private touch(room: EngineRoom) {
    room.updatedAt = Date.now();
  }
}

export const gameManager = new GameManager();
