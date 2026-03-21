import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  decimal,
} from "drizzle-orm/pg-core";
import { createSchemaFactory } from "drizzle-zod";
import { z } from "zod";

// 系统表（必须保留）
export const healthCheck = pgTable("health_check", {
  id: integer("id").primaryKey(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
});

// 用户资料表
export const profiles = pgTable(
  "profiles",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 255 }).notNull().unique(), // Supabase Auth User ID
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default('guest'), // admin, volunteer, guest
    avatar: text("avatar"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("profiles_user_id_idx").on(table.userId),
    index("profiles_email_idx").on(table.email),
    index("profiles_role_idx").on(table.role),
  ]
);

// 文件分类表
export const categories = pgTable(
  "categories",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull().unique(),
    description: text("description"),
    icon: varchar("icon", { length: 50 }),
    color: varchar("color", { length: 20 }),
    parentId: varchar("parent_id", { length: 36 }),
    order: integer("order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("categories_slug_idx").on(table.slug),
    index("categories_parent_id_idx").on(table.parentId),
  ]
);

// 文件表
export const files = pgTable(
  "files",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileKey: text("file_key").notNull(), // S3 key
    fileSize: integer("file_size").notNull(),
    fileType: varchar("file_type", { length: 100 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    categoryId: varchar("category_id", { length: 36 }).notNull(),
    uploaderId: varchar("uploader_id", { length: 255 }).notNull(),
    downloadCount: integer("download_count").default(0).notNull(),
    averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default('0.00').notNull(),
    ratingCount: integer("rating_count").default(0).notNull(),
    tags: jsonb("tags").default([]).notNull(),
    semester: varchar("semester", { length: 20 }), // 例如: 2024-Fall
    course: varchar("course", { length: 100 }),
    isFeatured: boolean("is_featured").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("files_category_id_idx").on(table.categoryId),
    index("files_uploader_id_idx").on(table.uploaderId),
    index("files_is_active_idx").on(table.isActive),
    index("files_is_featured_idx").on(table.isFeatured),
    index("files_download_count_idx").on(table.downloadCount),
    index("files_average_rating_idx").on(table.averageRating),
    index("files_semester_idx").on(table.semester),
    index("files_course_idx").on(table.course),
    index("files_created_at_idx").on(table.createdAt),
  ]
);

// 评分表
export const ratings = pgTable(
  "ratings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fileId: varchar("file_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    score: integer("score").notNull(), // 1-5
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("ratings_file_id_idx").on(table.fileId),
    index("ratings_user_id_idx").on(table.userId),
  ]
);

// 评论表
export const comments = pgTable(
  "comments",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    fileId: varchar("file_id", { length: 36 }).notNull(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    content: text("content").notNull(),
    parentId: varchar("parent_id", { length: 36 }), // 回复评论
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
  },
  (table) => [
    index("comments_file_id_idx").on(table.fileId),
    index("comments_file_id_is_active_idx").on(table.fileId, table.isActive),
    index("comments_user_id_idx").on(table.userId),
    index("comments_parent_id_idx").on(table.parentId),
  ]
);

// 使用 createSchemaFactory 配置 date coercion
const { createInsertSchema: createCoercedInsertSchema } = createSchemaFactory({
  coerce: { date: true },
});

// Zod schemas for validation
export const insertProfileSchema = createCoercedInsertSchema(profiles).pick({
  userId: true,
  email: true,
  name: true,
  role: true,
  avatar: true,
});

export const updateProfileSchema = createCoercedInsertSchema(profiles)
  .pick({
    name: true,
    avatar: true,
    role: true,
  })
  .partial();

export const insertCategorySchema = createCoercedInsertSchema(categories).pick({
  name: true,
  slug: true,
  description: true,
  icon: true,
  color: true,
  parentId: true,
  order: true,
});

export const updateCategorySchema = createCoercedInsertSchema(categories)
  .pick({
    name: true,
    description: true,
    icon: true,
    color: true,
    parentId: true,
    order: true,
    isActive: true,
  })
  .partial();

export const insertFileSchema = createCoercedInsertSchema(files).pick({
  title: true,
  description: true,
  fileName: true,
  fileKey: true,
  fileSize: true,
  fileType: true,
  mimeType: true,
  categoryId: true,
  uploaderId: true,
  tags: true,
  semester: true,
  course: true,
});

export const updateFileSchema = createCoercedInsertSchema(files)
  .pick({
    title: true,
    description: true,
    categoryId: true,
    tags: true,
    semester: true,
    course: true,
    isFeatured: true,
    isActive: true,
  })
  .partial();

export const insertRatingSchema = createCoercedInsertSchema(ratings).pick({
  fileId: true,
  userId: true,
  score: true,
});

export const insertCommentSchema = createCoercedInsertSchema(comments).pick({
  fileId: true,
  userId: true,
  content: true,
  parentId: true,
});

// TypeScript types
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;

export type File = typeof files.$inferSelect;
export type InsertFile = z.infer<typeof insertFileSchema>;
export type UpdateFile = z.infer<typeof updateFileSchema>;

export type Rating = typeof ratings.$inferSelect;
export type InsertRating = z.infer<typeof insertRatingSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
