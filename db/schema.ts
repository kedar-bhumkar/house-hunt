import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const houseDecisions = sqliteTable(
  "house_decisions",
  {
    ownerKey: text("owner_key").notNull(),
    houseId: text("house_id").notNull(),
    interest: text("interest").notNull().default("Undecided"),
    action: text("action").notNull().default("None"),
    notes: text("notes").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerKey, table.houseId] })],
);

export const propertyResearch = sqliteTable(
  "property_research",
  {
    ownerKey: text("owner_key").notNull(),
    houseId: text("house_id").notNull(),
    address: text("address").notNull(),
    status: text("status").notNull().default("requested"),
    summary: text("summary").notNull().default(""),
    sourcesChecked: text("sources_checked").notNull().default(""),
    checkedAt: text("checked_at").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerKey, table.houseId] })],
);

export const manualRebuild = sqliteTable("manual_rebuild", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("idle"),
  requestedAt: text("requested_at").notNull().default(""),
  completedAt: text("completed_at").notNull().default(""),
});

export const negotiationSimulations = sqliteTable(
  "negotiation_simulations",
  {
    ownerKey: text("owner_key").notNull(),
    id: text("id").notNull(),
    houseId: text("house_id").notNull(),
    status: text("status").notNull().default("running"),
    stateJson: text("state_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerKey, table.id] }),
    index("idx_negotiation_simulations_owner_house_created").on(
      table.ownerKey,
      table.houseId,
      table.createdAt,
    ),
  ],
);
