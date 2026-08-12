import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Curated game prompts, managed by the project owner. */
export const gamePrompts = mysqlTable(
  "game_prompts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    text: varchar("text", { length: 500 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 500 }).notNull(),
    isRisky: boolean("isRisky").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("game_prompts_fingerprint_unique").on(table.fingerprint)],
);

export type GamePrompt = typeof gamePrompts.$inferSelect;
export type InsertGamePrompt = typeof gamePrompts.$inferInsert;

/** Snapshot and lifecycle metadata for each multiplayer room. */
export const gameRooms = mysqlTable(
  "game_rooms",
  {
    id: int("id").autoincrement().primaryKey(),
    roomCode: varchar("roomCode", { length: 6 }).notNull(),
    phase: mysqlEnum("phase", [
      "LOBBY",
      "JUDGE_SELECT",
      "JUDGE_RANK",
      "GUESS_PROMPT",
      "ROUND_RESULTS",
      "GAME_OVER",
    ])
      .default("LOBBY")
      .notNull(),
    hostPlayerId: varchar("hostPlayerId", { length: 64 }).notNull(),
    judgePlayerId: varchar("judgePlayerId", { length: 64 }),
    roundNumber: int("roundNumber").default(0).notNull(),
    totalRounds: int("totalRounds").default(0).notNull(),
    settingsJson: text("settingsJson").notNull(),
    stateJson: text("stateJson").notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("game_rooms_code_unique").on(table.roomCode), index("game_rooms_phase_index").on(table.phase)],
);

export type GameRoom = typeof gameRooms.$inferSelect;
export type InsertGameRoom = typeof gameRooms.$inferInsert;

/** Per-room player state used for auditability and leaderboard history. */
export const gamePlayers = mysqlTable(
  "game_players",
  {
    id: int("id").autoincrement().primaryKey(),
    roomCode: varchar("roomCode", { length: 6 }).notNull(),
    playerId: varchar("playerId", { length: 64 }).notNull(),
    displayName: varchar("displayName", { length: 48 }).notNull(),
    avatarUrl: varchar("avatarUrl", { length: 512 }),
    role: mysqlEnum("role", ["host", "player"]).notNull(),
    isReady: boolean("isReady").default(false).notNull(),
    isConnected: boolean("isConnected").default(true).notNull(),
    score: int("score").default(0).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("game_players_room_player_unique").on(table.roomCode, table.playerId),
    uniqueIndex("game_players_room_name_unique").on(table.roomCode, table.displayName),
    index("game_players_room_index").on(table.roomCode),
  ],
);

export type GamePlayer = typeof gamePlayers.$inferSelect;
export type InsertGamePlayer = typeof gamePlayers.$inferInsert;

/** Round-level player rankings, guesses, and awarded points. The legacy idText column remains nullable for existing records. */
export const gameRoundEntries = mysqlTable(
  "game_round_entries",
  {
    id: int("id").autoincrement().primaryKey(),
    roomCode: varchar("roomCode", { length: 6 }).notNull(),
    roundNumber: int("roundNumber").notNull(),
    playerId: varchar("playerId", { length: 64 }).notNull(),
    idText: varchar("idText", { length: 140 }),
    rankingPosition: int("rankingPosition"),
    guessedPromptId: varchar("guessedPromptId", { length: 64 }),
    pointsAwarded: int("pointsAwarded").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("game_round_entries_unique").on(table.roomCode, table.roundNumber, table.playerId),
    index("game_round_entries_room_round_index").on(table.roomCode, table.roundNumber),
  ],
);

export type GameRoundEntry = typeof gameRoundEntries.$inferSelect;
export type InsertGameRoundEntry = typeof gameRoundEntries.$inferInsert;
