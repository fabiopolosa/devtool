export interface SchemaDocColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: string;
}

export interface SchemaDocTable {
  tableName: string;
  schemaName: string;
  columns: SchemaDocColumn[];
  primaryKeyColumns: string[];
}

export interface SchemaDocConvention {
  key: string;
  value: string;
}

export interface SchemaDoc {
  id: string;
  title: string;
  description: string;
  databaseName: string;
  dialect: string;
  tables: SchemaDocTable[];
  conventions: SchemaDocConvention[];
  stackNotes: string[];
  lastIntrospectedAt: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}
