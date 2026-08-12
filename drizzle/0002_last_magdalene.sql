UPDATE `game_rooms` SET `phase` = 'JUDGE_RANK' WHERE `phase` = 'SUBMIT_IDS';--> statement-breakpoint
UPDATE `game_rooms` SET `phase` = 'GUESS_PROMPT' WHERE `phase` = 'RANKING_REVEAL';--> statement-breakpoint
ALTER TABLE `game_rooms` MODIFY COLUMN `phase` enum('LOBBY','JUDGE_SELECT','JUDGE_RANK','GUESS_PROMPT','ROUND_RESULTS','GAME_OVER') NOT NULL DEFAULT 'LOBBY';--> statement-breakpoint
ALTER TABLE `game_players` ADD `avatarUrl` varchar(512);
