PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ticker_state` (
	`ticker` text PRIMARY KEY NOT NULL,
	`latest_fiscal_year_end` text,
	`pending_valuation` integer DEFAULT true NOT NULL,
	`current_price` real
);
--> statement-breakpoint
INSERT INTO `__new_ticker_state`("ticker", "latest_fiscal_year_end", "pending_valuation", "current_price") SELECT "ticker", "latest_fiscal_year_end", "pending_valuation", "current_price" FROM `ticker_state`;--> statement-breakpoint
DROP TABLE `ticker_state`;--> statement-breakpoint
ALTER TABLE `__new_ticker_state` RENAME TO `ticker_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;