CREATE TABLE `manual_rebuild` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`requested_at` text DEFAULT '' NOT NULL,
	`completed_at` text DEFAULT '' NOT NULL
);
