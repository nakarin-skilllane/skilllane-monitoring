import { describe, expect, it } from 'vitest'
import { ELAPSED_MS } from '../src/logger/context'
import { formatDuration, formatPretty } from '../src/logger/pretty'
import { createPrettyWriter } from '../src/logger/writer'

// Local time, so the printed HH:mm:ss.SSS does not depend on the machine TZ.
const at = (h: number, m: number, s: number, ms: number) =>
  new Date(2026, 9, 7, h, m, s, ms).toISOString()

const API = 'school-core-api/api'
const WORKER = 'school-core-api/worker'

const line = (
  fields: Record<string, unknown>,
  elapsed?: number,
): Record<string, unknown> => {
  const record: Record<string | symbol, unknown> = { ...fields }
  if (elapsed !== undefined) record[ELAPSED_MS] = elapsed
  return record as Record<string, unknown>
}

// The examples of the format spec, as records the library writes.
const examples = {
  appStarted: line({
    '@timestamp': at(14, 0, 4, 812),
    'log.level': 'info',
    'service.name': API,
    'event.code': 'app.started',
    'server.port': 3000,
    duration_ms: 4100,
  }),
  requestCompleted: line({
    '@timestamp': at(14, 2, 11, 204),
    'log.level': 'info',
    'service.name': API,
    'event.code': 'http.request',
    'http.request.method': 'POST',
    'url.path': '/orders',
    'http.route': '/orders',
    'http.response.status_code': 201,
    duration_ms: 84,
    'trace.id': '4bf92f3577b34da6a3ce929d0e0e4736',
    'user.id': 'u_1029',
  }),
  invalidBody: line(
    {
      '@timestamp': at(14, 2, 15, 880),
      'log.level': 'warn',
      'service.name': API,
      'event.code': 'app.log',
      message: 'Bad Request Exception',
      'error.hint': 'Invalid request body',
      'error.fix': 'quantity must be ≥ 1; shippingAddress.zip is required',
      'http.request.method': 'POST',
      'http.route': '/orders',
      'http.response.status_code': 400,
      'trace.id': '5ca13e9b0a8d4f21b6e7c3d2a1f09e88',
      'user.id': 'u_1029',
    },
    6,
  ),
  nullRead: line(
    {
      '@timestamp': at(14, 3, 40, 517),
      'log.level': 'error',
      'service.name': API,
      'event.code': 'app.log',
      message: "Cannot read properties of undefined (reading 'percent')",
      'error.hint': 'Read from undefined value',
      'error.fix':
        'the object holding .percent was undefined; the coupon may not exist, check before reading .percent',
      'error.type': 'TypeError',
      'error.message':
        "Cannot read properties of undefined (reading 'percent')",
      'error.stack_trace': [
        "TypeError: Cannot read properties of undefined (reading 'percent')",
        `    at ApplyDiscountHandler.execute (${process.cwd()}/dist/src/orders/apply-discount.handler.js:40:22)`,
        '    at QueryBus.execute (/app/node_modules/@nestjs/cqrs/dist/query-bus.js:70:22)',
        `    at async OrdersController.discount (${process.cwd()}/dist/src/orders/orders.controller.js:88:5)`,
      ].join('\n'),
      'log.origin.file.name': 'src/orders/apply-discount.handler.ts',
      'http.request.method': 'POST',
      'url.path': '/orders/5512/discount',
      'http.route': '/orders/:id/discount',
      'trace.id': 'a3ce929d0e0e47364bf92f3577b34da6',
      'user.id': 'u_2201',
    },
    31,
  ),
  kafkaDown: line({
    '@timestamp': at(14, 4, 50, 100),
    'log.level': 'error',
    'service.name': WORKER,
    'event.code': 'dependency.down',
    'event.module': 'kafka',
    'dependency.type': 'kafka',
    'dependency.name': 'producer',
    'dependency.host': 'kafka-0.kafka',
    'dependency.port': 9092,
    'error.hint': 'Kafka not reachable',
    'error.hint_detail':
      'cannot connect to the Kafka broker; check broker status and KAFKA_BROKERS',
    'error.type': 'KafkaJSConnectionError',
    'error.message': 'Connection error: connect ECONNREFUSED 10.0.4.12:9092',
  }),
  jobTimeout: line({
    '@timestamp': at(14, 5, 2, 93),
    'log.level': 'error',
    'service.name': WORKER,
    'event.code': 'job.retry',
    'event.module': 'bullmq',
    'job.queue': 'payments',
    'job.type': 'charge-order',
    'job.id': '88412',
    'job.attempt': 2,
    'job.max_attempts': 5,
    'url.domain': 'api.paygate.example',
    duration_ms: 10000,
    'error.hint': 'Payment API not responding',
    'error.hint_detail':
      'no reply within 10s; the provider may be down, orders will retry automatically',
    'error.type': 'AxiosError',
    'error.code': 'ETIMEDOUT',
    'error.message': 'timeout of 10000ms exceeded',
    'trace.id': 'e7c3d2a1f09e885ca13e9b0a8d4f21b6',
  }),
  redisStillDown: line({
    '@timestamp': at(14, 5, 20, 100),
    'log.level': 'warn',
    'service.name': API,
    'event.code': 'dependency.still_down',
    'dependency.type': 'redis',
    'dependency.name': 'cache',
    'dependency.host': '10.0.3.21',
    'dependency.port': 6379,
    'dependency.attempt': 9,
    duration_ms: 30000,
  }),
  redisUp: line({
    '@timestamp': at(14, 5, 35, 300),
    'log.level': 'info',
    'service.name': API,
    'event.code': 'dependency.up',
    'dependency.type': 'redis',
    'dependency.name': 'cache',
    'dependency.host': '10.0.3.21',
    'dependency.port': 6379,
    duration_ms: 45200,
  }),
  deadLettered: line(
    {
      '@timestamp': at(14, 6, 10, 517),
      'log.level': 'error',
      'service.name': WORKER,
      'event.code': 'message.dead_lettered',
      'event.module': 'kafka',
      'job.queue': 'order-events',
      'job.id': 'p3-o88214',
      'job.attempt': 5,
      'job.max_attempts': 5,
      dlq: 'order-events.dlq',
      'error.hint_detail':
        'two operations locked each other; usually solved by retry, if frequent review the order of updates',
      'error.type': 'QueryFailedError',
      'error.message': 'deadlock detected',
      'trace.id': '0a8d4f21b6e7c3d2a1f09e885ca13e9b',
    },
    2400,
  ),
}

/** Collects what the pretty writer prints. */
function capture(isTTY: boolean) {
  let out = ''
  const stream = {
    isTTY,
    write: (chunk: string) => {
      out += chunk
      return true
    },
  } as unknown as NodeJS.WriteStream
  return { stream, output: () => out }
}

describe('pretty format', () => {
  it('prints every example of the spec', () => {
    const { stream, output } = capture(false)
    const write = createPrettyWriter({ stream })
    for (const record of Object.values(examples)) write(record, 'info')
    expect(output()).toMatchInlineSnapshot(`
      "14:00:04.812 INF school-core-api/api        app started                 port=3000 duration=4.1s

      14:02:11.204 INF school-core-api/api        request completed           method=POST path=/orders status=201 duration=84ms
          trace id:     4bf92f3577b34da6a3ce929d0e0e4736  user id: u_1029

      14:02:15.880 WRN school-core-api/api        invalid request body        method=POST path=/orders status=400 duration=6ms
          error detail: quantity must be ≥ 1; shippingAddress.zip is required
          trace id:     5ca13e9b0a8d4f21b6e7c3d2a1f09e88  user id: u_1029

      14:03:40.517 ERR school-core-api/api        read from undefined value   method=POST path=/orders/:id/discount file=src/orders/apply-discount.handler.ts duration=31ms
          error detail: the object holding .percent was undefined; the coupon may not exist, check before reading .percent
          actual error: TypeError: Cannot read properties of undefined (reading 'percent')
          trace id:     a3ce929d0e0e47364bf92f3577b34da6  user id: u_2201

      14:04:50.100 ERR school-core-api/worker     kafka not reachable         source=kafka target=kafka-0.kafka:9092
          error detail: cannot connect to the Kafka broker; check broker status and KAFKA_BROKERS
          actual error: KafkaJSConnectionError: Connection error: connect ECONNREFUSED 10.0.4.12:9092

      14:05:02.093 ERR school-core-api/worker     payment API not responding  source=bullmq job=charge-order id=88412 attempt=2/5 target=api.paygate.example duration=10.0s
          error detail: no reply within 10s; the provider may be down, orders will retry automatically
          actual error: AxiosError [ETIMEDOUT] timeout of 10000ms exceeded
          trace id:     e7c3d2a1f09e885ca13e9b0a8d4f21b6

      14:05:20.100 WRN school-core-api/api        redis "cache" still down    target=10.0.3.21:6379 retry=9 duration=30.0s
      14:05:35.300 INF school-core-api/api        redis "cache" is back       target=10.0.3.21:6379 duration=45.2s

      14:06:10.517 ERR school-core-api/worker     message moved to dlq        source=kafka job=order-events id=p3-o88214 attempt=5/5 dlq=order-events.dlq duration=2.4s
          error detail: two operations locked each other; usually solved by retry, if frequent review the order of updates
          actual error: QueryFailedError: deadlock detected
          trace id:     0a8d4f21b6e7c3d2a1f09e885ca13e9b
      "
    `)
  })

  it('formats durations', () => {
    expect(formatDuration(84)).toBe('84ms')
    expect(formatDuration(999.6)).toBe('1000ms')
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(45_200)).toBe('45.2s')
  })

  it('without a user, shows the trace id only', () => {
    expect(formatPretty(examples.jobTimeout).split('\n').pop()).toBe(
      '    trace id:     e7c3d2a1f09e885ca13e9b0a8d4f21b6',
    )
  })

  it('without a trace, shows the user id only', () => {
    const { 'trace.id': _, ...record } = examples.requestCompleted
    expect(formatPretty(record).split('\n').pop()).toBe(
      '    user id:      u_1029',
    )
  })

  it('without error, trace or user, is one line', () => {
    expect(formatPretty(examples.redisUp).split('\n')).toHaveLength(1)
  })

  it('shows a target from labels before the dependency address', () => {
    const record = {
      ...examples.nullRead,
      labels: { error_target: 'percent' },
    }
    expect(formatPretty(record).split('\n')[0]).toContain('target=percent')
  })

  it('LOG_STACK=app lists our frames without line numbers', () => {
    expect(
      formatPretty(examples.nullRead, { stack: 'app' }),
    ).toMatchInlineSnapshot(`
        "14:03:40.517 ERR school-core-api/api        read from undefined value   method=POST path=/orders/:id/discount file=src/orders/apply-discount.handler.ts duration=31ms
            error detail: the object holding .percent was undefined; the coupon may not exist, check before reading .percent
            actual error: TypeError: Cannot read properties of undefined (reading 'percent')
            stack:        at ApplyDiscountHandler.execute (src/orders/apply-discount.handler.ts)
                          at OrdersController.discount (src/orders/orders.controller.ts)
            trace id:     a3ce929d0e0e47364bf92f3577b34da6  user id: u_2201"
      `)
  })

  it('LOG_STACK=off (default) prints no stack', () => {
    expect(formatPretty(examples.nullRead)).not.toContain('stack:')
  })

  it('LOG_PRETTY_TRACE=warn keeps INF on one line', () => {
    expect(
      formatPretty(examples.requestCompleted, { trace: 'warn' }).split('\n'),
    ).toHaveLength(1)
    expect(formatPretty(examples.invalidBody, { trace: 'warn' })).toContain(
      'trace id:',
    )
  })

  it('colours only on a TTY without NO_COLOR', () => {
    const plain = capture(false)
    createPrettyWriter({ stream: plain.stream })(examples.nullRead, 'error')
    expect(plain.output()).not.toContain('\x1b[')

    const tty = capture(true)
    const noColor = process.env.NO_COLOR
    delete process.env.NO_COLOR
    createPrettyWriter({ stream: tty.stream })(examples.nullRead, 'error')
    expect(tty.output()).toContain('\x1b[31mERR\x1b[0m')
    expect(tty.output()).toContain('\x1b[2merror detail: \x1b[0m')

    process.env.NO_COLOR = '1'
    const off = capture(true)
    createPrettyWriter({ stream: off.stream })(examples.nullRead, 'error')
    expect(off.output()).not.toContain('\x1b[')
    if (noColor === undefined) delete process.env.NO_COLOR
    else process.env.NO_COLOR = noColor
  })

  it('LOG_PRETTY_TRACE=warn: trace line from WRN up only', () => {
    const { stream, output } = capture(false)
    const write = createPrettyWriter({ stream, trace: 'warn' })
    write(examples.requestCompleted, 'info')
    write(examples.invalidBody, 'warn')
    expect(output()).toMatchInlineSnapshot(`
      "14:02:11.204 INF school-core-api/api        request completed           method=POST path=/orders status=201 duration=84ms

      14:02:15.880 WRN school-core-api/api        invalid request body        method=POST path=/orders status=400 duration=6ms
          error detail: quantity must be ≥ 1; shippingAddress.zip is required
          trace id:     5ca13e9b0a8d4f21b6e7c3d2a1f09e88  user id: u_1029
      "
    `)
  })

  it('on a TTY: coloured level, dim labels and trace id', () => {
    expect(
      formatPretty(examples.invalidBody, { color: true }),
    ).toMatchInlineSnapshot(`
      "14:02:15.880 [33mWRN[0m school-core-api/api        invalid request body        method=POST path=/orders status=400 duration=6ms
          [2merror detail: [0mquantity must be ≥ 1; shippingAddress.zip is required
          [2mtrace id:     [0m[2m5ca13e9b0a8d4f21b6e7c3d2a1f09e88[0m  user id: u_1029"
    `)
  })

  it('separates multi-line entries by one blank line, not single ones', () => {
    const { stream, output } = capture(false)
    const write = createPrettyWriter({ stream })
    write(examples.redisStillDown, 'warn')
    write(examples.redisUp, 'info')
    write(examples.requestCompleted, 'info')
    write(examples.appStarted, 'info')
    expect(output().split('\n')).toEqual([
      expect.stringContaining('still down'),
      expect.stringContaining('is back'),
      '',
      expect.stringContaining('request completed'),
      expect.stringContaining('trace id:'),
      '',
      expect.stringContaining('app started'),
      '',
    ])
  })
})
