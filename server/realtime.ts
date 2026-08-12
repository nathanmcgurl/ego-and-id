import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import { gameManager } from "./gameEngine";
import { storagePut } from "./storage";
import type { GameRoomView, JoinSession, SocketResult } from "../shared/game";

type Acknowledgement<T> = (result: SocketResult<T>) => void;
type SessionAction = (session: JoinSession) => void;

const sessions = new Map<string, JoinSession>();

type RoomEntryInput = {
  displayName: string;
  avatarDataUrl?: string;
};

async function uploadAvatar(avatarDataUrl?: string) {
  if (!avatarDataUrl) return undefined;

  const match = avatarDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("That selfie image format is not supported.");

  const contentType = match[1]!;
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length === 0 || bytes.length > 400_000) {
    throw new Error("Please retake the selfie at a smaller size.");
  }

  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const uploaded = await storagePut(`game-avatars/avatar-${crypto.randomUUID()}.${extension}`, bytes, contentType);
  return uploaded.url;
}

function success<T>(data: T): SocketResult<T> {
  return { ok: true, data };
}

function failure<T>(error: unknown): SocketResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : "Something went wrong. Please try again." };
}

function getSession(socket: Socket) {
  const session = sessions.get(socket.id);
  if (!session) throw new Error("Your game session has expired. Rejoin the room to continue.");
  return session;
}

function emitRoomState(io: SocketIOServer, roomCode: string) {
  const room = io.sockets.adapter.rooms.get(roomCode);
  if (!room) return;

  room.forEach(socketId => {
    const session = sessions.get(socketId);
    const socket = io.sockets.sockets.get(socketId);
    if (!session || !socket) return;

    try {
      socket.emit("room:state", gameManager.getRoomView(roomCode, session.playerId));
    } catch {
      // The session may have been invalidated while a client was disconnecting.
    }
  });
}

function joinSocketToRoom(socket: Socket, session: JoinSession) {
  sessions.set(socket.id, session);
  socket.join(session.roomCode);
}

function performRoomAction<T>(
  io: SocketIOServer,
  socket: Socket,
  acknowledgement: Acknowledgement<T>,
  action: SessionAction,
  result: () => T,
) {
  try {
    const session = getSession(socket);
    action(session);
    emitRoomState(io, session.roomCode);
    acknowledgement(success(result()));
  } catch (error) {
    acknowledgement(failure<T>(error));
  }
}

export function registerRealtimeGame(server: HttpServer) {
  const io = new SocketIOServer(server, {
    path: "/socket.io",
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on("connection", socket => {
    socket.on(
      "room:create",
      async (input: RoomEntryInput & { settings?: { roundsPerPlayer?: number; allowRiskyPrompts?: boolean; showStandings?: boolean } }, acknowledgement: Acknowledgement<{ session: JoinSession; room: GameRoomView }>) => {
        try {
          const avatarUrl = await uploadAvatar(input.avatarDataUrl);
          const created = gameManager.createRoom({ displayName: input.displayName, avatarUrl, settings: input.settings });
          joinSocketToRoom(socket, created.session);
          acknowledgement(success(created));
        } catch (error) {
          acknowledgement(failure<{ session: JoinSession; room: GameRoomView }>(error));
        }
      },
    );

    socket.on(
      "room:join",
      async (input: RoomEntryInput & { roomCode: string }, acknowledgement: Acknowledgement<{ session: JoinSession; room: GameRoomView }>) => {
        try {
          const avatarUrl = await uploadAvatar(input.avatarDataUrl);
          const joined = gameManager.joinRoom(input.roomCode, input.displayName, avatarUrl);
          joinSocketToRoom(socket, joined.session);
          emitRoomState(io, joined.session.roomCode);
          acknowledgement(success(joined));
        } catch (error) {
          acknowledgement(failure<{ session: JoinSession; room: GameRoomView }>(error));
        }
      },
    );

    socket.on("room:resume", (session: JoinSession, acknowledgement: Acknowledgement<GameRoomView>) => {
      try {
        const room = gameManager.reconnect(session);
        joinSocketToRoom(socket, session);
        emitRoomState(io, session.roomCode);
        acknowledgement(success(room));
      } catch (error) {
        acknowledgement(failure<GameRoomView>(error));
      }
    });

    socket.on("room:request-state", (acknowledgement: Acknowledgement<GameRoomView>) => {
      try {
        const session = getSession(socket);
        acknowledgement(success(gameManager.getRoomView(session.roomCode, session.playerId)));
      } catch (error) {
        acknowledgement(failure<GameRoomView>(error));
      }
    });

    socket.on("lobby:set-ready", (isReady: boolean, acknowledgement: Acknowledgement<void>) => {
      performRoomAction(io, socket, acknowledgement, session => gameManager.setReady(session.roomCode, session.playerId, isReady), () => undefined);
    });

    socket.on(
      "lobby:update-settings",
      (settings: { roundsPerPlayer?: number; allowRiskyPrompts?: boolean; showStandings?: boolean }, acknowledgement: Acknowledgement<void>) => {
        performRoomAction(io, socket, acknowledgement, session => gameManager.updateSettings(session.roomCode, session.playerId, settings), () => undefined);
      },
    );

    socket.on("game:start", (acknowledgement: Acknowledgement<void>) => {
      performRoomAction(io, socket, acknowledgement, session => gameManager.startGame(session.roomCode, session.playerId), () => undefined);
    });

    socket.on("game:select-prompt", (promptId: string, acknowledgement: Acknowledgement<void>) => {
      performRoomAction(io, socket, acknowledgement, session => gameManager.selectSecretPrompt(session.roomCode, session.playerId, promptId), () => undefined);
    });

    socket.on("game:submit-ranking", (playerIds: string[], acknowledgement: Acknowledgement<void>) => {
      performRoomAction(io, socket, acknowledgement, session => gameManager.submitRanking(session.roomCode, session.playerId, playerIds), () => undefined);
    });

    socket.on("game:submit-guess", (promptId: string, acknowledgement: Acknowledgement<void>) => {
      performRoomAction(io, socket, acknowledgement, session => gameManager.submitGuess(session.roomCode, session.playerId, promptId), () => undefined);
    });

    socket.on("game:reveal-results", (acknowledgement: Acknowledgement<void>) => {
      performRoomAction(io, socket, acknowledgement, session => gameManager.revealResults(session.roomCode, session.playerId), () => undefined);
    });

    socket.on("game:advance-round", (acknowledgement: Acknowledgement<void>) => {
      performRoomAction(io, socket, acknowledgement, session => gameManager.advanceRound(session.roomCode, session.playerId), () => undefined);
    });

    socket.on("disconnect", () => {
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);
      if (!session) return;
      gameManager.disconnect(session.roomCode, session.playerId);
      emitRoomState(io, session.roomCode);
    });
  });

  return io;
}
