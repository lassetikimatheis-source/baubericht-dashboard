import { relations } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

export const objects = pgTable("objects", {
  id: uuid("id").defaultRandom().primaryKey(),
  localObjectId: text("local_object_id"),
  sourceObjectId: text("source_object_id"),
  fund: text("fund"),
  objectNumber: text("object_number"),
  objectName: text("object_name"),
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  federalState: text("federal_state"),
  constructionYear: text("construction_year"),
  unitCount: integer("unit_count"),
  totalLivingAreaSqm: numeric("total_living_area_sqm", { precision: 12, scale: 2 }),
  renovatedLivingAreaSqm: numeric("renovated_living_area_sqm", { precision: 12, scale: 2 }),
  energyClass: text("energy_class"),
  assetManager: text("asset_manager"),
  portfolioManager: text("portfolio_manager"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localObjectIdIdx: uniqueIndex("objects_local_object_id_idx").on(table.localObjectId),
  objectNumberIdx: index("objects_object_number_idx").on(table.objectNumber),
  addressIdx: index("objects_address_idx").on(table.address)
}));

export const entrances = pgTable("entrances", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "cascade" }),
  localEntranceId: text("local_entrance_id"),
  localObjectId: text("local_object_id"),
  street: text("street"),
  houseNumber: text("house_number"),
  suffix: text("suffix"),
  postalCode: text("postal_code"),
  city: text("city"),
  livingAreaSqm: numeric("living_area_sqm", { precision: 12, scale: 2 }),
  unitCount: integer("unit_count"),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localEntranceIdIdx: uniqueIndex("entrances_local_entrance_id_idx").on(table.localEntranceId),
  objectIdIdx: index("entrances_object_id_idx").on(table.objectId)
}));

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "set null" }),
  entranceId: uuid("entrance_id").references(() => entrances.id, { onDelete: "set null" }),
  localProjectId: text("local_project_id"),
  sourceProjectId: text("source_project_id"),
  localObjectId: text("local_object_id"),
  localEntranceId: text("local_entrance_id"),
  projectName: text("project_name"),
  projectType: text("project_type"),
  fund: text("fund"),
  objectLabel: text("object_label"),
  entranceLabel: text("entrance_label"),
  status: text("status"),
  budgetNet: numeric("budget_net", { precision: 14, scale: 2 }),
  budgetGross: numeric("budget_gross", { precision: 14, scale: 2 }),
  startDate: date("start_date"),
  endDate: date("end_date"),
  description: text("description"),
  apartmentNumber: text("apartment_number"),
  location: text("location"),
  renovatedApartmentCount: integer("renovated_apartment_count"),
  livingAreaSqm: numeric("living_area_sqm", { precision: 12, scale: 2 }),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localProjectIdIdx: uniqueIndex("projects_local_project_id_idx").on(table.localProjectId),
  objectIdIdx: index("projects_object_id_idx").on(table.objectId),
  entranceIdIdx: index("projects_entrance_id_idx").on(table.entranceId)
}));

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  localDocumentId: text("local_document_id"),
  sourceDocumentId: text("source_document_id"),
  localObjectId: text("local_object_id"),
  localProjectId: text("local_project_id"),
  fileName: text("file_name"),
  fileType: text("file_type"),
  documentType: text("document_type"),
  documentNumber: text("document_number"),
  provider: text("provider"),
  documentDate: date("document_date"),
  offerDate: date("offer_date"),
  invoiceDate: date("invoice_date"),
  finalInvoiceDate: date("final_invoice_date"),
  installmentNumber: text("installment_number"),
  projectSuggestion: text("project_suggestion"),
  assignmentSuggestion: text("assignment_suggestion"),
  aiAgentName: text("ai_agent_name"),
  confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }),
  netCost: numeric("net_cost", { precision: 14, scale: 2 }),
  vatCost: numeric("vat_cost", { precision: 14, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 }),
  costPerApartment: numeric("cost_per_apartment", { precision: 14, scale: 2 }),
  costPerSqm: numeric("cost_per_sqm", { precision: 14, scale: 2 }),
  dataQuality: text("data_quality"),
  extractedData: jsonb("extracted_data").default({}).notNull(),
  costDebug: jsonb("cost_debug"),
  measureDebug: jsonb("measure_debug"),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localDocumentIdIdx: uniqueIndex("documents_local_document_id_idx").on(table.localDocumentId),
  objectIdIdx: index("documents_object_id_idx").on(table.objectId),
  projectIdIdx: index("documents_project_id_idx").on(table.projectId),
  documentTypeIdx: index("documents_document_type_idx").on(table.documentType)
}));

export const trades = pgTable("trades", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isMainTrade: boolean("is_main_trade").default(false).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  nameIdx: uniqueIndex("trades_name_idx").on(table.name)
}));

export const measures = pgTable("measures", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
  localMeasureId: text("local_measure_id"),
  localObjectId: text("local_object_id"),
  localProjectId: text("local_project_id"),
  localDocumentId: text("local_document_id"),
  cluster: text("cluster"),
  description: text("description"),
  section: text("section"),
  allocation: text("allocation"),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 }),
  source: text("source"),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localMeasureIdIdx: uniqueIndex("measures_local_measure_id_idx").on(table.localMeasureId),
  objectIdIdx: index("measures_object_id_idx").on(table.objectId),
  documentIdIdx: index("measures_document_id_idx").on(table.documentId),
  tradeIdIdx: index("measures_trade_id_idx").on(table.tradeId)
}));

export const costItems = pgTable("cost_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  measureId: uuid("measure_id").references(() => measures.id, { onDelete: "set null" }),
  tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "set null" }),
  localCostItemId: text("local_cost_item_id"),
  localObjectId: text("local_object_id"),
  localProjectId: text("local_project_id"),
  localDocumentId: text("local_document_id"),
  position: text("position"),
  description: text("description"),
  quantity: numeric("quantity", { precision: 14, scale: 3 }),
  unit: text("unit"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
  totalPrice: numeric("total_price", { precision: 14, scale: 2 }),
  allocation: text("allocation"),
  source: jsonb("source"),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localCostItemIdIdx: uniqueIndex("cost_items_local_cost_item_id_idx").on(table.localCostItemId),
  documentIdIdx: index("cost_items_document_id_idx").on(table.documentId),
  measureIdIdx: index("cost_items_measure_id_idx").on(table.measureId),
  tradeIdIdx: index("cost_items_trade_id_idx").on(table.tradeId)
}));

export const documentTrades = pgTable("document_trades", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }).notNull(),
  tradeId: uuid("trade_id").references(() => trades.id, { onDelete: "cascade" }).notNull(),
  recognized: boolean("recognized").default(false).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  documentTradeIdx: uniqueIndex("document_trades_document_trade_idx").on(table.documentId, table.tradeId)
}));

export const assignments = pgTable("assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  localAssignmentId: text("local_assignment_id"),
  localObjectId: text("local_object_id"),
  localProjectId: text("local_project_id"),
  localDocumentId: text("local_document_id"),
  data: jsonb("data").default({}).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localAssignmentIdIdx: uniqueIndex("assignments_local_assignment_id_idx").on(table.localAssignmentId),
  documentIdIdx: index("assignments_document_id_idx").on(table.documentId),
  projectIdIdx: index("assignments_project_id_idx").on(table.projectId)
}));

export const objectImages = pgTable("object_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "cascade" }),
  localImageId: text("local_image_id"),
  localObjectId: text("local_object_id"),
  url: text("url").notNull(),
  imageUrl: text("image_url"),
  caption: text("caption"),
  sortOrder: integer("sort_order").default(0).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localImageIdIdx: uniqueIndex("object_images_local_image_id_idx").on(table.localImageId),
  objectIdIdx: index("object_images_object_id_idx").on(table.objectId)
}));

export const analyses = pgTable("analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  localAnalysisId: text("local_analysis_id"),
  status: text("status"),
  result: jsonb("result").default({}).notNull(),
  issues: jsonb("issues").default([]).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localAnalysisIdIdx: uniqueIndex("analyses_local_analysis_id_idx").on(table.localAnalysisId),
  documentIdIdx: index("analyses_document_id_idx").on(table.documentId)
}));

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  objectId: uuid("object_id").references(() => objects.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  localReportId: text("local_report_id"),
  reportType: text("report_type"),
  title: text("title"),
  status: text("status"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  payload: jsonb("payload").default({}).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  ...timestamps
}, (table) => ({
  localReportIdIdx: uniqueIndex("reports_local_report_id_idx").on(table.localReportId),
  objectIdIdx: index("reports_object_id_idx").on(table.objectId),
  projectIdIdx: index("reports_project_id_idx").on(table.projectId)
}));

export const objectRelations = relations(objects, ({ many }) => ({
  entrances: many(entrances),
  projects: many(projects),
  documents: many(documents),
  measures: many(measures),
  costItems: many(costItems),
  images: many(objectImages),
  reports: many(reports)
}));
