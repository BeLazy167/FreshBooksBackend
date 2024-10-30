ALTER TABLE "bills" DROP CONSTRAINT "bills_signer_signers_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bills" ADD CONSTRAINT "bills_signer_signers_name_fk" FOREIGN KEY ("signer") REFERENCES "public"."signers"("name") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
