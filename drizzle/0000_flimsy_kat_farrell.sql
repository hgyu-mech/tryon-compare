CREATE TABLE `judge_sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`password_version` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tryon_attempts` (
	`local_id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`units` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`provider_task_id` text,
	`result_url` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_poll_at` integer DEFAULT 0 NOT NULL,
	`poll_lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tryon_owner_idx` ON `tryon_attempts` (`owner_hash`,`local_id`);