CREATE TABLE `ticker_state` (
	`ticker` text PRIMARY KEY NOT NULL,
	`latest_fiscal_year_end` text NOT NULL,
	`pending_valuation` integer DEFAULT true NOT NULL,
	`current_price` real
);
--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`fiscal_year_end` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `yearly_financials` (
	`ticker` text NOT NULL,
	`fiscal_year_end` text NOT NULL,
	`sales` real,
	`depreciation_amortization` real,
	`ebit` real,
	`interest_expense` real,
	`interest_income` real,
	`tax_expense` real,
	`minority_interests` real,
	`fully_diluted_shares` real,
	`capex_maintenance` real,
	`inventories` real,
	`accounts_receivable` real,
	`accounts_payable` real,
	`unearned_revenue` real,
	`dividends_paid` real,
	`cash_and_equivalents` real,
	`marketable_securities` real,
	`short_term_debt` real,
	`long_term_debt` real,
	`current_operating_leases` real,
	`non_current_operating_leases` real,
	`equity` real,
	PRIMARY KEY(`ticker`, `fiscal_year_end`)
);
