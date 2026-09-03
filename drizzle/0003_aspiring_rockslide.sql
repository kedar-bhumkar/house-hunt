CREATE TABLE `negotiation_simulations` (
	`owner_key` text NOT NULL,
	`id` text NOT NULL,
	`house_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`state_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner_key`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_negotiation_simulations_owner_house_created` ON `negotiation_simulations` (`owner_key`,`house_id`,`created_at`);