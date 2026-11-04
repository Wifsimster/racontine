CREATE TYPE "public"."subscription_cadence" AS ENUM('chaque', 'hebdo');--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dispatched_at" timestamp;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cadence" "subscription_cadence" DEFAULT 'chaque' NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_pending_idx" ON "notifications" USING btree ("created_at") WHERE "notifications"."dispatched_at" is null;