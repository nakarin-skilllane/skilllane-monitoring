import { basename, dirname, relative, sep } from 'path'

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

/** The frames of a stack with a file, as written (the file not yet shortened). */
function* frames(
  stack: string,
): Generator<{ function?: string; file: string }> {
  for (const line of stack.split('\n').slice(1)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('at ')) continue
    // "at fn (file:line:col)" or "at file:line:col"
    const named = trimmed.match(/^at\s+(.*?)\s+\((.*):\d+:\d+\)$/)
    const bare = named ? undefined : trimmed.match(/^at\s+(.*):\d+:\d+$/)
    const file = named?.[2] ?? bare?.[1]
    if (file) {
      yield { function: named ? functionName(named[1]) : undefined, file }
    }
  }
}

/** The first stack frame in our code: not node_modules, node:, internal, or `skip`. */
export function originOf(
  stack: string | undefined,
  skip?: (file: string) => boolean,
): ErrorOrigin | undefined {
  if (!stack) return undefined
  for (const frame of frames(stack)) {
    if (isLibraryFile(frame.file) || skip?.(frame.file)) continue
    return { function: frame.function, file: sourcePath(frame.file) }
  }
  return undefined
}

/** The SDK's own files (src/ or dist/): never the caller. */
const SDK_DIR = dirname(__dirname) + sep

/** The app code that called the SDK's `log`, and the name its lines go under. */
export interface Caller extends ErrorOrigin {
  /** The class (or function) that called; the file's name when none is named. */
  logger: string
}

/**
 * The app code that called the logger. An arrow callback has no name, so
 * the function is the first named frame of the same file (the method the
 * callback sits in); with none, the line goes under the file's name.
 */
export function callerOf(stack: string | undefined): Caller | undefined {
  if (!stack) return undefined
  // The same call site gives the same stack: parsing costs as much as taking it.
  if (callers.has(stack)) return callers.get(stack)
  if (callers.size >= MAX_CALLERS) callers.clear()
  const caller = parseCaller(stack)
  callers.set(stack, caller)
  return caller
}

const MAX_CALLERS = 1_000
const callers = new Map<string, Caller | undefined>()

function parseCaller(stack: string): Caller | undefined {
  const own = [...frames(stack)].filter(
    // a native frame (`Array.forEach (<anonymous>)`) has no path
    (f) =>
      /[\\/]/.test(f.file) &&
      !isLibraryFile(f.file) &&
      !f.file.startsWith(SDK_DIR),
  )
  if (!own.length) return undefined
  const file = own[0].file
  const fn = own.find((f) => f.file === file && f.function)?.function
  const path = sourcePath(file)
  return {
    function: fn,
    file: path,
    logger: fn?.split('.')[0] ?? basename(path).replace(/\.[cm]?[jt]s$/, ''),
  }
}
