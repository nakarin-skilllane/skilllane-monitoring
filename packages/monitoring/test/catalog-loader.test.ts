import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  catalogCandidates,
  loadProjectCatalog,
  startProjectCatalog,
} from '../src/errors/catalog-loader'
import {
  getProjectCatalog,
  setProjectCatalog,
} from '../src/errors/project-catalog'
import { captureLogger, lastLine } from './helpers'

const CATALOG_JS = `exports.default = { errors: { catalog: { E1: { hint: 'One' }, E2: { hint: 'Two' } } } }\n`

function app(): string {
  const root = mkdtempSync(join(tmpdir(), 'slm-catalog-'))
  writeFileSync(join(root, 'package.json'), '{"name":"app"}')
  mkdirSync(join(root, 'dist'), { recursive: true })
  writeFileSync(join(root, 'dist', 'main.js'), '')
  return root
}

function put(root: string, rel: string, body = CATALOG_JS): void {
  mkdirSync(join(root, rel, '..'), { recursive: true })
  writeFileSync(join(root, rel), body)
}

afterEach(() => setProjectCatalog(undefined))

describe('catalogCandidates', () => {
  it('maps a src .ts path to dist and dist/src, then the .ts itself', () => {
    const root = app()
    const found = catalogCandidates({
      configFile: 'src/common/config/errors.ts',
      entry: join(root, 'dist/main.js'),
      cwd: root,
    })
    expect(found.map((c) => c.path)).toEqual([
      join(root, 'dist/common/config/errors.js'),
      join(root, 'dist/src/common/config/errors.js'),
      join(root, 'src/common/config/errors.ts'),
    ])
    expect(found[0].shown).toBe('src/common/config/errors.ts')
  })

  it('resolves a relative path against the app, not the folder the command ran in', () => {
    // pnpm monorepo: `node packages/app/dist/main.js` from the repo root
    const repo = mkdtempSync(join(tmpdir(), 'slm-mono-'))
    writeFileSync(join(repo, 'package.json'), '{"name":"repo"}')
    const appRoot = join(repo, 'packages/app')
    mkdirSync(join(appRoot, 'dist'), { recursive: true })
    writeFileSync(join(appRoot, 'package.json'), '{"name":"app"}')
    writeFileSync(join(appRoot, 'dist/main.js'), '')
    const found = catalogCandidates({
      configFile: 'src/x.ts',
      entry: 'packages/app/dist/main.js',
      cwd: repo,
    })
    expect(found[0].path).toBe(join(appRoot, 'dist/x.js'))
    // the working-directory reading, last resort
    expect(found.map((c) => c.path)).toContain(join(repo, 'src/x.ts'))
  })

  it('uses the two standard places next to the entry file, .js then .ts', () => {
    const root = app()
    expect(
      catalogCandidates({ entry: join(root, 'dist/main.js'), cwd: root }).map(
        (c) => c.path,
      ),
    ).toEqual([
      join(root, 'dist/skilllane-monitoring/errors.js'),
      join(root, 'dist/config/skilllane-monitoring.js'),
      join(root, 'dist/skilllane-monitoring/errors.ts'),
      join(root, 'dist/config/skilllane-monitoring.ts'),
    ])
  })

  it('looks for .ts first beside a .ts entry (ts-node src/main.ts)', () => {
    const root = app()
    expect(
      catalogCandidates({ entry: join(root, 'src/main.ts'), cwd: root })[0]
        .path,
    ).toBe(join(root, 'src/skilllane-monitoring/errors.ts'))
  })
})

describe('loadProjectCatalog', () => {
  it('loads the standard file', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js')
    const out = loadProjectCatalog({
      entry: join(root, 'dist/main.js'),
      cwd: root,
    })
    expect(out.status).toBe('loaded')
    if (out.status === 'loaded') {
      expect(out.catalog.patterns.map((p) => p.key)).toEqual(['E1', 'E2'])
    }
  })

  it('loads SKILLLANE_MONITORING_ERRORS_FILE_PATH given as a src .ts path from the dist/src layout', () => {
    const root = app()
    put(root, 'dist/src/common/config/monitoring-errors.js')
    const out = loadProjectCatalog({
      configFile: 'src/common/config/monitoring-errors.ts',
      entry: join(root, 'dist/main.js'),
      cwd: root,
    })
    expect(out).toMatchObject({
      status: 'loaded',
      shown: 'src/common/config/monitoring-errors.ts',
    })
  })

  it('reports the second standard file as a duplicate', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js')
    put(root, 'dist/config/skilllane-monitoring.js')
    const out = loadProjectCatalog({
      entry: join(root, 'dist/main.js'),
      cwd: root,
    })
    expect(out).toMatchObject({
      status: 'loaded',
      duplicates: [join(root, 'dist/config/skilllane-monitoring.js')],
    })
  })

  it('says where it looked when nothing is there', () => {
    const root = app()
    const out = loadProjectCatalog({
      entry: join(root, 'dist/main.js'),
      cwd: root,
    })
    expect(out).toMatchObject({ status: 'not-found' })
    if (out.status === 'not-found') {
      expect(out.looked[0]).toBe(
        join(root, 'dist/skilllane-monitoring/errors.js'),
      )
    }
  })

  it('fails without throwing when the file throws', () => {
    const root = app()
    put(
      root,
      'dist/skilllane-monitoring/errors.js',
      'throw new Error("broken file")',
    )
    const out = loadProjectCatalog({
      entry: join(root, 'dist/main.js'),
      cwd: root,
    })
    expect(out).toMatchObject({ status: 'failed', reason: 'broken file' })
  })
})

describe('startProjectCatalog', () => {
  it('sets the catalog and writes one summary line', () => {
    const root = app()
    put(root, 'dist/skilllane-monitoring/errors.js')
    const { lines } = captureLogger()
    startProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(getProjectCatalog()?.patterns).toHaveLength(2)
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'info',
      message: `custom error catalog: 2 codes from ${join(root, 'dist/skilllane-monitoring/errors.js')}`,
    })
  })

  it('warns once with every adjusted entry', () => {
    const root = app()
    put(
      root,
      'dist/skilllane-monitoring/errors.js',
      `exports.default = { errors: { catalog: { E1: { hint: '' }, E2: { hint: 'ok', level: 'fatal' } } } }`,
    )
    const { lines } = captureLogger()
    startProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'warn',
      message: 'custom error catalog: 2 entries adjusted',
    })
    expect(lastLine(lines).reason).toContain(
      'E1: hint is required; entry skipped',
    )
  })

  it('logs not found at info level and leaves the catalog unset', () => {
    const root = app()
    const { lines } = captureLogger()
    startProjectCatalog({ entry: join(root, 'dist/main.js'), cwd: root })
    expect(getProjectCatalog()).toBeUndefined()
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'info',
      message: 'custom error catalog: not found',
    })
  })
})
