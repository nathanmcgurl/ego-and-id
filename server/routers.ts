import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createPrompt,
  deletePrompt,
  importPrompts,
  listPrompts,
  updatePrompt,
} from "./gamePrompts";

const promptInput = z.object({
  text: z.string().trim().min(5).max(500),
  isRisky: z.boolean().default(false),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  prompts: router({
    list: adminProcedure.query(() => listPrompts()),
    create: adminProcedure.input(promptInput).mutation(({ input }) => createPrompt(input)),
    update: adminProcedure
      .input(z.object({ id: z.string().min(1), prompt: promptInput }))
      .mutation(({ input }) => updatePrompt(input.id, input.prompt)),
    delete: adminProcedure.input(z.object({ id: z.string().min(1) })).mutation(({ input }) => deletePrompt(input.id)),
    import: adminProcedure.input(z.array(promptInput).min(1).max(200)).mutation(({ input }) => importPrompts(input)),
  }),
});

export type AppRouter = typeof appRouter;
