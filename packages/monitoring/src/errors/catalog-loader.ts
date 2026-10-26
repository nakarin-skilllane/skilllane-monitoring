import { existsSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path'
import { getLogger } from '../logger'
import {
  type NormalizedCatalog,
  normalizeCatalog,
  setProjectCatalog,
} from './project-catalog'

export interface CandidateOptions {
  /** SKILLLANE_MONITORING_ERRORS_FILE_PATH: a src/…/x.ts path or a built .js path. */
  configFile?: string
  /** The script that started the app (process.argv[1]). */
  entry?: string
  cwd: string
}

export interface Candidate {
  path: string
  /** As the user wrote it, for the summary line. */
  shown: string
}

export type LoadOutcome =
  | { status: 'not-found'; looked: string[] }
  | { status: 'failed'; path: string; reason: string }
  | {
      status: 'loaded'
      path: string
      shown: string
      catalog: NormalizedCatalog
      duplicates: string[]
    }

/** Nearest folder holding a package.json, from `from` upwards; `fallback` when none. */
function appRoot(from: string, fallback: string): string {
  let dir = from
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return fallback
    dir = parent
  }
}

function unique(list: Candidate[]): Candidate[] {
  const seen = new Set<string>()
  return list.filter((c) => !seen.has(c.path) && seen.add(c.path))
}

export function catalogCandidates(o: CandidateOptions): Candidate[] {
  const entryDir = o.entry ? dirname(resolve(o.cwd, o.entry)) : o.cwd
  const root = appRoot(entryDir, o.cwd)
  if (o.configFile) {
    const shown = o.configFile
    // Relative to the app (its package.json) first, then to the working
    // directory: in a monorepo the app is started from the repo root, but
    // its paths are written from the app.
    const bases = isAbsolute(shown)
      ? [shown]
      : [resolve(root, shown), resolve(o.cwd, shown)]
    if (!shown.endsWith('.ts')) {
      return unique(bases.map((path) => ({ path, shown })))
    }
    const list: Candidate[] = []
    for (const full of bases) {
      const underRoot = relative(root, full)
      if (underRoot.startsWith('..')) continue
      const underSrc = underRoot.startsWith(`src${sep}`)
        ? underRoot.slice(4)
        : underRoot
      const built = underSrc.replace(/\.ts$/, '.js')
      list.push(
        { path: join(root, 'dist', built), shown },
        { path: join(root, 'dist', 'src', built), shown },
      )
    }
    // The .ts itself last: ts-node / tsx load it; elsewhere `failed to load` says why.
    for (const full of bases) list.push({ path: full, shown })
    return unique(list)
  }
  // Beside the entry file; a .ts entry (ts-node src/main.ts) finds the .ts first.
  const exts = o.entry?.endsWith('.ts') ? ['.ts', '.js'] : ['.js', '.ts']
  const list: Candidate[] = []
  for (const ext of exts) {
    for (const path of [
      join(entryDir, 'skilllane-monitoring', `errors${ext}`),
      join(entryDir, 'config', `skilllane-monitoring${ext}`),
    ]) {
      list.push({ path, shown: path })
    }
  }
  return list
}

export function loadProjectCatalog(o: CandidateOptions): LoadOutcome {
  const candidates = catalogCandidates(o)
  const present = candidates.filter((c) => existsSync(c.path))
  if (!present.length) {
    return { status: 'not-found', looked: candidates.map((c) => c.path) }
  }
  const [first, ...rest] = present
  try {
    const raw = require(first.path)
    return {
      status: 'loaded',
      path: first.path,
      shown: first.shown,
      catalog: normalizeCatalog(raw),
      duplicates: o.configFile ? [] : rest.map((c) => c.path),
    }
  } catch (error) {
    return {
      status: 'failed',
      path: first.path,
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

function summary(outcome: Extract<LoadOutcome, { status: 'loaded' }>): string {
  const built =
    outcome.shown !== outcome.path
      ? `${outcome.shown} (${outcome.path})`
      : outcome.path
  return `custom error catalog: ${outcome.catalog.patterns.length} codes from ${built}`
}

/** Loads the app's table once at start and writes what happened. Never throws. */
export function startProjectCatalog(
  options: Partial<CandidateOptions> = {},
): LoadOutcome {
  const o: CandidateOptions = {
    configFile:
      options.configFile ??
      (process.env.SKILLLANE_MONITORING_ERRORS_FILE_PATH?.trim() || undefined),
    entry: options.entry ?? process.argv[1],
    cwd: options.cwd ?? process.cwd(),
  }
  const outcome = loadProjectCatalog(o)
  const log = (level: 'info' | 'warn', message: string, reason?: string) =>
    getLogger().event({
      event: 'app.log',
      level,
      logger: 'skilllane-monitoring',
      message,
      fields: reason ? { reason } : undefined,
    })
  try {
    if (outcome.status === 'not-found') {
      log(
        'info',
        'custom error catalog: not found',
        `looked in ${outcome.looked.join(', ')}`,
      )
    } else if (outcome.status === 'failed') {
      log(
        'warn',
        `custom error catalog: failed to load ${outcome.path}`,
        outcome.reason,
      )
    } else {
      setProjectCatalog(outcome.catalog)
      log('info', summary(outcome))
      const errors = outcome.catalog.issues.filter(
        (i) => i.severity === 'error',
      )
      if (errors.length) {
        log(
          'warn',
          `custom error catalog: ${errors.length} entries adjusted`,
          errors.map((i) => `${i.code}: ${i.message}`).join('; '),
        )
      }
      if (outcome.duplicates.length) {
        log(
          'warn',
          'custom error catalog: more than one file found; the first is used',
          outcome.duplicates.join(', '),
        )
      }
    }
  } catch {
    // reporting must never stop the app
  }
  return outcome
}
