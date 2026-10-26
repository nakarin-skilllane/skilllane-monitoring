import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

export interface ScanResult {
  errorCodes: string[]
  repeatedMessages: { message: string; count: number }[]
  loggerCodes: string[]
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage'])
const ERROR_CODE = /errorCode\s*[:=]\s*['"`]([A-Za-z0-9_.-]+)['"`]/g
const THROW_MESSAGE =
  /throw new [A-Za-z]+Exception\(\s*(['"])((?:(?!\1)[^\\\n]){4,120})\1/g
const LOGGER_CODE =
  /\.(?:error|warn|log|fatal)\([^;]*?\bcode:\s*['"]([A-Za-z0-9_.-]+)['"]/g

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) files.push(...sourceFiles(full))
    } else if (
      /\.(ts|js)$/.test(name) &&
      !/\.(spec|test)\.(ts|js)$/.test(name) &&
      !name.endsWith('.d.ts')
    ) {
      files.push(full)
    }
  }
  return files
}

/** Codes and messages an app already uses, read from its source text. */
export function scanSource(srcDir: string, minRepeat: number): ScanResult {
  const codes = new Set<string>()
  const loggerCodes = new Set<string>()
  const messages = new Map<string, number>()
  for (const file of sourceFiles(srcDir)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(ERROR_CODE)) codes.add(m[1])
    for (const m of text.matchAll(LOGGER_CODE)) loggerCodes.add(m[1])
    for (const m of text.matchAll(THROW_MESSAGE)) {
      messages.set(m[2], (messages.get(m[2]) ?? 0) + 1)
    }
  }
  return {
    errorCodes: [...codes].sort(),
    repeatedMessages: [...messages]
      .filter(([, count]) => count >= minRepeat)
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message)),
    loggerCodes: [...loggerCodes].filter((c) => !codes.has(c)).sort(),
  }
}
