# The Ego & ID Game — Source Concept Summary

Source: `/home/ubuntu/upload/TheEgoAndIDGame.pdf`, reviewed July 20, 2026.

The service is a mobile-first, real-time party game. Players enter a room using a code; one participant acts as the Judge. Each round follows this progression: lobby setup, judge selection, private prompt selection, player submissions, judge ranking, guessing, reveal, and leaderboard/game-end progression.

The source document establishes a room model with active/inactive players, a five-player ranking pool that includes the Judge, a configurable number of rounds per player, and optional “isRisky” prompt filtering. The Judge privately chooses one of ten prompt options and ranks five displayed ID cards from most to least likely. Other players observe the ordered IDs, choose the prompt they believe was selected, and later see the true prompt and score effects.

Scoring in the source concept awards two points to correct guessers and one point to the Judge for every correct guess. If every active guesser selects the correct prompt, the Judge receives a five-point Mind Meld bonus and guessers receive one additional point. The source also calls for standings, tie-aware crowning, reconnection recovery through browser storage, a disconnect timeout/skip procedure, and reuse of prompts after exhaustion.

The source additionally requires a host-only or password-protected prompt dashboard supporting individual prompt create/edit/delete actions, “isRisky” metadata, and validated CSV import with duplicate prevention.

The user’s later specification refines the intended web service: Socket.io must power real-time synchronization; player contributions must be called “IDs”; the Judge sees exactly ten private prompt choices per round; the Judge ranks submitted IDs through drag-and-drop from best to worst fit; the secret prompt and ranking are revealed before prompt guessing; and the interface should use a vibrant Memphis-inspired palette of peach, mint, lilac, yellow, and contrasting black accents.
