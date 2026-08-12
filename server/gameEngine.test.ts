import { describe, expect, it } from "vitest";
import { DEFAULT_PROMPTS, GameManager } from "./gameEngine";

type TestRoom = {
  manager: GameManager;
  roomCode: string;
  host: { playerId: string; sessionToken: string; roomCode: string };
  alex: { playerId: string; sessionToken: string; roomCode: string };
  sam: { playerId: string; sessionToken: string; roomCode: string };
};

function createStartedRoom(): TestRoom {
  const manager = new GameManager(DEFAULT_PROMPTS);
  const created = manager.createRoom({
    displayName: "Host",
    avatarUrl: "/manus-storage/game-avatars/test-host.jpg",
  });
  const alex = manager.joinRoom(created.room.roomCode, "Alex");
  const sam = manager.joinRoom(created.room.roomCode, "Sam");

  manager.setReady(created.room.roomCode, alex.session.playerId, true);
  manager.setReady(created.room.roomCode, sam.session.playerId, true);
  manager.startGame(created.room.roomCode, created.session.playerId);

  return {
    manager,
    roomCode: created.room.roomCode,
    host: created.session,
    alex: alex.session,
    sam: sam.session,
  };
}

function prepareGuessingScenario() {
  const setup = createStartedRoom();
  const judgeView = setup.manager.getRoomView(setup.roomCode, setup.host.playerId);
  const secretPromptId = judgeView.promptOptions?.[0]?.id;
  expect(secretPromptId).toBeTruthy();

  setup.manager.selectSecretPrompt(setup.roomCode, setup.host.playerId, secretPromptId!);
  setup.manager.submitRanking(setup.roomCode, setup.host.playerId, [setup.alex.playerId, setup.sam.playerId]);

  return { ...setup, secretPromptId: secretPromptId! };
}

describe("GameManager", () => {
  it("creates a room with a six-character code and reveals exactly ten prompt options only to the Judge", () => {
    const setup = createStartedRoom();
    const judgeView = setup.manager.getRoomView(setup.roomCode, setup.host.playerId);
    const playerView = setup.manager.getRoomView(setup.roomCode, setup.alex.playerId);

    expect(setup.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(judgeView.phase).toBe("JUDGE_SELECT");
    expect(judgeView.promptOptions).toHaveLength(10);
    expect(new Set(judgeView.promptOptions?.map(prompt => prompt.id))).toHaveLength(10);
    expect(judgeView.players.find(player => player.id === setup.host.playerId)?.avatarUrl).toBe("/manus-storage/game-avatars/test-host.jpg");
    expect(playerView.promptOptions).toBeUndefined();
    expect(playerView.secretPrompt).toBeUndefined();
  });

  it("joins a valid lobby and rejects invalid rooms, duplicate display names, and unverified avatar URLs", () => {
    const manager = new GameManager(DEFAULT_PROMPTS);
    const created = manager.createRoom({ displayName: "Host" });
    const joined = manager.joinRoom(created.room.roomCode, "Alex");

    expect(joined.session.roomCode).toBe(created.room.roomCode);
    expect(joined.room.players.map(player => player.displayName)).toEqual(["Host", "Alex"]);
    expect(() => manager.joinRoom("ZZZZZZ", "Taylor")).toThrow("could not find");
    expect(() => manager.joinRoom(created.room.roomCode, "alex")).toThrow("already in this room");
    expect(() => manager.joinRoom(created.room.roomCode, "Taylor", "https://example.com/avatar.jpg")).toThrow("could not be verified");
  });

  it("moves directly from private prompt selection to ranking the player IDs", () => {
    const setup = createStartedRoom();
    const judgeView = setup.manager.getRoomView(setup.roomCode, setup.host.playerId);
    const secretPromptId = judgeView.promptOptions?.[0]?.id;

    setup.manager.selectSecretPrompt(setup.roomCode, setup.host.playerId, secretPromptId!);

    const rankingView = setup.manager.getRoomView(setup.roomCode, setup.host.playerId);
    const waitingView = setup.manager.getRoomView(setup.roomCode, setup.alex.playerId);
    expect(rankingView.phase).toBe("JUDGE_RANK");
    expect(rankingView.rankablePlayers?.map(player => player.displayName)).toEqual(["Alex", "Sam"]);
    expect(rankingView.rankablePlayers?.every(player => player.avatarColor.length > 0)).toBe(true);
    expect(waitingView.rankablePlayers).toBeUndefined();
    expect(waitingView.promptOptions).toBeUndefined();
  });

  it("shows the revealed ranking and all ten prompt options together after the Judge locks the order", () => {
    const { manager, roomCode, alex, secretPromptId } = prepareGuessingScenario();
    const guessingView = manager.getRoomView(roomCode, alex.playerId);

    expect(guessingView.phase).toBe("GUESS_PROMPT");
    expect(guessingView.ranking?.map(entry => entry.displayName)).toEqual(["Alex", "Sam"]);
    expect(guessingView.promptOptions).toHaveLength(10);
    expect(guessingView.promptOptions?.some(prompt => prompt.id === secretPromptId)).toBe(true);
    expect(guessingView.secretPrompt).toBeUndefined();
  });

  it("validates that the Judge ranks every eligible player ID exactly once", () => {
    const setup = createStartedRoom();
    const judgeView = setup.manager.getRoomView(setup.roomCode, setup.host.playerId);
    const secretPromptId = judgeView.promptOptions?.[0]?.id;
    setup.manager.selectSecretPrompt(setup.roomCode, setup.host.playerId, secretPromptId!);

    expect(() => setup.manager.submitRanking(setup.roomCode, setup.host.playerId, [setup.alex.playerId, setup.alex.playerId])).toThrow("exactly once");
    expect(setup.manager.getRoomView(setup.roomCode, setup.host.playerId).phase).toBe("JUDGE_RANK");
  });

  it("awards ranking, correct-guess, Judge, and unanimous Mind Meld points when every guess is correct", () => {
    const { manager, roomCode, host, alex, sam, secretPromptId } = prepareGuessingScenario();
    manager.submitGuess(roomCode, alex.playerId, secretPromptId);
    manager.submitGuess(roomCode, sam.playerId, secretPromptId);

    const results = manager.getRoomView(roomCode, host.playerId);
    const byName = new Map(results.players.map(player => [player.displayName, player.score]));

    expect(results.phase).toBe("ROUND_RESULTS");
    expect(results.secretPrompt?.id).toBe(secretPromptId);
    expect(byName.get("Host")).toBe(7);
    expect(byName.get("Alex")).toBe(5);
    expect(byName.get("Sam")).toBe(4);
    expect(results.scoreEvents?.some(event => event.label === "Mind Meld bonus")).toBe(true);
  });

  it("awards zero points to players whose prompt guesses are wrong", () => {
    const { manager, roomCode, host, alex, sam, secretPromptId } = prepareGuessingScenario();
    const guessingView = manager.getRoomView(roomCode, alex.playerId);
    const wrongPromptId = guessingView.promptOptions?.find(prompt => prompt.id !== secretPromptId)?.id;
    expect(wrongPromptId).toBeTruthy();

    manager.submitGuess(roomCode, alex.playerId, wrongPromptId!);
    manager.submitGuess(roomCode, sam.playerId, wrongPromptId!);

    const results = manager.getRoomView(roomCode, host.playerId);
    const byName = new Map(results.players.map(player => [player.displayName, player.score]));

    expect(byName.get("Host")).toBe(0);
    expect(byName.get("Alex")).toBe(0);
    expect(byName.get("Sam")).toBe(0);
    expect(results.scoreEvents).toEqual([]);
    expect(results.ranking?.every(entry => entry.pointsAwarded === undefined)).toBe(true);
  });
});
