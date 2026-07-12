CREATE TABLE "user_llm_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"anthropic_key_enc" text,
	"anthropic_key_hint" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_llm_settings" ADD CONSTRAINT "user_llm_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;