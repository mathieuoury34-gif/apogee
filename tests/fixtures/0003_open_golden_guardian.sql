CREATE TABLE `training_phase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`phase` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`intent` text,
	`objective` text,
	`race_id` integer,
	`coach_exchange_id` integer,
	`idempotency_key` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`race_id`) REFERENCES `race`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`coach_exchange_id`) REFERENCES `coach_exchange`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `training_phase_idempotency_idx` ON `training_phase` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `training_phase_range_idx` ON `training_phase` (`start_date`,`end_date`);