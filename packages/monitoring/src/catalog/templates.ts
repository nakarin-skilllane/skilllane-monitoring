const PLACEHOLDER = /\{([a-z_@.]+)\}/gi

/**
 * Fills `{field}` placeholders from a flat record. A placeholder whose field
 * is missing is replaced by `?` so the headline stays readable.
 */
export function renderTemplate(
  template: string,
  fields: Record<string, unknown>,
): string {
  return template.replace(PLACEHOLDER, (_, key: string) => {
    const value = fields[key]
    if (value === undefined || value === null || value === '') return '?'
    return Array.isArray(value) ? value.join(', ') : String(value)
  })
}

export function templatePlaceholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1])
}
