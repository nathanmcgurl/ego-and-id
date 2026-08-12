CREATE TABLE `game_players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomCode` varchar(6) NOT NULL,
	`playerId` varchar(64) NOT NULL,
	`displayName` varchar(48) NOT NULL,
	`role` enum('host','player') NOT NULL,
	`isReady` boolean NOT NULL DEFAULT false,
	`isConnected` boolean NOT NULL DEFAULT true,
	`score` int NOT NULL DEFAULT 0,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_players_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_players_room_player_unique` UNIQUE(`roomCode`,`playerId`),
	CONSTRAINT `game_players_room_name_unique` UNIQUE(`roomCode`,`displayName`)
);
--> statement-breakpoint
CREATE TABLE `game_prompts` (
	`id` varchar(64) NOT NULL,
	`text` varchar(500) NOT NULL,
	`fingerprint` varchar(500) NOT NULL,
	`isRisky` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_prompts_fingerprint_unique` UNIQUE(`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `game_rooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomCode` varchar(6) NOT NULL,
	`phase` enum('LOBBY','JUDGE_SELECT','SUBMIT_IDS','JUDGE_RANK','RANKING_REVEAL','GUESS_PROMPT','ROUND_RESULTS','GAME_OVER') NOT NULL DEFAULT 'LOBBY',
	`hostPlayerId` varchar(64) NOT NULL,
	`judgePlayerId` varchar(64),
	`roundNumber` int NOT NULL DEFAULT 0,
	`totalRounds` int NOT NULL DEFAULT 0,
	`settingsJson` text NOT NULL,
	`stateJson` text NOT NULL,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_rooms_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_rooms_code_unique` UNIQUE(`roomCode`)
);
--> statement-breakpoint
CREATE TABLE `game_round_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomCode` varchar(6) NOT NULL,
	`roundNumber` int NOT NULL,
	`playerId` varchar(64) NOT NULL,
	`idText` varchar(140),
	`rankingPosition` int,
	`guessedPromptId` varchar(64),
	`pointsAwarded` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_round_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_round_entries_unique` UNIQUE(`roomCode`,`roundNumber`,`playerId`)
);
--> statement-breakpoint
CREATE INDEX `game_players_room_index` ON `game_players` (`roomCode`);--> statement-breakpoint
CREATE INDEX `game_rooms_phase_index` ON `game_rooms` (`phase`);--> statement-breakpoint
CREATE INDEX `game_round_entries_room_round_index` ON `game_round_entries` (`roomCode`,`roundNumber`);