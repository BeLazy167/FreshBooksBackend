ALTER TABLE "bills" ALTER COLUMN "signer" SET DATA TYPE uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bills" ADD CONSTRAINT "bills_signer_signers_id_fk" FOREIGN KEY ("signer") REFERENCES "public"."signers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "signers" ADD CONSTRAINT "signers_name_unique" UNIQUE("name");