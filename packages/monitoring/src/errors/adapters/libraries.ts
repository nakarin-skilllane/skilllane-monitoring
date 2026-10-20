import type { ErrorAdapter } from './types'

function hostOf(url: unknown, baseURL?: unknown): string | undefined {
  try {
    if (typeof url !== 'string') return undefined
    return new URL(url, typeof baseURL === 'string' ? baseURL : undefined)
      .hostname
  } catch {
    return undefined
  }
}

export const aggregateAdapter: ErrorAdapter = {
  name: 'aggregate',
  match: (error) =>
    error?.name === 'AggregateError' && Array.isArray(error?.errors),
  // Node raises AggregateError when every address of a host refuses; the
  // first inner error carries the useful code (ECONNREFUSED, ETIMEDOUT).
  extract: (error) => ({
    code:
      typeof error.errors[0]?.code === 'string'
        ? error.errors[0].code
        : undefined,
    cause: error.errors[0],
  }),
}

export const ioredisAdapter: ErrorAdapter = {
  name: 'ioredis',
  match: (error) =>
    error?.name === 'ReplyError' || error?.name === 'MaxRetriesPerRequestError',
  extract: (error) => ({
    code:
      error.name === 'ReplyError'
        ? String(error.message ?? '').split(' ')[0] || undefined
        : error.name,
    dependency: 'redis',
  }),
}

export const kafkaAdapter: ErrorAdapter = {
  name: 'kafkajs',
  match: (error) =>
    typeof error?.name === 'string' && error.name.startsWith('KafkaJS'),
  extract: (error) => ({
    // KafkaJSProtocolError carries the broker error type, e.g. REBALANCE_IN_PROGRESS.
    code: typeof error.type === 'string' ? error.type : error.name,
    cause: error.cause ?? error.originalError,
    dependency: 'kafka',
  }),
}

export const gaxiosAdapter: ErrorAdapter = {
  name: 'gaxios',
  match: (error) =>
    error?.isAxiosError !== true &&
    typeof error?.response?.status === 'number' &&
    typeof error?.config?.url === 'string' &&
    /googleapis\.com|google\.com/.test(error.config.url),
  extract: (error) => {
    const data = error.response?.data
    const reason =
      data?.error?.errors?.[0]?.reason ??
      data?.error?.status ??
      (typeof data?.error === 'string' ? data.error : undefined)
    return {
      code: reason ?? `GOOGLE_${error.response.status}`,
      status: error.response.status,
      dependency: 'google',
      domain: hostOf(error.config.url),
    }
  },
}

// Never keep error.config: it holds headers (Authorization) and the body.
export const axiosAdapter: ErrorAdapter = {
  name: 'axios',
  match: (error) => error?.isAxiosError === true,
  extract: (error) => ({
    code: typeof error.code === 'string' ? error.code : undefined,
    status:
      typeof error.response?.status === 'number'
        ? error.response.status
        : undefined,
    dependency: 'http',
    domain: hostOf(error.config?.url, error.config?.baseURL),
  }),
}

export const awsAdapter: ErrorAdapter = {
  name: 'aws-sdk',
  match: (error) =>
    typeof error?.$metadata === 'object' && typeof error?.name === 'string',
  extract: (error) => ({
    code: error.Code ?? error.name,
    status: error.$metadata?.httpStatusCode,
    dependency: 's3',
  }),
}

export const amqpAdapter: ErrorAdapter = {
  name: 'amqplib',
  match: (error) =>
    typeof error?.code === 'number' &&
    typeof error?.message === 'string' &&
    /(Channel|Connection) closed/.test(error.message),
  extract: (error) => ({ code: `AMQP_${error.code}`, dependency: 'rabbitmq' }),
}

const SMTP_CODES = new Set([
  'EAUTH',
  'ECONNECTION',
  'EENVELOPE',
  'EMESSAGE',
  'ESOCKET',
  'EDNS',
  'EPROTOCOL',
])

export const nodemailerAdapter: ErrorAdapter = {
  name: 'nodemailer',
  match: (error) =>
    typeof error?.code === 'string' &&
    (SMTP_CODES.has(error.code) ||
      typeof error.responseCode === 'number' ||
      typeof error.command === 'string'),
  extract: (error) => ({
    code:
      !SMTP_CODES.has(error.code) && typeof error.responseCode === 'number'
        ? `SMTP_${error.responseCode}`
        : error.code,
    dependency: 'smtp',
  }),
}

const JWT_ERRORS = new Set([
  'TokenExpiredError',
  'JsonWebTokenError',
  'NotBeforeError',
])

export const jwtAdapter: ErrorAdapter = {
  name: 'jwt',
  match: (error) => JWT_ERRORS.has(error?.name),
  extract: (error) => ({ code: error.name }),
}

const LDAP_ERRORS = new Set([
  'InvalidCredentialsError',
  'NoSuchObjectError',
  'EntryAlreadyExistsError',
  'InsufficientAccessError',
])

export const ldapAdapter: ErrorAdapter = {
  name: 'ldapts',
  match: (error) => LDAP_ERRORS.has(error?.name),
  extract: (error) => ({ code: error.name }),
}

export const nestAdapter: ErrorAdapter = {
  name: 'nest',
  match: (error) => typeof error?.getStatus === 'function',
  extract: (error) => {
    const status = Number(error.getStatus())
    const response =
      typeof error.getResponse === 'function' ? error.getResponse() : undefined
    const errorCode =
      typeof error.errorCode === 'string'
        ? error.errorCode
        : typeof response?.errorCode === 'string'
          ? response.errorCode
          : undefined
    return {
      code: errorCode ?? `HTTP_${status}`,
      status,
      cause: error.cause,
    }
  },
}

export const genericAdapter: ErrorAdapter = {
  name: 'generic',
  match: () => true,
  extract: (error) => ({
    code:
      typeof error?.code === 'string'
        ? error.code
        : typeof error?.name === 'string' &&
            error.name !== 'Error' &&
            error.name.endsWith('Error')
          ? error.name
          : undefined,
    cause: error?.cause,
  }),
}
