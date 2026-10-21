import {
  aggregateAdapter,
  amqpAdapter,
  awsAdapter,
  axiosAdapter,
  bodyParserAdapter,
  fetchAdapter,
  gaxiosAdapter,
  genericAdapter,
  ioredisAdapter,
  jwtAdapter,
  kafkaAdapter,
  ldapAdapter,
  mongoAdapter,
  nestAdapter,
  nodemailerAdapter,
} from './libraries'
import { oracleAdapter } from './oracle'
import type { ErrorAdapter } from './types'

export * from './types'

/** Asked in order, most specific first; `generic` always matches. */
export const ERROR_ADAPTERS: readonly ErrorAdapter[] = [
  oracleAdapter,
  aggregateAdapter,
  ioredisAdapter,
  kafkaAdapter,
  gaxiosAdapter,
  axiosAdapter,
  fetchAdapter,
  awsAdapter,
  amqpAdapter,
  nodemailerAdapter,
  jwtAdapter,
  ldapAdapter,
  mongoAdapter,
  bodyParserAdapter,
  nestAdapter,
  genericAdapter,
]
