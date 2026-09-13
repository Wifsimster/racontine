CREATE TABLE "instance_subscription" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"trial_ends_at" timestamp NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"status" text,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"last_event_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
