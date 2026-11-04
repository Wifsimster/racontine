CREATE TABLE "capture_reminders" (
	"user_id" text NOT NULL,
	"child_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"time" text DEFAULT '18:30' NOT NULL,
	"days" integer[] DEFAULT '{1,2,3,4,5}'::integer[] NOT NULL,
	"last_sent_on" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "capture_reminders_user_id_child_id_pk" PRIMARY KEY("user_id","child_id")
);
--> statement-breakpoint
ALTER TABLE "capture_reminders" ADD CONSTRAINT "capture_reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capture_reminders" ADD CONSTRAINT "capture_reminders_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_reminders_enabled_idx" ON "capture_reminders" USING btree ("child_id") WHERE "capture_reminders"."enabled";