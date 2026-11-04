CREATE TABLE "entry_reads" (
	"user_id" text NOT NULL,
	"entry_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entry_reads_user_id_entry_id_pk" PRIMARY KEY("user_id","entry_id")
);
--> statement-breakpoint
ALTER TABLE "entry_reads" ADD CONSTRAINT "entry_reads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_reads" ADD CONSTRAINT "entry_reads_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_reads_entry_idx" ON "entry_reads" USING btree ("entry_id");