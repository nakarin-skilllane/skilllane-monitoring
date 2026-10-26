import type { ScanResult } from './scan'

const RULES = `/*
 * Error catalog of this app for skilllane-monitoring. The SDK reads this file at start
 * (no import needed) and looks here before its built-in table.
 *
 * Rules
 *  - key: the app's error code (string or number), or a name for messageMatch entries
 *  - hint: ≤ 30 characters (≤ 40 with dependency), English, constant: it groups errors,
 *          so never put changing values in it. Required: entries without a hint are skipped.
 *  - hintDetail: ≤ 200 characters: likely causes and what to check
 *  - category: bug | input | data | dependency | config   (who has to act)
 *  - level: warn | error   (warn for the caller's mistakes; a 5xx response still logs error)
 *  - messageMatch: RegExp for errors that carry no code
 *  - no personal data anywhere in this file
 *  Breaking a rule never stops the app: a long text is cut with "…", an unknown value is
 *  ignored, and one warning at start lists what was changed. Run
 *  \`pnpm skilllane-monitoring errors check\` to see it before deploying.
 *
 * Removing skilllane-monitoring: \`pnpm skilllane-monitoring uninstall\` (or delete this
 * folder by hand; nothing imports it).
 */
`

function constantName(message: string, used: Set<string>): string {
  const base =
    message
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'MESSAGE'
  let name = /^[0-9]/.test(base) ? `M_${base}` : base
  for (let i = 2; used.has(name); i++) name = `${base}_${i}`
  used.add(name)
  return name
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

export function renderCatalogFile(scan: ScanResult): string {
  const used = new Set<string>([...scan.errorCodes, ...scan.loggerCodes])
  const lines: string[] = []
  for (const code of [...scan.errorCodes, ...scan.loggerCodes]) {
    const key = /^[A-Za-z_][A-Za-z0-9_]*$/.test(code) ? code : `'${code}'`
    lines.push(`      ${key}: { hint: '', hintDetail: '' },`)
  }
  for (const { message, count } of scan.repeatedMessages) {
    const name = constantName(message, used)
    lines.push(
      `      ${name}: { messageMatch: /^${escapeRegExp(message)}$/, hint: '', hintDetail: '' }, // seen ${count} times`,
    )
  }
  return `${RULES}export default {
  errors: {
    // Where the app keeps its code on an error. Unset: the SDK reads err.code and Nest's errorCode.
    // codeOf: (err: any) => err.errorCode,
    catalog: {
${lines.join('\n')}
    },
  },
}
`
}
