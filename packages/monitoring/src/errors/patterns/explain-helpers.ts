import type { ConstraintInfo, SchemaIndex } from '../schema'

/** `"APP"."course_unit"."title"` → ['APP', 'course_unit', 'title']. */
export function quotedPath(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1])
}

/** `Entity.property` when the schema knows the column, else `TABLE.COLUMN`. */
export function columnName(
  schema: SchemaIndex,
  table: string | undefined,
  column: string,
): string {
  return schema.column(table, column) ?? (table ? `${table}.${column}` : column)
}

/** Last quoted table + column in a message, mapped to Entity.property. */
export function quotedColumn(
  schema: SchemaIndex,
  message: string,
): string | undefined {
  const path = quotedPath(message)
  if (!path.length) return undefined
  const column = path[path.length - 1]
  const table = path.length >= 2 ? path[path.length - 2] : undefined
  return columnName(schema, table, column)
}

/** `(APP.UQ_X)` → `UQ_X`. */
export function constraintIn(message: string): string | undefined {
  return message
    .match(/constraint \(([^)]+)\)/)?.[1]
    ?.split('.')
    .pop()
}

export function constraintTarget(
  name: string | undefined,
  info: ConstraintInfo | undefined,
): string | undefined {
  if (!info) return name
  return info.properties.length
    ? `${info.entity}(${info.properties.join(', ')})`
    : info.entity
}

/**
 * Redis keys often embed ids (`exam:123:state`, uuids); keep the key's shape
 * only, so the log carries no personal identifier.
 */
export function keyShape(key: unknown): string | undefined {
  if (typeof key !== 'string' && !Buffer.isBuffer(key)) return undefined
  return String(key)
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '*',
    )
    .replace(/\d{2,}/g, '*')
    .slice(0, 80)
}
