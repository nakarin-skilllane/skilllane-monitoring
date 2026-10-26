import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join, relative, resolve } from 'path'
import { Script, createContext } from 'vm'
import { normalizeCatalog } from '../errors/project-catalog'
import { DEFAULT_PATH } from './errors-init'
import { scanSource } from './scan'

/** Evaluates the catalog file; .ts goes through the project's own typescript. */
export function loadCatalogSource(file: string, projectRoot: string): unknown {
  if (!file.endsWith('.ts')) {
    return require(file)
  }
  const projectRequire = createRequire(join(projectRoot, 'package.json'))
  const ts = projectRequire('typescript') as typeof import('typescript')
  const js = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText
  const module = { exports: {} as unknown }
  const context = createContext({
    module,
    exports: module.exports,
    require: createRequire(file),
    __filename: file,
    __dirname: dirname(file),
  })
  new Script(js, { filename: file }).runInContext(context)
  return module.exports
}

export function errorsCheck(o: {
  cwd: string
  path?: string
  out?: (line: string) => void
}): number {
  const out = o.out ?? ((line: string) => console.log(line))
  const rel =
    o.path ??
    process.env.SKILLLANE_MONITORING_ERRORS_FILE_PATH?.trim() ??
    DEFAULT_PATH
  const file = resolve(o.cwd, rel)
  if (!existsSync(file)) {
    out(`error ${rel}: not found (run: pnpm skilllane-monitoring errors init)`)
    return 1
  }
  let raw: unknown
  try {
    raw = loadCatalogSource(file, o.cwd)
  } catch (error) {
    out(
      `error ${rel}: cannot load: ${error instanceof Error ? error.message : String(error)}`,
    )
    return 1
  }
  const catalog = normalizeCatalog(raw)
  for (const issue of catalog.issues) {
    out(`${issue.severity} ${issue.code}: ${issue.message}`)
  }
  const known = new Set(catalog.patterns.map((p) => p.key))
  const srcDir = join(o.cwd, 'src')
  if (existsSync(srcDir)) {
    const scan = scanSource(srcDir, Number.POSITIVE_INFINITY)
    for (const code of [...scan.errorCodes, ...scan.loggerCodes]) {
      if (!known.has(code)) {
        out(`warning ${code}: used in src/ but not in the catalog`)
      }
    }
  }
  const errors = catalog.issues.filter((i) => i.severity === 'error').length
  out(
    `${relative(o.cwd, file)}: ${catalog.patterns.length} codes, ${errors} errors`,
  )
  return errors ? 1 : 0
}
