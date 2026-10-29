import { STATUS_CODES } from 'http'
import { Hook } from 'require-in-the-middle'
import { httpExceptionWords, logWordsOf } from '../errors/http-exception'
import { getLogger } from '../logger'

const PATCHED = Symbol.for('skilllane-monitoring.http-exception-patched')

// Where Nest's own default description differs from Node's status text.
const NEST_DESCRIPTIONS: Record<number, string> = {
  418: "I'm a teapot",
  421: 'Misdirected',
}

let hooked = false
// Set by extractDescriptionAndOptionsFrom, read by the createBody call the
// same constructor makes right after it.
let fillDescription = false

/**
 * `new BadRequestException(message, { howToFix })`: an options object
 * without `description` leaves the body without `error: 'Bad Request'`.
 * When the object carries this package's words, the text Nest would have
 * used is put back. Options with only `cause` keep Nest's behaviour.
 */
export function patchHttpException(HttpException: any): void {
  if (
    typeof HttpException?.createBody !== 'function' ||
    typeof HttpException?.extractDescriptionAndOptionsFrom !== 'function' ||
    HttpException[PATCHED]
  ) {
    return
  }
  Object.defineProperty(HttpException, PATCHED, { value: true })

  const extract = HttpException.extractDescriptionAndOptionsFrom
  HttpException.extractDescriptionAndOptionsFrom = function (
    this: unknown,
    descriptionOrOptions: unknown,
  ) {
    const result = extract.call(this, descriptionOrOptions)
    fillDescription =
      result?.description === undefined && !!logWordsOf(descriptionOrOptions)
    return result
  }

  const createBody = HttpException.createBody
  HttpException.createBody = function (
    this: unknown,
    body: unknown,
    description: unknown,
    statusCode: number,
  ) {
    const fill = fillDescription
    fillDescription = false
    return createBody.call(
      this,
      body,
      description ??
        (fill
          ? (NEST_DESCRIPTIONS[statusCode] ?? STATUS_CODES[statusCode])
          : undefined),
      statusCode,
    )
  }
}

const logged = new WeakSet<object>()

/**
 * Nest answers an HttpException without writing a line. One thrown with
 * this package's words gets its line here, before the answer; a plain
 * `throw new BadRequestException()` stays quiet as before. Covers Nest's
 * default handler and app filters that call `super.catch()`.
 */
export function patchExceptionFilter(BaseExceptionFilter: any): void {
  const proto = BaseExceptionFilter?.prototype
  if (typeof proto?.catch !== 'function' || proto[PATCHED]) return
  Object.defineProperty(proto, PATCHED, { value: true })

  const original = proto.catch
  proto.catch = function (this: unknown, exception: unknown, host: unknown) {
    try {
      if (
        typeof exception === 'object' &&
        exception !== null &&
        !logged.has(exception) &&
        httpExceptionWords(exception)
      ) {
        logged.add(exception)
        getLogger().error(
          (exception as Error).message,
          exception,
          'ExceptionsHandler',
        )
      }
    } catch {
      // the answer still goes out
    }
    return original.call(this, exception, host)
  }
}

/** Patches Nest's HttpException and BaseExceptionFilter as the app loads them. */
export function hookHttpExceptions(): void {
  if (hooked) return
  hooked = true
  new Hook(['@nestjs/common'], (exports: any) => {
    try {
      patchHttpException(exports?.HttpException)
    } catch {
      // bodies and lines stay as Nest makes them
    }
    return exports
  })
  new Hook(['@nestjs/core'], (exports: any) => {
    try {
      patchExceptionFilter(exports?.BaseExceptionFilter)
    } catch {
      // bodies and lines stay as Nest makes them
    }
    return exports
  })
}

/**
 * An app that calls setupLogging without `skilllane-monitoring/register`
 * has Nest loaded already: patch the copies its entry file resolves.
 */
export function patchLoadedHttpExceptions(): void {
  const load = require.main?.require.bind(require.main)
  if (!load) return
  try {
    patchHttpException(load('@nestjs/common').HttpException)
  } catch {
    // not resolvable from the entry file
  }
  try {
    patchExceptionFilter(load('@nestjs/core').BaseExceptionFilter)
  } catch {
    // not resolvable from the entry file
  }
}
