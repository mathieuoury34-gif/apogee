CREATE TABLE `actual_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`garmin_activity_id` text NOT NULL,
	`discipline` text NOT NULL,
	`raw_exercise_type` text,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`zone_offset_minutes` integer,
	`duration_sec` integer NOT NULL,
	`distance_m` real,
	`active_calories_j` real,
	`total_calories_j` real,
	`elevation_gain_m` real,
	`avg_hr_bpm` real,
	`max_hr_bpm` integer,
	`min_hr_bpm` integer,
	`hr_coverage_ratio` real,
	`hr_sample_count` integer,
	`avg_speed_ms` real,
	`max_speed_ms` real,
	`hr_series` text,
	`speed_series` text,
	`load_method` text,
	`load` real,
	`hr_drift` real,
	`ingested_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actual_session_garmin_idx` ON `actual_session` (`garmin_activity_id`);--> statement-breakpoint
CREATE INDEX `actual_session_start_idx` ON `actual_session` (`start_at`);--> statement-breakpoint
CREATE INDEX `actual_session_discipline_idx` ON `actual_session` (`discipline`,`start_at`);--> statement-breakpoint
CREATE TABLE `athlete` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`display_name` text,
	`birth_date` text,
	`availability` text,
	`equipment` text,
	`injuries` text,
	`locale_preference` text DEFAULT 'fr' NOT NULL,
	`theme_preference` text DEFAULT 'system' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coach_exchange` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`direction` text NOT NULL,
	`exchange_schema_version` text NOT NULL,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`operation_count` integer,
	`payload_hash` text,
	`plan_valid_until` text,
	`error` text,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `coach_exchange_occurred_idx` ON `coach_exchange` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `daily_load` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`load` real DEFAULT 0 NOT NULL,
	`fitness` real,
	`fatigue` real,
	`freshness` real,
	`daily_form` real,
	`computed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_load_day_idx` ON `daily_load` (`day`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actual_session_id` integer,
	`planned_session_id` integer,
	`rpe` integer,
	`comment` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`actual_session_id`) REFERENCES `actual_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_session_id`) REFERENCES `planned_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feedback_actual_idx` ON `feedback` (`actual_session_id`);--> statement-breakpoint
CREATE TABLE `interruption` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text DEFAULT 'other' NOT NULL,
	`daily_load_override` real,
	`suspends_reminders` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interruption_range_idx` ON `interruption` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `manual_override` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`target_table` text NOT NULL,
	`target_key` text NOT NULL,
	`day` text NOT NULL,
	`numeric_value` real,
	`text_value` text,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manual_override_target_idx` ON `manual_override` (`target_table`,`target_key`,`day`);--> statement-breakpoint
CREATE TABLE `planned_block` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planned_session_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`repetitions` integer,
	`duration_sec` integer,
	`distance_m` real,
	`rest_sec` integer,
	`target_type` text,
	`target_value` real,
	`target_value_max` real,
	`notes` text,
	FOREIGN KEY (`planned_session_id`) REFERENCES `planned_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_block_position_idx` ON `planned_block` (`planned_session_id`,`position`);--> statement-breakpoint
CREATE TABLE `planned_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discipline` text NOT NULL,
	`planned_date` text NOT NULL,
	`title` text,
	`origin` text DEFAULT 'manual' NOT NULL,
	`planned_duration_sec` integer,
	`planned_distance_m` real,
	`notes` text,
	`coach_exchange_id` integer,
	`idempotency_key` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`coach_exchange_id`) REFERENCES `coach_exchange`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_session_idempotency_idx` ON `planned_session` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `planned_session_date_idx` ON `planned_session` (`planned_date`);--> statement-breakpoint
CREATE TABLE `race` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`race_date` text NOT NULL,
	`swim_distance_m` integer,
	`bike_distance_m` integer,
	`run_distance_m` integer,
	`target_total_seconds` integer,
	`target_revised_at` text,
	`is_primary` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resting_hr` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`bpm` real NOT NULL,
	`external_id` text,
	`ingested_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resting_hr_day_idx` ON `resting_hr` (`day`);--> statement-breakpoint
CREATE TABLE `schema_meta` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_link` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planned_session_id` integer,
	`actual_session_id` integer,
	`link_type` text DEFAULT 'auto' NOT NULL,
	`confidence` real,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`planned_session_id`) REFERENCES `planned_session`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actual_session_id`) REFERENCES `actual_session`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_link_pair_idx` ON `session_link` (`planned_session_id`,`actual_session_id`);--> statement-breakpoint
CREATE TABLE `sleep_night` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`night_date` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`zone_offset_minutes` integer,
	`duration_sec` integer NOT NULL,
	`phases` text,
	`external_id` text,
	`ingested_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_night_date_idx` ON `sleep_night` (`night_date`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`record_type` text PRIMARY KEY NOT NULL,
	`synced_until` text,
	`last_run_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `zone` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`measured_at` text NOT NULL,
	`source` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `zone_kind_measured_idx` ON `zone` (`kind`,`measured_at`);