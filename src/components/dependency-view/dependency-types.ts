// The metadata information of table in the dependency view
export interface DependencyTableInfo {
  id: string;

  // The UUID of the table stored in the database
  uuid: string;
  database: string;
  name: string;
  engine: string;

  // A formatted table DDL
  tableQuery: string;

  dependenciesDatabase: string[];
  dependenciesTable: string[];

  metadataModificationTime: string;
}
