INSERT INTO "subscriptions" ("user_id", "child_id", "email_enabled")
SELECT "m"."user_id", "m"."child_id", true
FROM "memberships" "m"
WHERE NOT EXISTS (
  SELECT 1 FROM "subscriptions" "s"
  WHERE "s"."user_id" = "m"."user_id" AND "s"."child_id" = "m"."child_id"
)
ON CONFLICT ("user_id", "child_id") DO NOTHING;--> statement-breakpoint
UPDATE "notifications"
SET "dispatched_at" = COALESCE("emailed_at", "created_at")
WHERE "dispatched_at" IS NULL;
