import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const appUrl = "http://localhost:3000";
const chromePort = 9222;
const originalText = "…most likely to juggle while telling a ghost story";
const editedText = "…most likely to juggle while solving a mystery";
const importedText = "…most likely to bring a disco ball to brunch";

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    const pendingRequest = pending.get(message.id);
    if (!pendingRequest) return;
    pending.delete(message.id);
    if (message.error) pendingRequest.reject(new Error(message.error.message));
    else pendingRequest.resolve(message.result);
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
    if (await evaluate(cdp, expression)) return;
    await delay(160);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function quoted(value) {
  return JSON.stringify(value);
}

let cdp;
try {
  const targets = await waitForDebugger();
  const page = targets.find(target => target.type === "page");
  assert(page?.webSocketDebuggerUrl, "could not find an authenticated browser page");
  cdp = createCdp(page.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await cdp.send("Page.navigate", { url: `${appUrl}/admin` });
  await waitForExpression(cdp, "document.body && document.body.innerText.includes('PROMPT STUDIO') && document.body.innerText.includes('CURRENT CATALOG')", "authenticated prompt studio");
  await evaluate(cdp, `window.confirm = () => true`);

  const originalExists = await evaluate(cdp, `document.body.innerText.includes(${quoted(originalText)})`);
  assert(!originalExists, "temporary create-test prompt already exists in the catalog");

  await evaluate(cdp, `(() => { const input = document.querySelector('#prompt-text'); input.value = ${quoted(originalText)}; input.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  await evaluate(cdp, `Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Add prompt'))?.click()`);
  await waitForExpression(cdp, `document.body.innerText.includes(${quoted(originalText)})`, "created prompt row");

  await evaluate(cdp, `Array.from(document.querySelectorAll('button[aria-label^="Edit"]')).find(button => button.getAttribute('aria-label')?.includes(${quoted(originalText)}))?.click()`);
  await waitForExpression(cdp, `document.querySelector('#prompt-text')?.value === ${quoted(originalText)}`, "edit form prefill");
  await evaluate(cdp, `(() => { const input = document.querySelector('#prompt-text'); input.value = ${quoted(editedText)}; input.dispatchEvent(new Event('input', {bubbles: true})); })()`);
  await evaluate(cdp, `Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Save changes'))?.click()`);
  await waitForExpression(cdp, `document.body.innerText.includes(${quoted(editedText)}) && !document.body.innerText.includes(${quoted(originalText)})`, "updated prompt row");

  await evaluate(cdp, `(() => {
    const input = document.querySelector('input[type=file]');
    const transfer = new DataTransfer();
    transfer.items.add(new File(['prompt,isRisky\\n${importedText},false'], 'prompt-import.csv', { type: 'text/csv' }));
    Object.defineProperty(input, 'files', { value: transfer.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitForExpression(cdp, `document.body.innerText.includes(${quoted(importedText)})`, "CSV-imported prompt row");

  await evaluate(cdp, `Array.from(document.querySelectorAll('button[aria-label^="Delete"]')).find(button => button.getAttribute('aria-label')?.includes(${quoted(editedText)}))?.click()`);
  await waitForExpression(cdp, `!document.body.innerText.includes(${quoted(editedText)})`, "deleted edited prompt row");
  await evaluate(cdp, `Array.from(document.querySelectorAll('button[aria-label^="Delete"]')).find(button => button.getAttribute('aria-label')?.includes(${quoted(importedText)}))?.click()`);
  await waitForExpression(cdp, `!document.body.innerText.includes(${quoted(importedText)})`, "deleted imported prompt row");

  console.log("Authenticated prompt-studio browser test passed: create, edit, validated CSV import, and clean deletion all completed without leaving temporary prompts behind.");
} finally {
  cdp?.close();
}
