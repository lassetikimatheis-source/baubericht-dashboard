CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid,
	"local_analysis_id" text,
	"status" text,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"project_id" uuid,
	"document_id" uuid,
	"local_assignment_id" text,
	"local_object_id" text,
	"local_project_id" text,
	"local_document_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"project_id" uuid,
	"document_id" uuid,
	"measure_id" uuid,
	"trade_id" uuid,
	"local_cost_item_id" text,
	"local_object_id" text,
	"local_project_id" text,
	"local_document_id" text,
	"position" text,
	"description" text,
	"quantity" numeric(14, 3),
	"unit" text,
	"unit_price" numeric(14, 2),
	"total_price" numeric(14, 2),
	"allocation" text,
	"source" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"trade_id" uuid NOT NULL,
	"recognized" boolean DEFAULT false NOT NULL,
	"amount" numeric(14, 2),
	"confidence" numeric(5, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"project_id" uuid,
	"local_document_id" text,
	"source_document_id" text,
	"local_object_id" text,
	"local_project_id" text,
	"file_name" text,
	"file_type" text,
	"document_type" text,
	"document_number" text,
	"provider" text,
	"document_date" date,
	"offer_date" date,
	"invoice_date" date,
	"final_invoice_date" date,
	"installment_number" text,
	"project_suggestion" text,
	"assignment_suggestion" text,
	"ai_agent_name" text,
	"confidence_score" numeric(5, 2),
	"net_cost" numeric(14, 2),
	"vat_cost" numeric(14, 2),
	"total_cost" numeric(14, 2),
	"cost_per_apartment" numeric(14, 2),
	"cost_per_sqm" numeric(14, 2),
	"data_quality" text,
	"extracted_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_debug" jsonb,
	"measure_debug" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entrances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"local_entrance_id" text,
	"local_object_id" text,
	"street" text,
	"house_number" text,
	"suffix" text,
	"postal_code" text,
	"city" text,
	"living_area_sqm" numeric(12, 2),
	"unit_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"project_id" uuid,
	"document_id" uuid,
	"trade_id" uuid,
	"local_measure_id" text,
	"local_object_id" text,
	"local_project_id" text,
	"local_document_id" text,
	"cluster" text,
	"description" text,
	"section" text,
	"allocation" text,
	"total_cost" numeric(14, 2),
	"source" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "object_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"local_image_id" text,
	"local_object_id" text,
	"url" text NOT NULL,
	"image_url" text,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"local_object_id" text,
	"source_object_id" text,
	"fund" text,
	"object_number" text,
	"object_name" text,
	"address" text,
	"postal_code" text,
	"city" text,
	"federal_state" text,
	"construction_year" text,
	"unit_count" integer,
	"total_living_area_sqm" numeric(12, 2),
	"renovated_living_area_sqm" numeric(12, 2),
	"energy_class" text,
	"asset_manager" text,
	"portfolio_manager" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"entrance_id" uuid,
	"local_project_id" text,
	"source_project_id" text,
	"local_object_id" text,
	"local_entrance_id" text,
	"project_name" text,
	"project_type" text,
	"fund" text,
	"object_label" text,
	"entrance_label" text,
	"status" text,
	"budget_net" numeric(14, 2),
	"budget_gross" numeric(14, 2),
	"start_date" date,
	"end_date" date,
	"description" text,
	"apartment_number" text,
	"location" text,
	"renovated_apartment_count" integer,
	"living_area_sqm" numeric(12, 2),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_id" uuid,
	"project_id" uuid,
	"local_report_id" text,
	"report_type" text,
	"title" text,
	"status" text,
	"generated_at" timestamp with time zone,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_main_trade" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_measure_id_measures_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_trades" ADD CONSTRAINT "document_trades_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_trades" ADD CONSTRAINT "document_trades_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrances" ADD CONSTRAINT "entrances_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "object_images" ADD CONSTRAINT "object_images_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_entrance_id_entrances_id_fk" FOREIGN KEY ("entrance_id") REFERENCES "public"."entrances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_object_id_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."objects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analyses_local_analysis_id_idx" ON "analyses" USING btree ("local_analysis_id");--> statement-breakpoint
CREATE INDEX "analyses_document_id_idx" ON "analyses" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_local_assignment_id_idx" ON "assignments" USING btree ("local_assignment_id");--> statement-breakpoint
CREATE INDEX "assignments_document_id_idx" ON "assignments" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "assignments_project_id_idx" ON "assignments" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_items_local_cost_item_id_idx" ON "cost_items" USING btree ("local_cost_item_id");--> statement-breakpoint
CREATE INDEX "cost_items_document_id_idx" ON "cost_items" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "cost_items_measure_id_idx" ON "cost_items" USING btree ("measure_id");--> statement-breakpoint
CREATE INDEX "cost_items_trade_id_idx" ON "cost_items" USING btree ("trade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_trades_document_trade_idx" ON "document_trades" USING btree ("document_id","trade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_local_document_id_idx" ON "documents" USING btree ("local_document_id");--> statement-breakpoint
CREATE INDEX "documents_object_id_idx" ON "documents" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "documents_project_id_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_document_type_idx" ON "documents" USING btree ("document_type");--> statement-breakpoint
CREATE UNIQUE INDEX "entrances_local_entrance_id_idx" ON "entrances" USING btree ("local_entrance_id");--> statement-breakpoint
CREATE INDEX "entrances_object_id_idx" ON "entrances" USING btree ("object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "measures_local_measure_id_idx" ON "measures" USING btree ("local_measure_id");--> statement-breakpoint
CREATE INDEX "measures_object_id_idx" ON "measures" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "measures_document_id_idx" ON "measures" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "measures_trade_id_idx" ON "measures" USING btree ("trade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "object_images_local_image_id_idx" ON "object_images" USING btree ("local_image_id");--> statement-breakpoint
CREATE INDEX "object_images_object_id_idx" ON "object_images" USING btree ("object_id");--> statement-breakpoint
CREATE UNIQUE INDEX "objects_local_object_id_idx" ON "objects" USING btree ("local_object_id");--> statement-breakpoint
CREATE INDEX "objects_object_number_idx" ON "objects" USING btree ("object_number");--> statement-breakpoint
CREATE INDEX "objects_address_idx" ON "objects" USING btree ("address");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_local_project_id_idx" ON "projects" USING btree ("local_project_id");--> statement-breakpoint
CREATE INDEX "projects_object_id_idx" ON "projects" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "projects_entrance_id_idx" ON "projects" USING btree ("entrance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_local_report_id_idx" ON "reports" USING btree ("local_report_id");--> statement-breakpoint
CREATE INDEX "reports_object_id_idx" ON "reports" USING btree ("object_id");--> statement-breakpoint
CREATE INDEX "reports_project_id_idx" ON "reports" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_name_idx" ON "trades" USING btree ("name");--> statement-breakpoint
INSERT INTO "trades" ("name", "normalized_name", "sort_order", "is_main_trade")
VALUES
  ('Malerarbeiten', 'malerarbeiten', 10, true),
  ('Bodenbeläge', 'bodenbelaege', 20, true),
  ('Sanitär', 'sanitaer', 30, true),
  ('Elektro', 'elektro', 40, true),
  ('Heizung', 'heizung', 50, true),
  ('Fenster', 'fenster', 60, true),
  ('Dach', 'dach', 70, true),
  ('Fassade', 'fassade', 80, true),
  ('Sonstiges', 'sonstiges', 90, true)
ON CONFLICT ("name") DO UPDATE SET
  "normalized_name" = excluded."normalized_name",
  "sort_order" = excluded."sort_order",
  "is_main_trade" = excluded."is_main_trade",
  "updated_at" = now();
