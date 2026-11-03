CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_hi" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"officer_id" text NOT NULL,
	"channel" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"allowed" boolean NOT NULL,
	"block_reason" text,
	"via_sync" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"as_of_date" date NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" text,
	"rows_total" integer NOT NULL,
	"rows_ok" integer NOT NULL,
	"rows_rejected" integer NOT NULL,
	"newly_overdue" integer DEFAULT 0 NOT NULL,
	"cured" integer DEFAULT 0 NOT NULL,
	"reassigned" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" text PRIMARY KEY NOT NULL,
	"borrower_name" text NOT NULL,
	"business_type" text NOT NULL,
	"phone" text NOT NULL,
	"address" text NOT NULL,
	"pincode" text NOT NULL,
	"lat" real,
	"lng" real,
	"branch_id" text NOT NULL,
	"language" text DEFAULT 'hi' NOT NULL,
	"emi_amount" integer NOT NULL,
	"outstanding" integer NOT NULL,
	"overdue_amount" integer NOT NULL,
	"dpd" integer NOT NULL,
	"missed_emis_12m" integer DEFAULT 0 NOT NULL,
	"months_on_book" integer DEFAULT 12 NOT NULL,
	"last_payment_date" date,
	"last_payment_amount" integer,
	"status" text DEFAULT 'overdue' NOT NULL,
	"overdue_since" date,
	"cured_on" date,
	"last_import_date" date,
	"assigned_officer_id" text,
	"assignment_note" text,
	"manager_rank" integer,
	"score" integer,
	"risk_probability" real,
	"confidence" text,
	"reasons" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"promise_id" text,
	"recipient" text NOT NULL,
	"channel" text NOT NULL,
	"language" text NOT NULL,
	"template_id" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"block_reason" text,
	"source" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"params" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"officer_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer,
	"note" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lat" real,
	"lng" real,
	"accuracy_m" real,
	"gps_status" text NOT NULL,
	"distance_m" integer,
	"late_entry" boolean DEFAULT false NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promises" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_id" text NOT NULL,
	"officer_id" text NOT NULL,
	"outcome_id" text,
	"promised_date" date NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"as_of_date" date NOT NULL,
	"loan_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"officer_id" text,
	"dpd" integer NOT NULL,
	"outstanding" integer NOT NULL,
	"overdue_amount" integer NOT NULL,
	"last_payment_date" date,
	"last_payment_amount" integer,
	"score" integer,
	"risk_probability" real
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"branch_id" text,
	"phone" text,
	"pincodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_load" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"locale" text DEFAULT 'hi' NOT NULL,
	"last_sync_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_attempts" ADD CONSTRAINT "contact_attempts_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_assigned_officer_id_users_id_fk" FOREIGN KEY ("assigned_officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_officer_id_users_id_fk" FOREIGN KEY ("officer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_officer_idx" ON "contact_attempts" USING btree ("officer_id");--> statement-breakpoint
CREATE INDEX "attempts_at_idx" ON "contact_attempts" USING btree ("at");--> statement-breakpoint
CREATE INDEX "loans_officer_idx" ON "loans" USING btree ("assigned_officer_id");--> statement-breakpoint
CREATE INDEX "loans_branch_idx" ON "loans" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "messages_loan_idx" ON "messages" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "outcomes_loan_idx" ON "outcomes" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "outcomes_officer_idx" ON "outcomes" USING btree ("officer_id");--> statement-breakpoint
CREATE INDEX "promises_loan_idx" ON "promises" USING btree ("loan_id");--> statement-breakpoint
CREATE INDEX "promises_status_idx" ON "promises" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_date_loan_idx" ON "snapshots" USING btree ("as_of_date","loan_id");--> statement-breakpoint
CREATE INDEX "snapshots_loan_idx" ON "snapshots" USING btree ("loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");