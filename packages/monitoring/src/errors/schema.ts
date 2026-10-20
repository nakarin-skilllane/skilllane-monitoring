/**
 * Translates database names in error messages (table, column, constraint)
 * back to `Entity.property`. Most foreign keys are TypeORM hash names
 * (`FK_9aac0395…`), useless in a log line until mapped.
 *
 * Built from TypeORM's `DataSource.entityMetadatas`, read structurally: this
 * library does not depend on typeorm.
 */

export interface ConstraintInfo {
  kind: 'unique' | 'index' | 'foreign-key'
  entity: string
  properties: string[]
  /** Foreign key: the entity it points to. */
  referenced?: string
}

export interface SchemaIndex {
  /** `Entity.property` for a table + column, e.g. ("question_bank", "title"). */
  column(table: string | undefined, column: string): string | undefined
  /** Entities that have a column with this database name. */
  columnOwners(column: string): string[]
  constraint(name: string): ConstraintInfo | undefined
  /** Entities that have a relation property with this name. */
  relationOwners(property: string): string[]
}

/** Upper case, without quotes and schema prefix: `"APP"."FK_X"` → `FK_X`. */
export function dbName(name: string): string {
  const parts = name.replace(/"/g, '').split('.')
  return parts[parts.length - 1].trim().toUpperCase()
}

const EMPTY: SchemaIndex = {
  column: () => undefined,
  columnOwners: () => [],
  constraint: () => undefined,
  relationOwners: () => [],
}

let current: SchemaIndex = EMPTY

export function getSchema(): SchemaIndex {
  return current
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key)
  if (!list) map.set(key, [value])
  else if (!list.includes(value)) list.push(value)
}

const propertiesOf = (columns: any[] | undefined): string[] =>
  (columns ?? []).map((column) => column?.propertyPath).filter(Boolean)

/** Call once after the DataSource is initialized (LoggingModule `schema`). */
export function registerTypeormSchema(dataSource: {
  entityMetadatas?: any[]
}): void {
  const columns = new Map<string, string>()
  const owners = new Map<string, string[]>()
  const constraints = new Map<string, ConstraintInfo>()
  const relations = new Map<string, string[]>()

  for (const meta of dataSource?.entityMetadatas ?? []) {
    const entity: string = meta?.name
    const table: string = meta?.tableName
    if (!entity || !table) continue
    for (const column of meta.columns ?? []) {
      if (!column?.databaseName || !column?.propertyPath) continue
      const key = `${dbName(table)}.${dbName(column.databaseName)}`
      columns.set(key, `${entity}.${column.propertyPath}`)
      push(owners, dbName(column.databaseName), entity)
    }
    for (const unique of meta.uniques ?? []) {
      if (!unique?.name) continue
      constraints.set(dbName(unique.name), {
        kind: 'unique',
        entity,
        properties: propertiesOf(unique.columns),
      })
    }
    for (const index of meta.indices ?? []) {
      if (!index?.name) continue
      constraints.set(dbName(index.name), {
        kind: index.isUnique ? 'unique' : 'index',
        entity,
        properties: propertiesOf(index.columns),
      })
    }
    for (const fk of meta.foreignKeys ?? []) {
      if (!fk?.name) continue
      constraints.set(dbName(fk.name), {
        kind: 'foreign-key',
        entity,
        properties: propertiesOf(fk.columns),
        referenced: fk.referencedEntityMetadata?.name,
      })
    }
    for (const relation of meta.relations ?? []) {
      if (relation?.propertyName) push(relations, relation.propertyName, entity)
    }
  }

  current = {
    column: (table, column) =>
      table ? columns.get(`${dbName(table)}.${dbName(column)}`) : undefined,
    columnOwners: (column) => owners.get(dbName(column)) ?? [],
    constraint: (name) => constraints.get(dbName(name)),
    relationOwners: (property) => relations.get(property) ?? [],
  }
}

/** For tests. */
export function resetSchema(): void {
  current = EMPTY
}
