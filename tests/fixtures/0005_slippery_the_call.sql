CREATE TABLE `brick_pair` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_actual_session_id` integer NOT NULL,
	`second_actual_session_id` integer NOT NULL,
	`day` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`first_actual_session_id`) REFERENCES `actual_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`second_actual_session_id`) REFERENCES `actual_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `brick_pair_first_idx` ON `brick_pair` (`first_actual_session_id`);--> statement-breakpoint
CREATE INDEX `brick_pair_second_idx` ON `brick_pair` (`second_actual_session_id`);