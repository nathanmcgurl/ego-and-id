import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crown,
  Dices,
  GripVertical,
  LoaderCircle,
  LockKeyhole,
  Medal,
  MoveVertical,
  Sparkles,
  TimerReset,
  Trophy,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import type { GameRoomView, JoinSession, PromptOption, RankedIdView } from "@shared/game";
import { phaseLabel } from "@shared/game";
import {
  advanceRound,
  clearStoredSession,
  connectGameSocket,
  getGameSocket,
  loadStoredSession,
  requestGameRoomState,
  resumeGameRoom,
  revealResults,
  selectSecretPrompt,
  setReady,
  startGame,
  submitGuess,
  submitRanking,
  updateRoomSettings,
} from "@/lib/gameSocket";

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function PlayerAvatar({ name, color, avatarUrl, className = "size-9" }: { name: string; color: string; avatarUrl?: string; className?: string }) {
  return (
    <span className={classNames("grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[#171113] text-xs font-black", className)} style={{ background: color }}>
      {avatarUrl ? <img src={avatarUrl} alt={`${name} avatar`} className="h-full w-full object-cover" /> : getInitials(name)}
    </span>
  );
}

function useGameSession(routeCode: string | undefined) {
  const [session, setSession] = useState<JoinSession | null>(() => loadStoredSession());
  const [room, setRoom] = useState<GameRoomView | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "offline" | "invalid">("connecting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedSession = loadStoredSession();
    if (!routeCode || !storedSession || storedSession.roomCode !== routeCode.toUpperCase()) {
      setConnectionState("invalid");
      setError("This device is not connected to that room. Join it from the home screen first.");
      return;
    }

    setSession(storedSession);
    const socket = getGameSocket();
    let active = true;

    const handleRoomState = (nextRoom: GameRoomView) => {
      if (!active || nextRoom.roomCode !== storedSession.roomCode) return;
      setRoom(nextRoom);
      setConnectionState("connected");
      setError(null);
    };

    const handleDisconnect = () => {
      if (active) setConnectionState("offline");
    };

    const restore = async () => {
      try {
        const result = await resumeGameRoom(storedSession);
        if (!active) return;
        if (!result.ok) {
          setConnectionState("invalid");
          setError(result.error);
          return;
        }
        setRoom(result.data);
        setConnectionState("connected");
        setError(null);
      } catch {
        if (active) {
          setConnectionState("offline");
          setError("The room could not reconnect yet. We will keep trying automatically.");
        }
      }
    };

    socket.on("room:state", handleRoomState);
    socket.on("connect", restore);
    socket.on("disconnect", handleDisconnect);

    if (socket.connected) {
      void restore();
    } else {
      setConnectionState("connecting");
      socket.connect();
    }

    return () => {
      active = false;
      socket.off("room:state", handleRoomState);
      socket.off("connect", restore);
      socket.off("disconnect", handleDisconnect);
    };
  }, [routeCode]);

  return { session, room, setRoom, connectionState, error };
}

type SortableIdCardProps = {
  entry: RankedIdView;
  position: number;
};

function SortableIdCard({ entry, position }: SortableIdCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.playerId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-dragging={isDragging}
      className="rank-card flex items-center gap-3 px-3 py-3 sm:px-4"
      {...attributes}
    >
      <button
        type="button"
        className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-[#171113] bg-[#c8b6ff]"
        aria-label={`Move ${entry.displayName} at position ${position}`}
        {...listeners}
      >
        <GripVertical size={17} strokeWidth={2.8} />
      </button>
      <span className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-[#171113] bg-[#fff06e] text-sm font-black">{position}</span>
      <PlayerAvatar name={entry.displayName} color={entry.avatarColor} avatarUrl={entry.avatarUrl} className="size-10" />
      <div className="min-w-0 flex-1">
        <p className="break-words font-extrabold leading-5">{entry.displayName}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-[0.11em] text-[#70575e]">Player ID</p>
      </div>
    </div>
  );
}

type PromptChoiceGridProps = {
  prompts: PromptOption[];
  onChoose: (promptId: string) => void;
  pending?: boolean;
  title?: string;
  selectedPromptId?: string | null;
};

function PromptChoiceGrid({ prompts, onChoose, pending, title, selectedPromptId }: PromptChoiceGridProps) {
  return (
    <section className="game-card p-5 sm:p-6">
      {title && <h2 className="display-type text-2xl leading-none sm:text-3xl">{title}</h2>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {prompts.map((prompt, index) => (
          <button
            type="button"
            key={prompt.id}
            data-selected={selectedPromptId === prompt.id}
            onClick={() => onChoose(prompt.id)}
            disabled={pending}
            className="prompt-option flex min-h-20 items-start gap-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-[#171113] bg-[#a8e7c1] text-xs font-black">{index + 1}</span>
            <span className="text-sm font-bold leading-5">{prompt.text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

type PlayerRosterProps = {
  room: GameRoomView;
  session: JoinSession;
  compact?: boolean;
};

function PlayerRoster({ room, session, compact = false }: PlayerRosterProps) {
  const sortedPlayers = [...room.players].sort((a, b) => {
    if (a.id === room.hostPlayerId) return -1;
    if (b.id === room.hostPlayerId) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <section className={classNames("game-card", compact ? "p-4" : "p-5")}> 
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow"><Users size={12} /> Room roster</p>
          {!compact && <h2 className="display-type mt-3 text-2xl leading-none">The people</h2>}
        </div>
        <span className="rounded-full border-2 border-[#171113] bg-[#fff06e] px-3 py-1.5 text-xs font-black">{room.players.length}/11</span>
      </div>
      <ul className="mt-4 space-y-2">
        {sortedPlayers.map(player => {
          const isJudge = player.id === room.judgePlayerId;
          const isYou = player.id === session.playerId;
          return (
            <li key={player.id} className="flex min-w-0 items-center gap-3 rounded-xl border-2 border-[#171113] bg-[#fffdf5]/80 px-3 py-2.5">
              <PlayerAvatar name={player.displayName} color={player.avatarColor} avatarUrl={player.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">{player.displayName}{isYou ? " (you)" : ""}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-[#70575e]">
                  {player.role === "host" && <span>Host</span>}
                  {isJudge && <span className="rounded bg-[#c8b6ff] px-1.5 py-0.5 text-[#171113]">Judge</span>}
                  {room.phase === "LOBBY" && <span className={player.isReady ? "text-[#187444]" : "text-[#9b5b18]"}>{player.isReady ? "Ready" : "Not ready"}</span>}
                </div>
              </div>
              <span className={classNames("status-dot", player.isConnected ? "status-dot--online" : "status-dot--offline")} title={player.isConnected ? "Connected" : "Reconnecting"} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type LeaderboardProps = {
  room: GameRoomView;
  session: JoinSession;
  final?: boolean;
};

function Leaderboard({ room, session, final = false }: LeaderboardProps) {
  const players = [...room.players].sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  return (
    <section className={classNames("game-card", final ? "bg-[#fff2a7]/90 p-5 sm:p-6" : "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow"><Trophy size={12} /> Live score</p>
          <h2 className="display-type mt-3 text-2xl leading-none">Leaderboard</h2>
        </div>
        <Medal size={31} strokeWidth={2.4} />
      </div>
      <ol className="mt-5 space-y-2">
        {players.map((player, index) => (
          <li key={player.id} className={classNames("flex items-center gap-3 rounded-xl border-2 border-[#171113] px-3 py-2.5", player.id === session.playerId ? "bg-[#a8e7c1]" : "bg-[#fffdf5]/85")}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-[#171113] bg-[#fff06e] text-xs font-black">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{player.displayName}{player.id === session.playerId ? " (you)" : ""}</span>
            <span className="rounded-md border-2 border-[#171113] bg-[#171113] px-2 py-1 text-xs font-black text-white">{player.score}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

type RankingListProps = {
  entries: RankedIdView[];
  includePoints?: boolean;
};

function RankingList({ entries, includePoints = false }: RankingListProps) {
  if (entries.length === 0) return null;
  return (
    <ol className="space-y-3">
      {entries.map(entry => (
        <li key={entry.playerId} className="rank-card flex items-center gap-3 px-3 py-3 sm:px-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-[#171113] bg-[#fff06e] text-sm font-black">{entry.rank}</span>
          <PlayerAvatar name={entry.displayName} color={entry.avatarColor} avatarUrl={entry.avatarUrl} className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="break-words font-extrabold leading-5">{entry.displayName}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.11em] text-[#70575e]">Player ID</p>
          </div>
          {includePoints && <span className="rounded-lg border-2 border-[#171113] bg-[#a8e7c1] px-2 py-1 text-xs font-black">+{entry.pointsAwarded ?? 0}</span>}
        </li>
      ))}
    </ol>
  );
}

type RoomAction = () => Promise<{ ok: boolean; error?: string }>;

export default function GameRoom() {
  const [, params] = useRoute("/room/:roomCode");
  const roomCode = params?.roomCode;
  const [, setLocation] = useLocation();
  const { session, room, connectionState, error } = useGameSession(roomCode);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [chosenGuess, setChosenGuess] = useState<string | null>(null);
  const [rankedIds, setRankedIds] = useState<RankedIdView[]>([]);

  const isHost = Boolean(room && session && room.hostPlayerId === session.playerId);
  const isJudge = Boolean(room && session && room.judgePlayerId === session.playerId);
  const currentPlayer = room?.players.find(player => player.id === session?.playerId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!room || room.phase !== "JUDGE_RANK" || !isJudge || !room.rankablePlayers) {
      setRankedIds([]);
      return;
    }

    setRankedIds(previous => {
      const incoming = room.rankablePlayers ?? [];
      const priorIds = previous.map(entry => entry.playerId).sort().join("|");
      const nextIds = incoming.map(entry => entry.playerId).sort().join("|");
      if (previous.length > 0 && priorIds === nextIds) {
        return previous.map(entry => incoming.find(next => next.playerId === entry.playerId) ?? entry);
      }
      return incoming;
    });
  }, [room, isJudge]);

  useEffect(() => {
    if (room?.phase !== "GUESS_PROMPT") {
      setChosenGuess(null);
    }
  }, [room?.phase]);

  const runAction = async (key: string, action: RoomAction) => {
    setPendingAction(key);
    try {
      const result = await action();
      if (!result.ok) toast.error(result.error ?? "That action did not go through.");
    } catch {
      toast.error("The game server did not respond. Try again after reconnecting.");
    } finally {
      setPendingAction(null);
    }
  };

  const leaveRoom = () => {
    clearStoredSession();
    setLocation("/");
  };

  const copyRoom = async () => {
    if (!room) return;
    const joinLink = `${window.location.origin}/room/${room.roomCode}`;
    try {
      await navigator.clipboard.writeText(`${room.roomCode}\n${joinLink}`);
      toast.success("Room code and join link copied.");
    } catch {
      toast.message(`Room code: ${room.roomCode}`);
    }
  };

  const handleRankingDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRankedIds(current => {
      const oldIndex = current.findIndex(entry => entry.playerId === active.id);
      const newIndex = current.findIndex(entry => entry.playerId === over.id);
      return oldIndex < 0 || newIndex < 0 ? current : arrayMove(current, oldIndex, newIndex);
    });
  };

  const roundProgress = useMemo(() => {
    if (!room) return "";
    return room.roundLimit === 0 ? `Round ${room.roundNumber} · Endless game` : `Round ${room.roundNumber} of ${room.roundLimit}`;
  }, [room]);

  if (!session || connectionState === "invalid") {
    return (
      <main className="game-shell grid min-h-screen place-items-center px-4 py-10">
        <section className="game-card max-w-lg p-6 text-center sm:p-8">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border-2 border-[#171113] bg-[#fff06e] shadow-[3px_3px_0_#171113]"><CircleHelp size={28} /></span>
          <h1 className="display-type mt-6 text-4xl leading-none">Room mismatch</h1>
          <p className="mx-auto mt-4 max-w-sm text-sm font-medium leading-6 text-[#5e464d]">{error ?? "Join a room from the home screen to start or resume this game."}</p>
          <button type="button" onClick={leaveRoom} className="game-button mt-6"><ArrowLeft size={17} className="mr-2 inline" /> Back to game lobby</button>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="game-shell grid min-h-screen place-items-center px-4">
        <div className="game-card flex max-w-sm flex-col items-center p-7 text-center">
          <LoaderCircle className="animate-spin" size={34} />
          <h1 className="display-type mt-5 text-3xl leading-none">Finding your people</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-[#5e464d]">{error ?? "Reconnecting to the room and restoring your place in the game."}</p>
          {connectionState === "offline" && <button type="button" className="game-button mt-5" onClick={() => void connectGameSocket().then(() => requestGameRoomState())}>Try again</button>}
        </div>
      </main>
    );
  }

  const lobbyReady = room.players.every(player => player.isReady);
  const canStart = isHost && room.players.length >= 3 && lobbyReady;
  const nonJudgePlayers = room.players.filter(player => player.id !== room.judgePlayerId);

  return (
    <main className="game-shell">
      <div className="container relative z-10 py-4 sm:py-6">
        <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={leaveRoom} className="flex items-center gap-2 text-left" aria-label="Leave room">
            <span className="grid size-10 place-items-center rounded-xl border-2 border-[#171113] bg-[#fff06e] shadow-[3px_3px_0_#171113]"><Dices size={21} /></span>
            <span><span className="display-type block text-lg leading-none">Ego &amp; ID</span><span className="mt-1 block text-[0.62rem] font-extrabold uppercase tracking-[0.12em]">Room {room.roomCode}</span></span>
          </button>
          <div className="flex items-center gap-2">
            <span className={classNames("flex items-center gap-1.5 rounded-full border-2 border-[#171113] px-3 py-1.5 text-xs font-black", connectionState === "connected" ? "bg-[#a8e7c1]" : "bg-[#ffb0b0]")}>
              {connectionState === "connected" ? <Wifi size={14} /> : <WifiOff size={14} />}
              {connectionState === "connected" ? "Live" : "Reconnecting"}
            </span>
            <span className="hidden rounded-full border-2 border-[#171113] bg-[#fffdf5]/75 px-3 py-1.5 text-xs font-black sm:block">{phaseLabel(room.phase)}</span>
          </div>
        </header>

        <div className="mx-auto mt-5 max-w-7xl">
          {room.phase !== "LOBBY" && room.phase !== "GAME_OVER" && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[#171113] bg-[#fffdf5]/75 px-4 py-3 shadow-[3px_3px_0_#171113]">
              <div className="flex items-center gap-2"><TimerReset size={18} /><span className="text-sm font-black">{roundProgress}</span></div>
              <div className="flex items-center gap-2 text-sm font-bold text-[#5e464d]"><Crown size={18} /><span>{room.players.find(player => player.id === room.judgePlayerId)?.displayName ?? "Choosing Judge"} is Judge</span></div>
            </div>
          )}

          {room.phase === "LOBBY" && (
            <LobbyStage
              room={room}
              session={session}
              isHost={isHost}
              canStart={canStart}
              pendingAction={pendingAction}
              onCopy={copyRoom}
              onToggleReady={() => void runAction("ready", () => setReady(!currentPlayer?.isReady))}
              onStart={() => void runAction("start", startGame)}
              onSettingsChange={settings => void runAction("settings", () => updateRoomSettings(settings))}
            />
          )}

          {room.phase === "JUDGE_SELECT" && (
            <JudgeSelectStage
              room={room}
              isJudge={isJudge}
              pendingAction={pendingAction}
              onSelect={promptId => void runAction(`prompt-${promptId}`, () => selectSecretPrompt(promptId))}
            />
          )}

          {room.phase === "JUDGE_RANK" && (
            <JudgeRankStage
              isJudge={isJudge}
              entries={rankedIds}
              room={room}
              pendingAction={pendingAction}
              sensors={sensors}
              onDragEnd={handleRankingDragEnd}
              onSubmit={() => void runAction("submit-ranking", () => submitRanking(rankedIds.map(entry => entry.playerId)))}
            />
          )}

          {room.phase === "GUESS_PROMPT" && (
            <GuessPromptStage
              room={room}
              isJudge={isJudge}
              hasGuessed={Boolean(currentPlayer?.hasGuessed)}
              selectedPromptId={chosenGuess}
              pendingAction={pendingAction}
              onChoose={promptId => setChosenGuess(promptId)}
              onSubmit={() => chosenGuess && void runAction("submit-guess", () => submitGuess(chosenGuess))}
              canForceReveal={isHost || isJudge}
              onForceReveal={() => void runAction("reveal-results", revealResults)}
            />
          )}

          {room.phase === "ROUND_RESULTS" && (
            <RoundResultsStage
              room={room}
              session={session}
              canAdvance={isHost}
              pendingAction={pendingAction}
              onAdvance={() => void runAction("advance-round", advanceRound)}
            />
          )}

          {room.phase === "GAME_OVER" && <GameOverStage room={room} session={session} onLeave={leaveRoom} />}

          {room.phase !== "LOBBY" && room.phase !== "GAME_OVER" && (
            <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="game-card p-4 sm:p-5">
                <p className="eyebrow"><Sparkles size={12} /> Round pulse</p>
                <p className="mt-3 text-sm font-bold leading-6 text-[#49363c]">{room.message}</p>
                {room.phase === "GUESS_PROMPT" && <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-[#70575e]">{nonJudgePlayers.filter(player => player.hasGuessed).length}/{nonJudgePlayers.length} prompt guesses locked in</p>}
              </div>
              {room.settings.showStandings && <Leaderboard room={room} session={session} />}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

type LobbyStageProps = {
  room: GameRoomView;
  session: JoinSession;
  isHost: boolean;
  canStart: boolean;
  pendingAction: string | null;
  onCopy: () => void;
  onToggleReady: () => void;
  onStart: () => void;
  onSettingsChange: (settings: Partial<GameRoomView["settings"]>) => void;
};

function LobbyStage({ room, session, isHost, canStart, pendingAction, onCopy, onToggleReady, onStart, onSettingsChange }: LobbyStageProps) {
  const currentPlayer = room.players.find(player => player.id === session.playerId);
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-6">
        <div className="game-card overflow-visible p-5 sm:p-8">
          <span aria-hidden="true" className="memphis-mark memphis-mark--diamond -right-2 -top-3 hidden sm:block" />
          <p className="eyebrow"><Users size={12} /> Waiting room</p>
          <h1 className="display-type mt-4 text-[clamp(2.5rem,7vw,5rem)] leading-[0.86]">Assemble<br />the chaos.</h1>
          <p className="mt-5 max-w-xl text-base font-medium leading-7 text-[#5e464d]">Share the room code. When everyone has marked ready, the host starts the first secret prompt.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border-2 border-[#171113] bg-[#fff06e] px-4 py-3 shadow-[3px_3px_0_#171113]">
              <p className="text-[0.65rem] font-black uppercase tracking-[0.12em]">Room code</p>
              <p className="display-type mt-1 text-3xl tracking-[0.1em]">{room.roomCode}</p>
            </div>
            <button type="button" onClick={onCopy} className="game-button game-button--mint flex items-center gap-2"><Copy size={17} /> Copy invite</button>
          </div>
        </div>

        <div className="game-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="eyebrow"><Check size={12} /> Your status</p>
              <h2 className="display-type mt-3 text-2xl leading-none">{currentPlayer?.isReady ? "You’re ready." : "Ready up."}</h2>
            </div>
            <button type="button" className={classNames("game-button", currentPlayer?.isReady ? "game-button--lilac" : "game-button--mint")} onClick={onToggleReady} disabled={pendingAction === "ready"}>
              {pendingAction === "ready" ? "Saving…" : currentPlayer?.isReady ? "Not ready" : "I’m ready"}
            </button>
          </div>
          <p className="mt-4 text-sm font-medium leading-6 text-[#5e464d]">You need at least three players. Everyone must be ready before the host can start.</p>
        </div>

        {isHost && (
          <div className="game-card p-5 sm:p-6">
            <p className="eyebrow"><Crown size={12} /> Host controls</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-black">
                Rounds per player
                <span className="relative mt-2 block">
                  <select
                    className="game-input appearance-none pr-10"
                    value={room.settings.roundsPerPlayer}
                    onChange={event => onSettingsChange({ roundsPerPlayer: Number(event.target.value) })}
                    disabled={pendingAction === "settings"}
                  >
                    <option value={1}>1 round each</option>
                    <option value={2}>2 rounds each</option>
                    <option value={3}>3 rounds each</option>
                    <option value={4}>4 rounds each</option>
                    <option value={5}>5 rounds each</option>
                    <option value={0}>Endless game</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" size={18} />
                </span>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#171113] bg-[#fffdf5] px-4 py-3 text-sm font-black">
                <span>Show live standings</span>
                <input
                  className="size-5 accent-[#171113]"
                  type="checkbox"
                  checked={room.settings.showStandings}
                  onChange={event => onSettingsChange({ showStandings: event.target.checked })}
                  disabled={pendingAction === "settings"}
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border-2 border-[#171113] bg-[#fffdf5] px-4 py-3 text-sm font-black">
                <span>Include risky prompts</span>
                <input
                  className="size-5 accent-[#171113]"
                  type="checkbox"
                  checked={room.settings.allowRiskyPrompts}
                  onChange={event => onSettingsChange({ allowRiskyPrompts: event.target.checked })}
                  disabled={pendingAction === "settings"}
                />
              </label>
            </div>
            <button type="button" className="game-button mt-6 flex w-full items-center justify-center gap-2" onClick={onStart} disabled={!canStart || pendingAction === "start"}>
              <Sparkles size={18} /> {pendingAction === "start" ? "Starting…" : canStart ? "Start the game" : room.players.length < 3 ? "Need 3 players to start" : "Waiting for ready players"} <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
      <PlayerRoster room={room} session={session} />
    </section>
  );
}

type JudgeSelectStageProps = {
  room: GameRoomView;
  isJudge: boolean;
  pendingAction: string | null;
  onSelect: (promptId: string) => void;
};

function JudgeSelectStage({ room, isJudge, pendingAction, onSelect }: JudgeSelectStageProps) {
  if (!isJudge) {
    const judge = room.players.find(player => player.id === room.judgePlayerId);
    return <WaitingStage title="The Judge is plotting." message={`${judge?.displayName ?? "The Judge"} is choosing one private prompt from exactly ten options. Your screen stays prompt-free.`} icon={<LockKeyhole size={36} />} />;
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-5 rounded-2xl border-2 border-[#171113] bg-[#c8b6ff] px-5 py-4 shadow-[3px_3px_0_#171113]">
        <div className="flex gap-3"><LockKeyhole className="mt-0.5 shrink-0" size={21} /><p className="text-sm font-bold leading-6">Private Judge view. Choose one prompt only; no one else can see these ten options.</p></div>
      </div>
      <PromptChoiceGrid prompts={room.promptOptions ?? []} onChoose={onSelect} pending={Boolean(pendingAction)} title="Choose the secret prompt" />
    </section>
  );
}

type JudgeRankStageProps = {
  room: GameRoomView;
  isJudge: boolean;
  entries: RankedIdView[];
  pendingAction: string | null;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onSubmit: () => void;
};

function JudgeRankStage({ room, isJudge, entries, pendingAction, sensors, onDragEnd, onSubmit }: JudgeRankStageProps) {
  if (!isJudge) {
    return <WaitingStage title="The Judge is ranking." message="The secret prompt is locked. The Judge is ordering the player IDs from best to worst fit." icon={<MoveVertical size={36} />} />;
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="mb-5 rounded-2xl border-2 border-[#171113] bg-[#fff06e] px-5 py-4 shadow-[3px_3px_0_#171113]">
        <div className="flex gap-3"><Crown className="mt-0.5 shrink-0" size={22} /><p className="text-sm font-bold leading-6">Judge view. Rank the player IDs for your secret prompt: <strong>best fit</strong> at the top, <strong>worst fit</strong> at the bottom. Keyboard users can focus a handle and use the arrow keys.</p></div>
      </div>
      <div className="game-card p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3"><div><p className="eyebrow"><MoveVertical size={12} /> Drag to rank</p><h1 className="display-type mt-3 text-3xl leading-none">Make the call.</h1></div><span className="text-right text-xs font-black uppercase tracking-[0.08em] text-[#70575e]">Best<br />to worst</span></div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={entries.map(entry => entry.playerId)} strategy={verticalListSortingStrategy}>
            <div className="mt-6 space-y-3">{entries.map((entry, index) => <SortableIdCard key={entry.playerId} entry={entry} position={index + 1} />)}</div>
          </SortableContext>
        </DndContext>
        <button type="button" className="game-button mt-6 flex w-full items-center justify-center gap-2" onClick={onSubmit} disabled={entries.length === 0 || pendingAction === "submit-ranking"}><Check size={18} /> {pendingAction === "submit-ranking" ? "Locking ranking…" : "Lock & reveal ranking"}</button>
      </div>
    </section>
  );
}

type GuessPromptStageProps = {
  room: GameRoomView;
  isJudge: boolean;
  hasGuessed: boolean;
  selectedPromptId: string | null;
  pendingAction: string | null;
  onChoose: (promptId: string) => void;
  onSubmit: () => void;
  canForceReveal: boolean;
  onForceReveal: () => void;
};

function GuessPromptStage({ room, isJudge, hasGuessed, selectedPromptId, pendingAction, onChoose, onSubmit, canForceReveal, onForceReveal }: GuessPromptStageProps) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border-2 border-[#171113] bg-[#c8b6ff] px-5 py-4 shadow-[3px_3px_0_#171113]">
        <p className="text-sm font-bold leading-6"><strong>The ranking is revealed.</strong> {isJudge ? "Players can now compare it with the ten prompts and lock in a guess." : "Study the order, choose one of the ten prompts below, then lock in your answer."}</p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(19rem,0.8fr)_minmax(0,1.2fr)]">
        <section className="game-card p-5 sm:p-6">
          <p className="eyebrow"><MoveVertical size={12} /> Revealed ranking</p>
          <h1 className="display-type mt-3 text-3xl leading-none">Best to worst.</h1>
          <div className="mt-6"><RankingList entries={room.ranking ?? []} /></div>
        </section>
        {isJudge ? (
          <WaitingStage title="Guesses are open." message="Your ranking and the ten prompt options are now visible to every player. Results reveal automatically after everyone locks in." icon={<CircleHelp size={36} />} />
        ) : (
          <div>
            <PromptChoiceGrid prompts={room.promptOptions ?? []} onChoose={onChoose} pending={Boolean(pendingAction) || hasGuessed} selectedPromptId={selectedPromptId} title="Which prompt was it?" />
            {hasGuessed ? (
              <div className="mt-5 rounded-2xl border-2 border-[#171113] bg-[#a8e7c1] p-4 text-sm font-bold shadow-[3px_3px_0_#171113]"><Check className="mr-2 inline" size={18} />Guess locked. Waiting for the other players.</div>
            ) : (
              <button type="button" className="game-button mt-5 flex w-full items-center justify-center gap-2" onClick={onSubmit} disabled={!selectedPromptId || pendingAction === "submit-guess"}><Check size={18} /> {pendingAction === "submit-guess" ? "Locking…" : "Lock my guess"}</button>
            )}
          </div>
        )}
      </div>
      {canForceReveal && <div className="flex justify-end"><button type="button" className="game-button game-button--lilac" onClick={onForceReveal} disabled={pendingAction === "reveal-results"}>Force reveal</button></div>}
    </section>
  );
}

type RoundResultsStageProps = {
  room: GameRoomView;
  session: JoinSession;
  canAdvance: boolean;
  pendingAction: string | null;
  onAdvance: () => void;
};

function RoundResultsStage({ room, session, canAdvance, pendingAction, onAdvance }: RoundResultsStageProps) {
  return (
    <section className="space-y-6">
      <div className="game-card overflow-visible p-5 sm:p-8">
        <span aria-hidden="true" className="memphis-mark memphis-mark--circle -right-4 -top-4 hidden sm:block" />
        <p className="eyebrow"><Sparkles size={12} /> Secret revealed</p>
        <h1 className="display-type mt-4 text-4xl leading-[0.9] sm:text-5xl">The prompt was…</h1>
        <div className="mt-6 rounded-2xl border-2 border-[#171113] bg-[#fff06e] p-5 shadow-[3px_3px_0_#171113]"><p className="text-xl font-black leading-7 sm:text-2xl">{room.secretPrompt?.text}</p></div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="game-card p-5 sm:p-6">
          <p className="eyebrow"><Trophy size={12} /> Rank points</p>
          <h2 className="display-type mt-3 text-3xl leading-none">How it landed</h2>
          <div className="mt-6"><RankingList entries={room.ranking ?? []} includePoints /></div>
          {room.scoreEvents && room.scoreEvents.length > 0 && <div className="mt-6 border-t-2 border-[#171113] pt-5"><p className="text-xs font-black uppercase tracking-[0.1em] text-[#70575e]">Scoring moments</p><ul className="mt-3 space-y-2">{room.scoreEvents.map((event, index) => <li key={`${event.playerId}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border-2 border-[#171113] bg-[#fffdf5] px-3 py-2 text-sm"><span className="font-bold">{room.players.find(player => player.id === event.playerId)?.displayName}: {event.label}</span><span className="shrink-0 font-black">+{event.points}</span></li>)}</ul></div>}
        </section>
        <div className="space-y-5"><Leaderboard room={room} session={session} />{canAdvance && <button type="button" className="game-button flex w-full items-center justify-center gap-2" onClick={onAdvance} disabled={pendingAction === "advance-round"}><ArrowRight size={18} /> {pendingAction === "advance-round" ? "Advancing…" : "Next round"}</button>}</div>
      </div>
    </section>
  );
}

type GameOverStageProps = {
  room: GameRoomView;
  session: JoinSession;
  onLeave: () => void;
};

function GameOverStage({ room, session, onLeave }: GameOverStageProps) {
  const winners = [...room.players].sort((a, b) => b.score - a.score);
  const topScore = winners[0]?.score ?? 0;
  const championNames = winners.filter(player => player.score === topScore).map(player => player.displayName).join(" & ");

  return (
    <section className="mx-auto max-w-4xl">
      <div className="game-card bg-[#fff06e]/90 p-6 text-center sm:p-10">
        <div className="mx-auto grid size-18 place-items-center rounded-full border-2 border-[#171113] bg-[#c8b6ff] shadow-[4px_4px_0_#171113]"><Crown size={36} /></div>
        <p className="eyebrow mt-6"><Trophy size={12} /> Final standings</p>
        <h1 className="display-type mt-4 text-4xl leading-[0.85] sm:text-6xl">Crown<br />the chaos.</h1>
        <p className="mt-5 text-lg font-black">{championNames} {winners.filter(player => player.score === topScore).length === 1 ? "takes" : "share"} the crown with {topScore} points.</p>
      </div>
      <div className="mt-6"><Leaderboard room={room} session={session} final /></div>
      <div className="mt-6 flex justify-center"><button type="button" className="game-button" onClick={onLeave}><ArrowLeft size={18} className="mr-2 inline" /> Create another room</button></div>
    </section>
  );
}

type WaitingStageProps = {
  title: string;
  message: string;
  icon: ReactNode;
};

function WaitingStage({ title, message, icon }: WaitingStageProps) {
  return (
    <section className="game-card mx-auto max-w-2xl p-6 text-center sm:p-10">
      <span className="mx-auto grid size-16 place-items-center rounded-2xl border-2 border-[#171113] bg-[#a8e7c1] shadow-[3px_3px_0_#171113]">{icon}</span>
      <h1 className="display-type mt-6 text-4xl leading-[0.9] sm:text-5xl">{title}</h1>
      <p className="mx-auto mt-5 max-w-lg text-sm font-medium leading-7 text-[#5e464d]">{message}</p>
      <div className="mx-auto mt-7 flex w-fit items-center gap-2 rounded-full border-2 border-[#171113] bg-[#fff06e] px-4 py-2 text-xs font-black"><span className="status-dot status-dot--online" /> Live room sync on</div>
    </section>
  );
}
