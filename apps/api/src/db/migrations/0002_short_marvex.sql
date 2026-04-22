CREATE TABLE `yearly_estimates` (
	`ticker` text NOT NULL,
	`fiscal_year_end` text NOT NULL,
	`source` text NOT NULL,
	`captured_at` text NOT NULL,
	`sales_growth` real,
	`ebit_margin` real,
	`tax_rate` real,
	`capex_maintenance_sales_ratio` real,
	`net_debt_ebitda_ratio` real,
	PRIMARY KEY(`ticker`, `fiscal_year_end`, `source`)
);
--> statement-breakpoint
ALTER TABLE `valuations` ADD `source` text DEFAULT 'auto' NOT NULL;