import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { renderReadme } from './readme-template'
import { scanSource } from './scan'
import { renderCatalogFile } from './template'

export const DEFAULT_PATH = 'src/skilllane-monitoring/errors.ts'

export function errorsInit(o: {
  cwd: string
  path?: string
  minRepeat?: number
  out?: (line: string) => void
}): number {
  const out = o.out ?? ((line: string) => console.log(line))
  const rel = o.path ?? DEFAULT_PATH
  const target = resolve(o.cwd, rel)
  const isDefaultPath = rel === DEFAULT_PATH
  mkdirSync(dirname(target), { recursive: true })
  if (existsSync(target)) {
    out(`${rel} already exists; not overwritten`)
  } else {
    const srcDir = join(o.cwd, 'src')
    const scan = existsSync(srcDir)
      ? scanSource(srcDir, o.minRepeat ?? 5)
      : { errorCodes: [], repeatedMessages: [], loggerCodes: [] }
    writeFileSync(target, renderCatalogFile(scan))
    out(
      `created ${rel}: ${scan.errorCodes.length + scan.loggerCodes.length} codes, ${scan.repeatedMessages.length} repeated messages to fill in`,
    )
  }
  const readme = join(dirname(target), 'README.md')
  if (existsSync(readme)) {
    out(`${relative(o.cwd, readme)} already exists; not overwritten`)
  } else {
    writeFileSync(readme, renderReadme({ catalogFile: rel, isDefaultPath }))
    out(`created ${relative(o.cwd, readme)}: how to use, rules and limits`)
  }
  if (!isDefaultPath) {
    out(`add to .env: SKILLLANE_MONITORING_ERRORS_FILE_PATH=${rel}`)
  }
  out('remove everything later with: pnpm skilllane-monitoring uninstall')
  return 0
}
