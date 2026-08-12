import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { gamePrompts } from "../drizzle/schema";
import { getDb } from "./db";
import { refreshGamePromptCatalog } from "./gamePrompts";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const temporaryIds: string[] = [];

function createAdminContext(): TrpcContext {
  const admin: AuthenticatedUser = {
    id: 999999,
    openId: "prompt-admin-test-owner",
    name: "Prompt Admin Test",
    email: "test@example.com",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user: admin,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (db) {
    for (const id of temporaryIds.splice(0)) {
      await db.delete(gamePrompts).where(eq(gamePrompts.id, id));
    }
  }
  await refreshGamePromptCatalog();
});

describe("owner prompt administration", () => {
  it("allows an admin to create, edit, import, list, and delete temporary prompts without browser authentication", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const originalText = `…most likely to solve a riddle at midnight ${token}`;
    const updatedText = `…most likely to solve a mystery at midnight ${token}`;
    const importedText = `…most likely to bring a disco ball to brunch ${token}`;

    const created = await caller.prompts.create({ text: originalText, isRisky: false });
    temporaryIds.push(created.id);
    expect(created.text).toBe(originalText);

    const updated = await caller.prompts.update({
      id: created.id,
      prompt: { text: updatedText, isRisky: true },
    });
    expect(updated).toEqual({ id: created.id, text: updatedText, isRisky: true });

    const imported = await caller.prompts.import([
      { text: importedText, isRisky: false },
      { text: importedText, isRisky: false },
    ]);
    expect(imported).toEqual({ imported: 1, skipped: 0 });

    const prompts = await caller.prompts.list();
    const importedPrompt = prompts.find(prompt => prompt.text === importedText);
    expect(prompts.some(prompt => prompt.id === created.id && prompt.text === updatedText)).toBe(true);
    expect(importedPrompt).toBeDefined();
    temporaryIds.push(importedPrompt!.id);

    await caller.prompts.delete({ id: created.id });
    temporaryIds.splice(temporaryIds.indexOf(created.id), 1);
    await caller.prompts.delete({ id: importedPrompt!.id });
    temporaryIds.splice(temporaryIds.indexOf(importedPrompt!.id), 1);

    const afterDelete = await caller.prompts.list();
    expect(afterDelete.some(prompt => prompt.id === created.id || prompt.id === importedPrompt!.id)).toBe(false);
  });
});
