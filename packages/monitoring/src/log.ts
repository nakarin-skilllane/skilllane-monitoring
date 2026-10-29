/**
 * `import { log } from 'skilllane-monitoring/log'`: the logger alone,
 * without the rest of the package.
 */
export { type Log, log } from './logger/log'

// Loads the HttpExceptionOptions fields for apps whose only import is this one.
export type { HttpExceptionLogOptions } from './errors/http-exception'
