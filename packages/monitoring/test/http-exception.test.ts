import { createRequire } from 'module'
import type { AddressInfo } from 'net'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ErrorCode } from '../src/errors/error-codes'
import { serializeError } from '../src/errors/error-serializer'
import { hookHttpExceptions } from '../src/nest/http-exceptions'
import { captureLogger, lastLine } from './helpers'

// Hook first, then load Nest: what `--require skilllane-monitoring/register` does.
hookHttpExceptions()
const load = createRequire(__filename)
require('reflect-metadata')
const common = load('@nestjs/common') as typeof import('@nestjs/common')
const core = load('@nestjs/core') as typeof import('@nestjs/core')
const {
  BadRequestException,
  Catch,
  Controller,
  Get,
  HttpException,
  ImATeapotException,
  Module,
  NotFoundException,
  ServiceUnavailableException,
} = common

const { logger, lines } = captureLogger()

beforeEach(() => {
  lines.length = 0
})

describe('the body Nest answers with', () => {
  it('keeps error: "Bad Request" when the options carry log words', () => {
    const error = new BadRequestException('Coupon has expired', {
      howToFix: 'Ask for another coupon.',
    })
    expect(error.getResponse()).toEqual({
      message: 'Coupon has expired',
      error: 'Bad Request',
      statusCode: 400,
    })
  })

  it('uses the text Nest gives each class', () => {
    expect(
      new NotFoundException('No such course', { code: 'COURSE_NOT_FOUND' }),
    ).toMatchObject({ response: { error: 'Not Found' } })
    expect(
      new ImATeapotException('Brewing', { detail: 'Only tea here.' }),
    ).toMatchObject({ response: { error: "I'm a teapot" } })
  })

  it('leaves what Nest does alone otherwise', () => {
    const own = new BadRequestException('x', {
      description: 'Coupon rejected',
      howToFix: 'y',
    })
    expect(own.getResponse()).toMatchObject({ error: 'Coupon rejected' })
    // Nest drops `error` for an options object with only a cause; kept as is.
    const caused = new BadRequestException('x', { cause: new Error('db') })
    expect((caused.getResponse() as any).error).toBeUndefined()
    expect(new BadRequestException('x').getResponse()).toMatchObject({
      error: 'Bad Request',
    })
    const objectBody = new BadRequestException(
      { message: 'x', reason: 'own body' },
      { howToFix: 'y' },
    )
    expect(objectBody.getResponse()).toEqual({
      message: 'x',
      reason: 'own body',
    })
    // The next exception made without log words is not filled.
    const after = new BadRequestException('x', { cause: new Error('db') })
    expect((after.getResponse() as any).error).toBeUndefined()
  })
})

describe('serializeError with a Nest HTTP exception', () => {
  it('reads the log words from the options', () => {
    const error = new BadRequestException('Coupon has expired', {
      code: 'COUPON_EXPIRED',
      detail: 'The coupon ended yesterday.',
      howToFix: 'Ask for another coupon.',
      category: 'input',
      target: 'couponCode',
      level: 'error',
    })
    expect(serializeError(error)).toMatchObject({
      code: 'COUPON_EXPIRED',
      status: 400,
      detail: 'The coupon ended yesterday.',
      howToFix: 'Ask for another coupon.',
      category: 'input',
      target: 'couponCode',
      level: 'error',
    })
  })

  it('takes an ErrorCode with its dependency, over errorCode', () => {
    const error = new ServiceUnavailableException('Cache is down', {
      code: ErrorCode.redis.ECONNREFUSED,
    })
    ;(error as any).errorCode = 'CACHE_DOWN'
    expect(serializeError(error)).toMatchObject({
      code: 'ECONNREFUSED',
      codeDependency: 'redis',
      status: 503,
    })
  })

  it('skips values of the wrong kind', () => {
    const error = new BadRequestException('x', {
      howToFix: 'y',
      category: 'whatever',
      level: 'fatal',
      detail: 42,
    } as any)
    const serialized = serializeError(error)
    expect(serialized.howToFix).toBe('y')
    expect(serialized).not.toHaveProperty('category')
    expect(serialized).not.toHaveProperty('level')
    expect(serialized).not.toHaveProperty('detail')
  })

  it('reads nothing from a plain exception', () => {
    const serialized = serializeError(new BadRequestException('x'))
    expect(serialized.code).toBe('HTTP_400')
    expect(serialized).not.toHaveProperty('howToFix')
  })
})

describe('a logged Nest HTTP exception', () => {
  it('overrides only the given fields; the rest comes from the table', () => {
    logger.error(
      'Apply coupon failed',
      new BadRequestException('Coupon has expired', { howToFix: 'test1' }),
    )
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'warn',
      'error.code': 'HTTP_400',
      'error.hint': 'Invalid request',
      'error.detail': 'The request failed validation or business rules.',
      'error.how_to_fix': 'test1',
    })
  })

  it('is a warning for a 4xx code no table knows, unless a level is given', () => {
    logger.error(
      'Apply coupon failed',
      new BadRequestException('Coupon has expired', { code: 'COUPON_EXPIRED' }),
    )
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'warn',
      'error.code': 'COUPON_EXPIRED',
    })
    logger.error(
      'Apply coupon failed',
      new BadRequestException('Coupon has expired', {
        code: 'COUPON_EXPIRED',
        level: 'error',
      }),
    )
    expect(lastLine(lines)['log.level']).toBe('error')
  })

  it('uses the dependency pattern of an ErrorCode', () => {
    logger.error(
      'Load cart failed',
      new ServiceUnavailableException('Cache is down', {
        code: ErrorCode.redis.ECONNREFUSED,
      }),
    )
    expect(lastLine(lines)).toMatchObject({
      'log.level': 'error',
      'error.code': 'ECONNREFUSED',
      'error.hint': expect.stringContaining('unreachable'),
    })
  })
})

@Controller()
class CouponController {
  @Get('expired')
  expired() {
    throw new BadRequestException('Coupon has expired', {
      howToFix: 'Ask for another coupon.',
    })
  }

  @Get('plain')
  plain() {
    throw new BadRequestException('Coupon has expired')
  }

  @Get('teapot')
  teapot() {
    throw new HttpException('Brewing', 418, { detail: 'Only tea here.' })
  }
}

@Module({ controllers: [CouponController] })
class CouponModule {}

// An app filter that hands the exception back to Nest.
@Catch()
class AppFilter extends core.BaseExceptionFilter {
  catch(exception: unknown, host: any) {
    super.catch(exception, host)
  }
}

let close: (() => Promise<void>) | undefined

afterAll(async () => {
  await close?.()
})

describe('a thrown Nest HTTP exception', () => {
  async function start(withFilter: boolean): Promise<string> {
    await close?.()
    const app = await core.NestFactory.create(CouponModule, { logger: false })
    if (withFilter) {
      app.useGlobalFilters(
        new AppFilter(app.get(core.HttpAdapterHost).httpAdapter),
      )
    }
    close = () => app.close()
    await app.listen(0, '127.0.0.1')
    const { port } = app.getHttpServer().address() as AddressInfo
    return `http://127.0.0.1:${port}`
  }

  it.each([false, true])(
    'gets one line and the usual body (app filter: %s)',
    async (withFilter) => {
      const base = await start(withFilter)
      const response = await fetch(`${base}/expired`)
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({
        message: 'Coupon has expired',
        error: 'Bad Request',
        statusCode: 400,
      })
      const logged = lines.filter(
        (l) => l['log.logger'] === 'ExceptionsHandler',
      )
      expect(logged).toHaveLength(1)
      expect(logged[0]).toMatchObject({
        message: 'Coupon has expired',
        'log.level': 'warn',
        'error.code': 'HTTP_400',
        'error.hint': 'Invalid request',
        'error.how_to_fix': 'Ask for another coupon.',
      })
    },
  )

  it('stays quiet when thrown without log words', async () => {
    const base = await start(false)
    const response = await fetch(`${base}/plain`)
    expect(await response.json()).toMatchObject({ error: 'Bad Request' })
    expect(
      lines.filter((l) => l['log.logger'] === 'ExceptionsHandler'),
    ).toEqual([])
  })

  it('logs an HttpException made directly', async () => {
    const base = await start(false)
    const response = await fetch(`${base}/teapot`)
    expect(response.status).toBe(418)
    expect(lastLine(lines)).toMatchObject({
      'log.logger': 'ExceptionsHandler',
      'error.detail': 'Only tea here.',
    })
  })
})
