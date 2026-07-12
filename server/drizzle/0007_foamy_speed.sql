CREATE TABLE "mcp_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"path" text NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_uploads" ADD CONSTRAINT "mcp_uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_uploads_user_idx" ON "mcp_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mcp_uploads_expires_idx" ON "mcp_uploads" USING btree ("expires_at");