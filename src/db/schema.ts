import {
  pgTable,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  serial,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export type Role = "officer" | "manager" | "head";
export type OutcomeType = "paid" | "promise" | "not_reachable" | "dispute";
export type PromiseStatus = "open" | "kept" | "broken" | "superseded";
export type GpsStatus = "ok" | "denied" | "unavailable" | "timeout";
export type Confidence = "high" | "medium" | "low";

export type Reason = {
  key: string; // i18n key, e.g. "reason.broken_promises"
  params: Record<string, string | number>;
  impact: number; // score points this factor adds (+) or removes (-)
};

export const branches = pgTable("branches", {
  id: text("id").primaryKey(), // e.g. "SYG"
  name: text("name").notNull(),
  nameHi: text("name_hi").notNull(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<Role>().notNull(),
    branchId: text("branch_id").references(() => branches.id),
    phone: text("phone"),
    pincodes: jsonb("pincodes").$type<string[]>().notNull().default([]),
    maxLoad: integer("max_load").notNull().default(30),
    active: boolean("active").notNull().default(true),
    locale: text("locale").$type<"hi" | "en">().notNull().default("hi"),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const loans = pgTable(
  "loans",
  {
    id: text("id").primaryKey(), // LN-10293
    borrowerName: text("borrower_name").notNull(),
    businessType: text("business_type").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    pincode: text("pincode").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    branchId: text("branch_id").notNull().references(() => branches.id),
    language: text("language").$type<"hi" | "en">().notNull().default("hi"),
    emiAmount: integer("emi_amount").notNull(),
    outstanding: integer("outstanding").notNull(),
    overdueAmount: integer("overdue_amount").notNull(),
    dpd: integer("dpd").notNull(),
    missedEmis12m: integer("missed_emis_12m").notNull().default(0),
    monthsOnBook: integer("months_on_book").notNull().default(12),
    lastPaymentDate: date("last_payment_date"),
    lastPaymentAmount: integer("last_payment_amount"),
    status: text("status").$type<"overdue" | "cured" | "npa">().notNull().default("overdue"),
    overdueSince: date("overdue_since"),
    lastImportDate: date("last_import_date"),
    assignedOfficerId: text("assigned_officer_id").references(() => users.id),
    assignmentNote: text("assignment_note"),
    // Manager override: lower number = higher in the officer's list. Null = follow the score.
    managerRank: integer("manager_rank"),
    score: integer("score"),
    riskProbability: real("risk_probability"),
    confidence: text("confidence").$type<Confidence>(),
    reasons: jsonb("reasons").$type<Reason[]>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("loans_officer_idx").on(t.assignedOfficerId),
    index("loans_branch_idx").on(t.branchId),
  ],
);

export const imports = pgTable("imports", {
  id: serial("id").primaryKey(),
  asOfDate: date("as_of_date").notNull(),
  fileName: text("file_name").notNull(),
  uploadedBy: text("uploaded_by").references(() => users.id),
  rowsTotal: integer("rows_total").notNull(),
  rowsOk: integer("rows_ok").notNull(),
  rowsRejected: integer("rows_rejected").notNull(),
  newlyOverdue: integer("newly_overdue").notNull().default(0),
  cured: integer("cured").notNull().default(0),
  reassigned: integer("reassigned").notNull().default(0),
  errors: jsonb("errors").$type<{ row: number; loanId?: string; message: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per overdue loan per daily file. Source of truth for roll rates and the model back-test.
export const snapshots = pgTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    asOfDate: date("as_of_date").notNull(),
    loanId: text("loan_id").notNull(),
    branchId: text("branch_id").notNull(),
    officerId: text("officer_id"),
    dpd: integer("dpd").notNull(),
    outstanding: integer("outstanding").notNull(),
    overdueAmount: integer("overdue_amount").notNull(),
    score: integer("score"),
    riskProbability: real("risk_probability"),
  },
  (t) => [
    uniqueIndex("snapshots_date_loan_idx").on(t.asOfDate, t.loanId),
    index("snapshots_loan_idx").on(t.loanId),
  ],
);

export const modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  trainedAt: timestamp("trained_at", { withTimezone: true }).notNull().defaultNow(),
  params: jsonb("params").$type<import("@/domain/scoring/model").ModelParams>().notNull(),
  metrics: jsonb("metrics").$type<import("@/domain/scoring/model").ModelMetrics>().notNull(),
  active: boolean("active").notNull().default(false),
});

export const outcomes = pgTable(
  "outcomes",
  {
    id: text("id").primaryKey(), // client-generated UUID: makes offline sync idempotent
    loanId: text("loan_id").notNull().references(() => loans.id),
    officerId: text("officer_id").notNull().references(() => users.id),
    type: text("type").$type<OutcomeType>().notNull(),
    amount: integer("amount"),
    note: text("note"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    lat: real("lat"),
    lng: real("lng"),
    accuracyM: real("accuracy_m"),
    gpsStatus: text("gps_status").$type<GpsStatus>().notNull(),
    distanceM: integer("distance_m"),
    lateEntry: boolean("late_entry").notNull().default(false),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
  },
  (t) => [index("outcomes_loan_idx").on(t.loanId), index("outcomes_officer_idx").on(t.officerId)],
);

export const promises = pgTable(
  "promises",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id").notNull().references(() => loans.id),
    officerId: text("officer_id").notNull().references(() => users.id),
    outcomeId: text("outcome_id"),
    promisedDate: date("promised_date").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").$type<PromiseStatus>().notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("promises_loan_idx").on(t.loanId), index("promises_status_idx").on(t.status)],
);

// Every attempt to contact a borrower, including the ones the 8 am to 7 pm rule blocked.
export const contactAttempts = pgTable(
  "contact_attempts",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id").notNull().references(() => loans.id),
    officerId: text("officer_id").notNull().references(() => users.id),
    channel: text("channel").$type<"call" | "visit" | "message">().notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
    allowed: boolean("allowed").notNull(),
    blockReason: text("block_reason"),
    viaSync: boolean("via_sync").notNull().default(false),
  },
  (t) => [index("attempts_officer_idx").on(t.officerId), index("attempts_at_idx").on(t.at)],
);

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    loanId: text("loan_id").notNull().references(() => loans.id),
    promiseId: text("promise_id"),
    recipient: text("recipient").$type<"borrower" | "officer">().notNull(),
    channel: text("channel").$type<"sms" | "whatsapp" | "in_app">().notNull(),
    language: text("language").$type<"hi" | "en">().notNull(),
    templateId: text("template_id").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<"scheduled" | "sent" | "blocked" | "cancelled">().notNull(),
    blockReason: text("block_reason"),
    source: text("source").$type<"ai" | "template" | "system">().notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_loan_idx").on(t.loanId)],
);

// DPDP Act: who looked at or changed which borrower's data, and when.
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
