import { bigint, boolean, index, pgTable, text } from "drizzle-orm/pg-core";

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    senderName: text("sender_name").notNull(),
    senderId: text("sender_id").notNull(),
    content: text("content").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_messages_room_cursor").on(
      table.roomId,
      table.createdAt,
      table.id,
    ),
  ],
);
