ALTER TABLE "entries" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
CREATE INDEX "entries_batch_idx" ON "entries" USING btree ("batch_id");