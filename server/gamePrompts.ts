import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { gamePrompts } from "../drizzle/schema";
import type { PromptOption } from "../shared/game";
import { getDb } from "./db";
import { DEFAULT_PROMPTS, gameManager } from "./gameEngine";

export type PromptInput = {
  text: string;
  isRisky: boolean;
};

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function fingerprint(text: string) {
  return normalizeText(text).toLocaleLowerCase();
}

function validatePrompt(input: PromptInput) {
  const text = normalizeText(input.text);
  if (text.length < 5 || text.length > 500) {
    throw new Error("A prompt must contain between 5 and 500 characters.");
  }
  return { text, isRisky: Boolean(input.isRisky) };
}

function toPrompt(row: { id: string; text: string; isRisky: boolean }): PromptOption {
  return { id: row.id, text: row.text, isRisky: row.isRisky };
}

export async function refreshGamePromptCatalog() {
  const db = await getDb();
  if (!db) {
    gameManager.setPromptCatalog(DEFAULT_PROMPTS);
    return gameManager.getPromptCatalog();
  }

  const rows = await db.select().from(gamePrompts).orderBy(asc(gamePrompts.createdAt));
  const prompts = rows.map(toPrompt);
  gameManager.setPromptCatalog(prompts.length >= 10 ? prompts : DEFAULT_PROMPTS);
  return gameManager.getPromptCatalog();
}

export async function ensureGamePromptCatalog() {
  const db = await getDb();
  if (!db) return gameManager.getPromptCatalog();

  const existing = await db.select({ id: gamePrompts.id }).from(gamePrompts).limit(1);
  if (existing.length === 0) {
    await db.insert(gamePrompts).values(
      DEFAULT_PROMPTS.map(prompt => ({
        id: prompt.id,
        text: prompt.text,
        fingerprint: fingerprint(prompt.text),
        isRisky: prompt.isRisky,
      })),
    );
  }

  return refreshGamePromptCatalog();
}

export async function listPrompts() {
  const db = await getDb();
  if (!db) return gameManager.getPromptCatalog();
  const rows = await db.select().from(gamePrompts).orderBy(asc(gamePrompts.createdAt));
  return rows.map(toPrompt);
}

export async function createPrompt(input: PromptInput) {
  const db = await getDb();
  if (!db) throw new Error("Prompt management is temporarily unavailable.");

  const prompt = validatePrompt(input);
  const id = `prompt_${nanoid(12)}`;
  try {
    await db.insert(gamePrompts).values({
      id,
      text: prompt.text,
      fingerprint: fingerprint(prompt.text),
      isRisky: prompt.isRisky,
    });
  } catch (error) {
    if (String(error).toLocaleLowerCase().includes("duplicate")) {
      throw new Error("That prompt already exists in the catalog.");
    }
    throw error;
  }

  await refreshGamePromptCatalog();
  return { id, ...prompt };
}

export async function updatePrompt(id: string, input: PromptInput) {
  const db = await getDb();
  if (!db) throw new Error("Prompt management is temporarily unavailable.");

  const prompt = validatePrompt(input);
  try {
    const result = await db
      .update(gamePrompts)
      .set({ text: prompt.text, fingerprint: fingerprint(prompt.text), isRisky: prompt.isRisky })
      .where(eq(gamePrompts.id, id));

    if ((result[0] as { affectedRows?: number } | undefined)?.affectedRows === 0) {
      throw new Error("That prompt no longer exists.");
    }
  } catch (error) {
    if (String(error).toLocaleLowerCase().includes("duplicate")) {
      throw new Error("That prompt already exists in the catalog.");
    }
    throw error;
  }

  await refreshGamePromptCatalog();
  return { id, ...prompt };
}

export async function deletePrompt(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Prompt management is temporarily unavailable.");

  const promptCount = await db.select({ id: gamePrompts.id }).from(gamePrompts);
  if (promptCount.length <= 10) {
    throw new Error("Keep at least 10 prompts in the catalog so every Judge has a full choice set.");
  }

  await db.delete(gamePrompts).where(eq(gamePrompts.id, id));
  await refreshGamePromptCatalog();
  return { id };
}

export async function importPrompts(entries: PromptInput[]) {
  const db = await getDb();
  if (!db) throw new Error("Prompt management is temporarily unavailable.");

  const deduplicated = new Map<string, PromptInput>();
  entries.forEach(entry => {
    const prompt = validatePrompt(entry);
    deduplicated.set(fingerprint(prompt.text), prompt);
  });

  const candidates = Array.from(deduplicated.values());
  if (candidates.length === 0) throw new Error("No valid prompts were provided for import.");
  if (candidates.length > 200) throw new Error("Import up to 200 prompts at a time.");

  let imported = 0;
  let skipped = 0;
  for (const entry of candidates) {
    try {
      await db.insert(gamePrompts).values({
        id: `prompt_${nanoid(12)}`,
        text: entry.text,
        fingerprint: fingerprint(entry.text),
        isRisky: entry.isRisky,
      });
      imported += 1;
    } catch (error) {
      if (String(error).toLocaleLowerCase().includes("duplicate")) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  await refreshGamePromptCatalog();
  return { imported, skipped };
}
