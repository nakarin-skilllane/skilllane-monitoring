import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'

/** An env var, with '' treated as unset. */
export function env(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export function envNumber(name: string, fallback: number): number {
  const value = Number(env(name))
  return env(name) !== undefined && Number.isFinite(value) ? value : fallback
}

let root: string | undefined

/**
 * The application's package directory: the nearest package.json above the
 * entry script. `node dist/main.js` in Docker does not set
 * npm_package_version, so the version is read from there.
 */
export function appRoot(): string {
  if (root) return root
  let dir = process.argv[1] ? dirname(process.argv[1]) : process.cwd()
  for (let depth = 0; depth < 10; depth++) {
    if (existsSync(join(dir, 'package.json'))) {
      root = dir
      return root
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  root = process.cwd()
  return root
}

/**
 * `require` from the application, not from this package: hooks must patch
 * the copy of bullmq / @nestjs/cqrs / axios the app itself loads.
 */
export function appRequire(id: string): any {
  try {
    return createRequire(join(appRoot(), 'package.json'))(id)
  } catch {
    return undefined
  }
}

function appPackage(): { name?: string; version?: string } {
  try {
    return JSON.parse(readFileSync(join(appRoot(), 'package.json'), 'utf8'))
  } catch {
    return {}
  }
}

export interface ServiceIdentity {
  name: string
  version?: string
  environment?: string
  /** APP_ROLE (api / worker / persister). */
  role?: string
}

/** service.name / version / environment, from env first, then package.json. */
export function serviceIdentity(): ServiceIdentity {
  const pkg = appPackage()
  return {
    name: env('OTEL_SERVICE_NAME') ?? pkg.name ?? 'app',
    version:
      env('SERVICE_VERSION') ?? env('npm_package_version') ?? pkg.version,
    environment: env('OTEL_ENV') ?? env('NODE_ENV'),
    role: env('APP_ROLE'),
  }
}
