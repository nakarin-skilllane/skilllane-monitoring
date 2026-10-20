// Type-only Nest imports: the app and this library may resolve different
// copies of @nestjs/common, so the module uses no decorators at runtime.
import type {
  DynamicModule,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Provider,
} from '@nestjs/common'
import type { FactoryProvider, ModuleMetadata } from '@nestjs/common/interfaces'
import { registerTypeormSchema } from '../errors/schema'
import { type BullmqClasses, installBullmqWatch } from '../integrations/bullmq'
import { type HttpWatch, watchHttp } from '../integrations/http'
import { isOtelStarted } from '../integrations/otel'
import { type RedisWatch, watchRedis } from '../integrations/redis'
import { getLogger, reconfigureLogger } from '../logger'
import type { LoggerConfig } from '../logger/app-logger'
import type { RequestUserResolver } from '../logger/context'
import { type CqrsClasses, installCqrsWatch } from '../logger/usecase'
import { appRequire } from '../otel/identity'
import { shutdownTelemetry } from '../otel/lifecycle'
import { isAppStartedDeferred, logAppStarted } from './app-started'

export interface LoggingModuleOptions {
  /** service.name; default OTEL_SERVICE_NAME, then the app's package name. */
  service?: string
  /** Process role (api / worker / persister); default APP_ROLE. */
  role?: string
  /** Who made the request; default `req.user.id`. */
  resolveUser?: RequestUserResolver
  /**
   * The app's TypeORM DataSource: DB names in errors (hash FK names, columns)
   * are shown as `Entity.property`.
   */
  schema?: { entityMetadatas?: unknown[] }
  /**
   * Find the app's @nestjs/cqrs buses, BullMQ (+ @nestjs/bullmq) and default
   * axios instance and hook them without listing them in `watch`. Default
   * true. ioredis, kafkajs, amqplib and @nestjs/schedule are watched from
   * register (LOG_AUTO_WATCH); list a client in `watch` only to name it.
   */
  auto?: boolean
  /** Explicit hooks; each one replaces what `auto` would have found. */
  watch?: {
    redis?: RedisWatch[]
    /** `{ Worker, Queue, BullExplorer }` from the app's bullmq packages. */
    bullmq?: BullmqClasses
    /** The shared BullMQ connection; watched once for all queues. */
    bullmqRedis?: RedisWatch
    bullmqConfigKeys?: string[]
    http?: HttpWatch[]
    /** `{ QueryBus, CommandBus }`: each query/command is a use case. */
    cqrs?: CqrsClasses
  }
}

export interface LoggingModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject']
  useFactory: (
    ...args: any[]
  ) => LoggingModuleOptions | Promise<LoggingModuleOptions>
}

export const LOGGING_OPTIONS = Symbol('LOGGING_OPTIONS')
const LOGGING_READY = Symbol('LOGGING_READY')
const LOGGING_LIFECYCLE = Symbol('LOGGING_LIFECYCLE')

// Set when the app's own modules call forRoot/forRootAsync (decorators run
// at import, before NestFactory.create); the automatic wiring then stays out.
let declaredByApp = false

export function isLoggingModuleDeclared(): boolean {
  return declaredByApp
}

/** The app's own copies, so the hooks patch the classes the app runs. */
function discover(): {
  cqrs?: CqrsClasses
  bullmq?: BullmqClasses
  axios?: unknown
} {
  const cqrs = appRequire('@nestjs/cqrs')
  const bullmq = appRequire('bullmq')
  // Not re-exported from @nestjs/bullmq's root; its workerClass setter is public.
  const explorer = appRequire('@nestjs/bullmq/dist/bull.explorer')
  const axios = appRequire('axios')
  return {
    cqrs: cqrs?.QueryBus
      ? { QueryBus: cqrs.QueryBus, CommandBus: cqrs.CommandBus }
      : undefined,
    bullmq:
      bullmq?.Worker && explorer?.BullExplorer
        ? {
            Worker: bullmq.Worker,
            Queue: bullmq.Queue,
            BullExplorer: explorer.BullExplorer,
          }
        : undefined,
    axios: axios?.default ?? axios,
  }
}

function loggerChanges(options: LoggingModuleOptions): Partial<LoggerConfig> {
  const changes: Partial<LoggerConfig> = {}
  if (options.service) changes.service = options.service
  if (options.role) changes.role = options.role
  if (options.resolveUser) changes.resolveUser = options.resolveUser
  return changes
}

/**
 * Runs in a provider factory, so before any module's onModuleInit: the
 * BullMQ worker class is replaced before workers exist.
 */
function initialize(options: LoggingModuleOptions): true {
  const changes = loggerChanges(options)
  if (Object.keys(changes).length) reconfigureLogger(changes)
  const logger = getLogger()
  try {
    const found = options.auto === false ? {} : discover()
    const watch = options.watch ?? {}
    if (options.schema) registerTypeormSchema(options.schema)
    for (const redis of watch.redis ?? []) watchRedis(redis)
    for (const http of watch.http ?? []) watchHttp(http)
    // watchHttp skips a client it already watches, so an explicit entry for
    // the default instance keeps its own name.
    if (found.axios) watchHttp({ client: found.axios, name: 'external' })
    const cqrs = watch.cqrs ?? found.cqrs
    if (cqrs) installCqrsWatch(cqrs)
    const queueMonitor = watch.bullmqRedis
      ? watchRedis({ module: 'bullmq', ...watch.bullmqRedis })
      : undefined
    const bullmq = watch.bullmq ?? found.bullmq
    if (bullmq) {
      installBullmqWatch({
        classes: bullmq,
        configKeys: watch.bullmqConfigKeys,
        monitor: queueMonitor,
      })
    }
  } catch (error) {
    logger.event({
      event: 'app.log',
      level: 'warn',
      logger: '@skilllane/monitoring',
      message: 'Logging integration failed to attach',
      error,
    })
  }
  return true
}

/** Created by a factory that waits for LOGGING_READY. */
class LoggingLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  onApplicationBootstrap(): void {
    const logger = getLogger()
    if (!isOtelStarted()) {
      logger.event({
        event: 'otel.not_started',
        logger: '@skilllane/monitoring',
      })
    }
    // An HTTP app logs it after listen(), with the port.
    if (!isAppStartedDeferred()) logAppStarted()
  }

  /** Last of Nest's shutdown hooks: send what is buffered, bounded in time. */
  onApplicationShutdown(): Promise<void> {
    return shutdownTelemetry()
  }
}

function moduleFor(
  options: Provider,
  imports: DynamicModule['imports'] = [],
): DynamicModule {
  return {
    global: true,
    module: LoggingModule,
    imports,
    providers: [
      options,
      {
        provide: LOGGING_READY,
        inject: [LOGGING_OPTIONS],
        useFactory: initialize,
      },
      {
        provide: LOGGING_LIFECYCLE,
        inject: [LOGGING_READY],
        useFactory: () => new LoggingLifecycle(),
      },
    ],
    exports: [LOGGING_OPTIONS],
  }
}

export class LoggingModule {
  /** `LoggingModule.forRoot({ service: 'my-service' })` in AppModule. */
  static forRoot(options: LoggingModuleOptions = {}): DynamicModule {
    declaredByApp = true
    return moduleFor({ provide: LOGGING_OPTIONS, useValue: options })
  }

  /** When an option comes from DI, e.g. a Redis client or the DataSource. */
  static forRootAsync(options: LoggingModuleAsyncOptions): DynamicModule {
    declaredByApp = true
    return moduleFor(
      {
        provide: LOGGING_OPTIONS,
        inject: options.inject ?? [],
        useFactory: options.useFactory,
      },
      options.imports,
    )
  }
}

/**
 * What `NODE_OPTIONS=--require @skilllane/monitoring/register` adds to the root
 * module. The app's TypeORM DataSource, when it has one, names DB objects in
 * errors.
 */
export function autoLoggingModule(): DynamicModule {
  const DataSource = appRequire('typeorm')?.DataSource
  if (!DataSource) return moduleFor({ provide: LOGGING_OPTIONS, useValue: {} })
  return moduleFor({
    provide: LOGGING_OPTIONS,
    inject: [{ token: DataSource, optional: true }],
    useFactory: (dataSource?: { entityMetadatas?: unknown[] }) =>
      dataSource ? { schema: dataSource } : {},
  })
}
