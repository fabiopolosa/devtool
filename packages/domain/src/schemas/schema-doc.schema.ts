import { z } from "zod";
import { idSchema } from "./common.schema.js";

export const schemaDocColumnSchema = z.object({
  name: z.string().min(1),
  dataType: z.string().min(1),
  nullable: z.boolean(),
  defaultValue: z.string().optional()
});

export const schemaDocTableSchema = z.object({
  tableName: z.string().min(1),
  schemaName: z.string().min(1),
  columns: z.array(schemaDocColumnSchema).default([]),
  primaryKeyColumns: z.array(z.string().min(1)).default([])
});

export const schemaDocConventionSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1)
});

export const schemaDocSchema = z.object({
  id: idSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  databaseName: z.string().min(1),
  dialect: z.string().min(1),
  tables: z.array(schemaDocTableSchema).default([]),
  conventions: z.array(schemaDocConventionSchema).default([]),
  stackNotes: z.array(z.string().min(1)).default([]),
  lastIntrospectedAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
  updatedBy: z.string().min(1)
});

export type SchemaDocSchema = z.infer<typeof schemaDocSchema>;
