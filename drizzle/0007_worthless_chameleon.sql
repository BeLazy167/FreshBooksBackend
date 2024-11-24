ALTER TABLE "vegetables" ADD COLUMN "has_fixed_price" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "vegetables" ADD COLUMN "fixed_price" numeric(10, 2);