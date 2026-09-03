CREATE TABLE `property_research` (
	`owner_key` text NOT NULL,
	`house_id` text NOT NULL,
	`address` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`sources_checked` text DEFAULT '' NOT NULL,
	`checked_at` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_key`, `house_id`)
);
