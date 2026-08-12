import { io } from "socket.io-client";

const serverUrl = "http://localhost:3000";
const tinySelfie = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3CsAAAAASUVORK5CYII=";

function connect(label) {
  return new Promise((resolve, reject) => {
    const socket = io(serverUrl, { path: "/socket.io", transports: ["websocket"] });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`${label} did not connect in time`));
    }, 5000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("connect_error", error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function emitAck(socket, event, ...args) {
  return new Promise(resolve => socket.emit(event, ...args, resolve));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sockets = [];
try {
  const host = await connect("host");
  const alex = await connect("Alex");
  const sam = await connect("Sam");
  sockets.push(host, alex, sam);

  const created = await emitAck(host, "room:create", { displayName: "Host", avatarDataUrl: tinySelfie });
  assert(created.ok, `room creation failed: ${created.error}`);
  const roomCode = created.data.room.roomCode;
  const hostView = created.data.room.players.find(player => player.id === created.data.session.playerId);
  assert(hostView?.avatarUrl?.startsWith("/manus-storage/game-avatars/"), "captured selfie did not upload to managed storage");

  const joinedAlex = await emitAck(alex, "room:join", { roomCode, displayName: "Alex" });
  const joinedSam = await emitAck(sam, "room:join", { roomCode, displayName: "Sam" });
  assert(joinedAlex.ok && joinedSam.ok, "players could not join the Socket.io room");

  assert((await emitAck(alex, "lobby:set-ready", true)).ok, "Alex could not ready up");
  assert((await emitAck(sam, "lobby:set-ready", true)).ok, "Sam could not ready up");
  assert((await emitAck(host, "game:start")).ok, "host could not start game");

  const judgeState = await emitAck(host, "room:request-state");
  const playerState = await emitAck(alex, "room:request-state");
  assert(judgeState.ok && playerState.ok, "could not retrieve synchronized state");
  assert(judgeState.data.phase === "JUDGE_SELECT", "game did not reach Judge selection");
  assert(judgeState.data.promptOptions.length === 10, "Judge did not receive exactly ten prompt options");
  assert(!playerState.data.promptOptions, "non-Judge received private prompt options");

  const secretPromptId = judgeState.data.promptOptions[0].id;
  assert((await emitAck(host, "game:select-prompt", secretPromptId)).ok, "Judge could not select secret prompt");

  const rankState = await emitAck(host, "room:request-state");
  assert(rankState.ok && rankState.data.phase === "JUDGE_RANK", "prompt selection did not move directly to Judge ranking");
  assert(rankState.data.rankablePlayers.length === 2, "Judge did not receive every non-Judge player ID");
  const rankedPlayerIds = rankState.data.rankablePlayers.map(entry => entry.playerId);
  assert((await emitAck(host, "game:submit-ranking", rankedPlayerIds)).ok, "Judge could not lock the drag ranking order");

  const guessingState = await emitAck(alex, "room:request-state");
  assert(guessingState.ok && guessingState.data.phase === "GUESS_PROMPT", "locked ranking did not open the combined guessing screen");
  assert(guessingState.data.ranking.length === 2, "revealed ranking was missing from the guessing screen");
  assert(guessingState.data.promptOptions.length === 10, "ten prompt choices were not shown beside the ranking");
  assert(!guessingState.data.secretPrompt, "secret prompt was exposed before all guesses were locked");

  const wrongPromptId = guessingState.data.promptOptions.find(prompt => prompt.id !== secretPromptId)?.id;
  assert(wrongPromptId, "could not select a deliberate wrong-answer prompt");
  assert((await emitAck(alex, "game:submit-guess", wrongPromptId)).ok, "Alex could not lock a guess");
  assert((await emitAck(sam, "game:submit-guess", wrongPromptId)).ok, "Sam could not lock a guess");

  const results = await emitAck(host, "room:request-state");
  assert(results.ok && results.data.phase === "ROUND_RESULTS", "wrong-answer round did not settle");
  assert(results.data.players.every(player => player.score === 0), "wrong answers incorrectly awarded points");

  console.log("Socket.io smoke test passed: selfie upload, private prompt selection, direct player ranking, combined ranking-and-prompt guessing, and zero-point wrong answers all worked.");
} finally {
  sockets.forEach(socket => socket.close());
}
