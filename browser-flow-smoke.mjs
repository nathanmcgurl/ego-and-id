import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";

const appUrl = "http://localhost:3000";
const chromePort = 9333;
const sessionKey = "ego-id-game:session";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function connectSocket(label) {
  return new Promise((resolve, reject) => {
    const socket = io(appUrl, { path: "/socket.io", transports: ["websocket"] });
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`${label} did not connect`));
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

async function waitForDebugger() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${chromePort}/json`);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw lastError ?? new Error("Chromium debugging endpoint did not start");
}

function createCdp(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(message.error.message));
    else entry.resolve(message.result);
  });

  return {
    ready,
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}

async function waitForExpression(cdp, expression, label) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const value = await evaluate(cdp, expression);
    if (value) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const sockets = [];
let chrome;
let cdp;
try {
  const host = await connectSocket("host");
  const alex = await connectSocket("Alex");
  const sam = await connectSocket("Sam");
  sockets.push(host, alex, sam);

  const created = await emitAck(host, "room:create", { displayName: "Browser Host" });
  assert(created.ok, `could not create browser test room: ${created.error}`);
  const { session, room } = created.data;
  const joinedAlex = await emitAck(alex, "room:join", { roomCode: room.roomCode, displayName: "Alex" });
  const joinedSam = await emitAck(sam, "room:join", { roomCode: room.roomCode, displayName: "Sam" });
  assert(joinedAlex.ok && joinedSam.ok, "browser test players could not join the room");

  chrome = spawn(
    "/usr/bin/chromium",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${chromePort}`,
      "--user-data-dir=/tmp/ego-id-browser-smoke",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const targets = await waitForDebugger();
  const page = targets.find(target => target.type === "page");
  assert(page?.webSocketDebuggerUrl, "could not find a Chromium page target");
  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await cdp.send("Page.navigate", { url: `${appUrl}/` });
  await waitForExpression(cdp, "Boolean(document.body) && document.readyState === 'complete'", "landing page");
  await evaluate(cdp, "Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Take a selfie'))?.click()");
  await waitForExpression(cdp, "Boolean(document.querySelector('video')) && document.body.innerText.includes('Capture')", "live selfie camera preview");
  await waitForExpression(cdp, "document.querySelector('video')?.videoWidth > 0 && document.querySelector('video')?.readyState >= 2", "camera video frame");
  await evaluate(cdp, "Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Capture'))?.click()");
  await waitForExpression(cdp, "document.body.innerText.toUpperCase().includes('SELFIE READY') && Boolean(document.querySelector('img[alt=\"Your captured selfie\"]'))", "captured selfie preview");
  await evaluate(cdp, `localStorage.setItem(${JSON.stringify(sessionKey)}, ${JSON.stringify(JSON.stringify(session))})`);
  await cdp.send("Page.navigate", { url: `${appUrl}/room/${room.roomCode}` });
  await waitForExpression(cdp, "Boolean(document.body) && document.body.innerText.includes('ASSEMBLE') && document.body.innerText.includes('THE CHAOS')", "live lobby");

  const lobbyText = await evaluate(cdp, "document.body.innerText");
  const normalizedLobbyText = lobbyText.toLocaleUpperCase();
  assert(lobbyText.includes(room.roomCode), "live lobby did not show the generated room code");
  assert(normalizedLobbyText.includes("BROWSER HOST"), "live lobby did not restore the player name");
  assert(normalizedLobbyText.includes("NOT READY"), "live lobby did not render the host ready-state action");

  assert((await emitAck(alex, "lobby:set-ready", true)).ok, "Alex could not ready up");
  assert((await emitAck(sam, "lobby:set-ready", true)).ok, "Sam could not ready up");
  assert((await emitAck(host, "game:start")).ok, "Host could not start the live round");
  await waitForExpression(cdp, "document.body && document.body.innerText.includes('CHOOSE THE SECRET PROMPT')", "Judge secret prompt screen");

  const judgeState = await emitAck(host, "room:request-state");
  assert(judgeState.ok && judgeState.data.promptOptions.length === 10, "Judge did not receive ten private prompt options");
  const secretPromptId = judgeState.data.promptOptions[0].id;
  const secretPromptText = judgeState.data.promptOptions[0].text;
  assert((await emitAck(host, "game:select-prompt", secretPromptId)).ok, "Host could not select the secret prompt");
  await waitForExpression(cdp, "document.body && document.body.innerText.includes('MAKE THE CALL')", "direct Judge drag-ranking screen");

  const initialRankingText = await evaluate(cdp, "Array.from(document.querySelectorAll('.rank-card')).map(card => card.textContent?.trim()).join('||')");
  const focusedHandle = await evaluate(cdp, "(() => { const handle = document.querySelector('button[aria-label^=\"Move\"]'); handle?.focus(); return document.activeElement?.getAttribute('aria-label') ?? ''; })()");
  assert(focusedHandle.startsWith("Move "), "a judge drag handle could not receive keyboard focus");
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  for (let step = 0; step < 5; step += 1) {
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 });
    await delay(25);
  }
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await delay(150);
  const keyboardMovedRankingText = await evaluate(cdp, "Array.from(document.querySelectorAll('.rank-card')).map(card => card.textContent?.trim()).join('||')");
  assert(keyboardMovedRankingText !== initialRankingText, "keyboard drag controls did not reorder the Judge's ID list");

  const rankState = await emitAck(host, "room:request-state");
  assert(rankState.ok && rankState.data.rankablePlayers.length === 2, "Judge did not receive the player IDs");
  assert((await emitAck(host, "game:submit-ranking", rankState.data.rankablePlayers.map(entry => entry.playerId))).ok, "Host could not submit the drag ranking");
  await waitForExpression(cdp, "document.body && document.body.innerText.includes('BEST TO WORST') && document.body.innerText.includes('GUESSES ARE OPEN')", "combined ranking and guessing screen");

  const playerGuessingState = await emitAck(alex, "room:request-state");
  assert(playerGuessingState.ok && playerGuessingState.data.ranking.length === 2, "player did not receive the revealed ranking");
  assert(playerGuessingState.data.promptOptions.length === 10, "player did not receive ten prompts beside the ranking");

  assert((await emitAck(alex, "game:submit-guess", secretPromptId)).ok, "Alex could not submit a prompt guess");
  assert((await emitAck(sam, "game:submit-guess", secretPromptId)).ok, "Sam could not submit a prompt guess");
  await waitForExpression(cdp, "document.body && document.body.innerText.includes('THE PROMPT WAS')", "round results screen");
  const resultText = await evaluate(cdp, "document.body.innerText");
  assert(resultText.includes(secretPromptText), "round results did not reveal the selected secret prompt");

  console.log("Browser game-flow smoke test passed: selfie capture, lobby restoration, private Judge selection, keyboard player ranking, combined ranking-and-prompts, and results all rendered correctly.");
} finally {
  cdp?.close();
  chrome?.kill("SIGTERM");
  sockets.forEach(socket => socket.close());
}
