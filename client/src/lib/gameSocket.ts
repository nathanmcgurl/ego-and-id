import { io, type Socket } from "socket.io-client";
import type { GameRoomView, JoinSession, SocketResult } from "@shared/game";

const SESSION_KEY = "ego-id-game:session";

let socket: Socket | null = null;

export function getGameSocket() {
  if (!socket) {
    socket = io({
      path: "/socket.io",
      autoConnect: false,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 8,
    });
  }
  return socket;
}

export function connectGameSocket() {
  const activeSocket = getGameSocket();
  if (activeSocket.connected) return Promise.resolve(activeSocket);

  return new Promise<Socket>((resolve, reject) => {
    const handleConnect = () => {
      activeSocket.off("connect_error", handleError);
      resolve(activeSocket);
    };
    const handleError = (error: Error) => {
      activeSocket.off("connect", handleConnect);
      reject(error);
    };

    activeSocket.once("connect", handleConnect);
    activeSocket.once("connect_error", handleError);
    activeSocket.connect();
  });
}

export function loadStoredSession(): JoinSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JoinSession;
    if (!parsed.roomCode || !parsed.playerId || !parsed.sessionToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeSession(session: JoinSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

function emitWithAck<T>(event: string, ...args: unknown[]) {
  const activeSocket = getGameSocket();
  return new Promise<SocketResult<T>>(resolve => {
    activeSocket.emit(event, ...args, (result: SocketResult<T>) => resolve(result));
  });
}

export function createGameRoom(displayName: string, avatarDataUrl?: string, settings?: { roundsPerPlayer?: number; allowRiskyPrompts?: boolean; showStandings?: boolean }) {
  return emitWithAck<{ session: JoinSession; room: GameRoomView }>("room:create", { displayName, avatarDataUrl, settings });
}

export function joinGameRoom(roomCode: string, displayName: string, avatarDataUrl?: string) {
  return emitWithAck<{ session: JoinSession; room: GameRoomView }>("room:join", { roomCode, displayName, avatarDataUrl });
}

export function resumeGameRoom(session: JoinSession) {
  return emitWithAck<GameRoomView>("room:resume", session);
}

export function requestGameRoomState() {
  return emitWithAck<GameRoomView>("room:request-state");
}

export function setReady(isReady: boolean) {
  return emitWithAck<void>("lobby:set-ready", isReady);
}

export function updateRoomSettings(settings: { roundsPerPlayer?: number; allowRiskyPrompts?: boolean; showStandings?: boolean }) {
  return emitWithAck<void>("lobby:update-settings", settings);
}

export function startGame() {
  return emitWithAck<void>("game:start");
}

export function selectSecretPrompt(promptId: string) {
  return emitWithAck<void>("game:select-prompt", promptId);
}

export function submitRanking(playerIds: string[]) {
  return emitWithAck<void>("game:submit-ranking", playerIds);
}

export function submitGuess(promptId: string) {
  return emitWithAck<void>("game:submit-guess", promptId);
}

export function revealResults() {
  return emitWithAck<void>("game:reveal-results");
}

export function advanceRound() {
  return emitWithAck<void>("game:advance-round");
}
