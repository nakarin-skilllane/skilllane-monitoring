import { Hook } from 'require-in-the-middle'
import { getLogger } from '../logger'
import { flushTelemetry } from '../otel/lifecycle'
import { isBootFailureLogged, markBootFailureLogged } from './boot-failure'
import { autoLoggingModule, isLoggingModuleDeclared } from './logging.module'
import { setupLogging } from './setup-logging'

const PATCHED = Symbol.for('skilllane-monitoring.nest-factory-patched')

let hook: Hook | undefined

/** The root module the app passed, wrapped so LoggingModule sits next to it. */
function withLoggingModule(module: unknown): unknown {
  if (isLoggingModuleDeclared()) return module
  class LoggingRoot {}
  return { module: LoggingRoot, imports: [module, autoLoggingModule()] }
}

/**
 * Nest writes its boot lines through this package's logger from the first
 * one, also when the boot fails before an app exists. A failing boot
 * rejects instead of process.abort(), so it can be logged and flushed.
 * The app's own settings win, except a list of levels (`logger: ['log',
 * 'warn', 'error']`): that would put Nest's console logger back for the
 * whole boot, BullMQ jobs included, and LOG_LEVEL already sets the level.
 */
function withLoggingOptions(options: any): any {
  if (options?.logger === false) return options
  const merged = { logger: getLogger(), abortOnError: false, ...options }
  if (Array.isArray(merged.logger)) merged.logger = getLogger()
  return merged
}

/**
 * Lines an app writes with `new Logger(...)` before NestFactory.create
 * (e.g. "Starting worker") use this package's logger too.
 */
function useLoggerFromLoad(common: any): void {
  const Logger = common?.Logger
  if (typeof Logger?.overrideLogger !== 'function' || Logger[PATCHED]) return
  Object.defineProperty(Logger, PATCHED, { value: true })
  Logger.overrideLogger(getLogger())
}

async function bootFailed(error: unknown): Promise<never> {
  if (!isBootFailureLogged(error)) {
    getLogger().event({ event: 'app.boot_failed', logger: 'bootstrap', error })
    markBootFailureLogged(error)
    await flushTelemetry()
  }
  throw error
}

// Apps the automatic wiring set up, as the objects their methods run on. Nest
// hands out a proxy whose calls run on the app behind it, so the app is
// recorded from inside useLogger, while setUpAuto is installing the logger.
const autoApps = new WeakSet<object>()
let settingUp = false

/**
 * An existing app keeps its own `app.useLogger(...)` after create(), which
 * would swap this package's logger back out; on an auto-wired app only this
 * package's logger is accepted.
 */
function keepAutoLogger(Context: any): void {
  const proto = Context?.prototype
  if (typeof proto?.useLogger !== 'function' || proto[PATCHED]) return
  Object.defineProperty(proto, PATCHED, { value: true })
  const useLogger = proto.useLogger
  proto.useLogger = function (this: object, logger: unknown) {
    if (settingUp) autoApps.add(this)
    else if (autoApps.has(this) && logger !== getLogger()) return
    return useLogger.call(this, logger)
  }
}

function setUpAuto(app: any): void {
  settingUp = true
  try {
    setupLogging(app)
  } finally {
    settingUp = false
  }
}

function patchFactory(factory: any): void {
  if (!factory || factory[PATCHED]) return
  Object.defineProperty(factory, PATCHED, { value: true })

  const create = factory.create.bind(factory)
  factory.create = async (module: unknown, ...args: any[]) => {
    const adapterFirst = factory.isHttpServer?.(args[0])
    const options = withLoggingOptions(adapterFirst ? args[1] : args[0])
    const rest = adapterFirst ? [args[0], options] : [options]
    let app: any
    try {
      app = await create(withLoggingModule(module), ...rest)
    } catch (error) {
      return bootFailed(error)
    }
    setUpAuto(app)
    return app
  }

  const createContext = factory.createApplicationContext.bind(factory)
  factory.createApplicationContext = async (module: unknown, options?: any) => {
    let app: any
    try {
      app = await createContext(
        withLoggingModule(module),
        withLoggingOptions(options),
      )
    } catch (error) {
      return bootFailed(error)
    }
    setUpAuto(app)
    return app
  }
}

/**
 * Wraps NestFactory.create / createApplicationContext as @nestjs/core is
 * loaded: the root module gets LoggingModule (unless the app declares its
 * own) and setupLogging runs right after the app is created, before any
 * middleware the app adds. Turn off with LOG_NEST_AUTO=false.
 */
export function hookNestFactory(): void {
  if (hook) return
  new Hook(['@nestjs/common'], (exports: any) => {
    try {
      useLoggerFromLoad(exports)
    } catch {
      // Nest keeps its console logger until create()
    }
    return exports
  })
  hook = new Hook(['@nestjs/core'], (exports: any) => {
    try {
      patchFactory(exports?.NestFactory)
      keepAutoLogger(exports?.NestApplicationContext)
    } catch {
      // the app still boots, without automatic wiring
    }
    return exports
  })
}
