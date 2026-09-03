CREATE TABLE `house_decisions` (
	`owner_key` text NOT NULL,
	`house_id` text NOT NULL,
	`interest` text DEFAULT 'Undecided' NOT NULL,
	`action` text DEFAULT 'None' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_key`, `house_id`)
);
