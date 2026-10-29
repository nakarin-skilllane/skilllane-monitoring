import { spawnSync } from 'child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { createInterface } from 'readline'
import { DEFAULT_PATH } from './errors-init'
import { README_MARKER } from './readme-template'

export interface Ref {
  file: string
  line: number
  text: string
}

export interface UninstallPlan {
  deleteFiles: string[]
  deleteDirs: string[]
  /** Bare register imports, removed. */
  lineEdits: Ref[]
  /** Other uses of the SDK: the build breaks without the package. */
  blockers: Ref[]
  /** Mentions outside src/ (NODE_OPTIONS, scripts): reported, never edited. */
  outside: Ref[]
  removeCommand: string[]
}

const PACKAGE = 'skilllane-monitoring'
const BARE_REGISTER =
  /^\s*(?:import\s+['"]skilllane-monitoring\/register['"]|require\(\s*['"]skilllane-monitoring\/register['"]\s*\))\s*;?\s*$/
/** An import or require of the package (not a comment or a string that merely names it). */
const ANY_USE =
  /(?:\bfrom\s+|\bimport\s+|\brequire\(\s*)['"]skilllane-monitoring(?:\/[\w-]+)?['"]/
/** A use of the generated constants: they go away with the catalog file. */
const CODE_USE = /\bAppErrorCode\b/
const OUTSIDE_FILE =
  /^(Dockerfile.*|package\.json|\.env.*|docker-compose.*\.ya?ml|.*\.sh)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage'])

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) files.push(...sourceFiles(full))
    } else if (/\.(ts|js|mjs|cjs)$/.test(name)) {
      files.push(full)
    }
  }
  return files.sort()
}

function removeCommandFor(cwd: string): string[] {
  let dir = cwd
  for (;;) {
    if (existsSync(join(dir, 'pnpm-lock.yaml')))
      return ['pnpm', 'remove', PACKAGE]
    if (existsSync(join(dir, 'yarn.lock'))) return ['yarn', 'remove', PACKAGE]
    if (existsSync(join(dir, 'package-lock.json')))
      return ['npm', 'uninstall', PACKAGE]
    const parent = dirname(dir)
    if (parent === dir) return ['npm', 'uninstall', PACKAGE]
    dir = parent
  }
}

export function planUninstall(o: {
  cwd: string
  path?: string
}): UninstallPlan {
  const rel =
    o.path ??
    (process.env.SKILLLANE_MONITORING_ERRORS_FILE_PATH?.trim() || DEFAULT_PATH)
  const catalog = resolve(o.cwd, rel)
  const plan: UninstallPlan = {
    deleteFiles: [],
    deleteDirs: [],
    lineEdits: [],
    blockers: [],
    outside: [],
    removeCommand: removeCommandFor(o.cwd),
  }
  if (existsSync(catalog)) {
    const folder = dirname(catalog)
    const readme = join(folder, 'README.md')
    const ours = [catalog]
    // only the README that init wrote: its first line is the marker
    if (
      existsSync(readme) &&
      readFileSync(readme, 'utf8').split('\n')[0] === README_MARKER
    ) {
      ours.push(readme)
    }
    plan.deleteFiles.push(...ours.map((f) => relative(o.cwd, f)))
    const others = readdirSync(folder).filter(
      (name) => !ours.includes(join(folder, name)),
    )
    if (!others.length && folder !== resolve(o.cwd, 'src')) {
      plan.deleteDirs.push(relative(o.cwd, folder))
    }
  }
  const srcDir = join(o.cwd, 'src')
  if (existsSync(srcDir)) {
    for (const file of sourceFiles(srcDir)) {
      if (file === catalog) continue
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((text, i) => {
          const ref = {
            file: relative(o.cwd, file),
            line: i + 1,
            text: text.trim(),
          }
          if (BARE_REGISTER.test(text)) plan.lineEdits.push(ref)
          else if (ANY_USE.test(text) || CODE_USE.test(text)) {
            plan.blockers.push(ref)
          }
        })
    }
  }
  for (const name of readdirSync(o.cwd).sort()) {
    if (!OUTSIDE_FILE.test(name) || statSync(join(o.cwd, name)).isDirectory()) {
      continue
    }
    readFileSync(join(o.cwd, name), 'utf8')
      .split('\n')
      .forEach((text, i) => {
        // the dependency entry itself goes away with the package manager command
        const dependencyLine =
          name === 'package.json' &&
          /"skilllane-monitoring"\s*:\s*"[^"]*"/.test(text)
        if (text.includes(PACKAGE) && !dependencyLine) {
          plan.outside.push({ file: name, line: i + 1, text: text.trim() })
        }
      })
  }
  return plan
}

export function applyUninstall(plan: UninstallPlan, cwd: string): void {
  const byFile = new Map<string, Set<number>>()
  for (const edit of plan.lineEdits) {
    byFile.set(edit.file, (byFile.get(edit.file) ?? new Set()).add(edit.line))
  }
  for (const [file, lines] of byFile) {
    const full = join(cwd, file)
    const kept = readFileSync(full, 'utf8')
      .split('\n')
      .filter((_, i) => !lines.has(i + 1))
    writeFileSync(full, kept.join('\n'))
  }
  for (const file of plan.deleteFiles) rmSync(join(cwd, file))
  for (const dir of plan.deleteDirs) rmdirSync(join(cwd, dir))
}

function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close()
      done(/^y(es)?$/i.test(answer.trim()))
    }),
  )
}

function runCommand(cmd: string[], cwd: string): number {
  return (
    spawnSync(cmd[0], cmd.slice(1), {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }).status ?? 1
  )
}

export async function uninstall(o: {
  cwd: string
  path?: string
  yes?: boolean
  force?: boolean
  ask?: (question: string) => Promise<boolean>
  run?: (cmd: string[], cwd: string) => number
  out?: (line: string) => void
}): Promise<number> {
  const out = o.out ?? ((line: string) => console.log(line))
  const plan = planUninstall(o)
  const show = (title: string, refs: Ref[]) => {
    if (!refs.length) return
    out(title)
    for (const r of refs) out(`  ${r.file}:${r.line}  ${r.text}`)
  }
  if (plan.deleteFiles.length || plan.deleteDirs.length) {
    out('Delete:')
    for (const f of [...plan.deleteFiles, ...plan.deleteDirs]) out(`  ${f}`)
  }
  show('Remove these lines:', plan.lineEdits)
  show(
    'Uses of the SDK to fix by hand (the build breaks without the package):',
    plan.blockers,
  )
  show(
    'Outside src/, not changed (an app with NODE_OPTIONS still requiring the SDK will not start):',
    plan.outside,
  )
  out(`Then run: ${plan.removeCommand.join(' ')}`)
  if (plan.blockers.some((r) => CODE_USE.test(r.text))) {
    out(
      "AppErrorCode lives in the catalog file that is deleted: replace AppErrorCode.X with the string 'X' first",
    )
  }
  if (plan.blockers.length && !o.force) {
    out('Stopped: fix the uses above first, or run again with --force')
    return 1
  }
  if (!o.yes && !(await (o.ask ?? askYesNo)('Continue? (y/N) '))) {
    out('Nothing changed')
    return 1
  }
  applyUninstall(plan, o.cwd)
  const status = (o.run ?? runCommand)(plan.removeCommand, o.cwd)
  if (status !== 0) {
    out(
      `${plan.removeCommand.join(' ')} exited with ${status}; the files above were already changed`,
    )
  }
  return status
}
