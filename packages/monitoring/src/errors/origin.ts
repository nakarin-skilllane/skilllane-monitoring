import { relative, sep } from 'path'

/** ECS `log.origin.*`: the function and file of our code that failed. */
export interface ErrorOrigin {
  /** `Class.method` as V8 names it, e.g. `GetMyQuestionsHandler.execute`. */
  function?: string
  /** Source path from the service root, e.g. `src/domain/x/x.handler.ts`. */
  file?: string
}

function isLibraryFile(file: string): boolean {
  return (
    file.includes(`${sep}node_modules${sep}`) ||
    file.includes('/node_modules/') ||
    file.startsWith('node:') ||
    file.startsWith('internal/')
  )
}

/**
 * Compiled output keeps the source tree (`dist/src/a/b.js` ↔ `src/a/b.ts`),
 * so the source path is known without source maps or line numbers.
 */
export function sourcePath(file: string, cwd = process.cwd()): string {
  const path = (file.startsWith(sep) ? relative(cwd, file) : file)
    .split(sep)
    .join('/')
  const compiled = path.match(/^(?:.*\/)?dist\/(src\/.*)\.js$/)
  return compiled ? `${compiled[1]}.ts` : path
}

function functionName(name: string): string | undefined {
  const cleaned = name
    .replace(/^async\s+/, '')
    .replace(/^new\s+(.+)$/, '$1.constructor')
    .replace(/\s*\[as [^\]]+\]$/, '')
    .trim()
  if (!cleaned || cleaned.includes('<anonymous>')) return undefined
  // `Object.<anonymous>` / `Object.execute`: a module-level function.
  return cleaned.replace(/^Object\./, '')
}

/** The first stack frame in our code: not node_modules, node: or internal. */
export function originOf(stack: string | undefined): ErrorOrigin | undefined {
  if (!stack) return undefined
  for (const line of stack.split('\n').slice(1)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('at ')) continue
    // "at fn (file:line:col)" or "at file:line:col"
    const named = trimmed.match(/^at\s+(.*?)\s+\((.*):\d+:\d+\)$/)
    const bare = named ? undefined : trimmed.match(/^at\s+(.*):\d+:\d+$/)
    const file = named?.[2] ?? bare?.[1]
    if (!file || isLibraryFile(file)) continue
    return {
      function: named ? functionName(named[1]) : undefined,
      file: sourcePath(file),
    }
  }
  return undefined
}
