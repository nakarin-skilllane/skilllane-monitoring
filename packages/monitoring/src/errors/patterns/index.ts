import { appPatterns } from './app'
import { bullmqPatterns } from './bullmq'
import { googlePatterns } from './google'
import { httpPatterns } from './http'
import { kafkaPatterns } from './kafka'
import { nestHttpPatterns } from './nest-http'
import { nodeNetPatterns } from './node-net'
import { oraclePatterns } from './oracle'
import { rabbitmqPatterns } from './rabbitmq'
import { redisPatterns } from './redis'
import { runtimePatterns } from './runtime'
import { typeormPatterns } from './typeorm'
import { s3Patterns } from './s3'
import { smtpPatterns } from './smtp'
import type { ErrorPattern } from './types'

export * from './types'

export const ALL_PATTERNS: readonly ErrorPattern[] = [
  ...oraclePatterns,
  ...typeormPatterns,
  ...nodeNetPatterns,
  ...redisPatterns,
  ...bullmqPatterns,
  ...kafkaPatterns,
  ...rabbitmqPatterns,
  ...httpPatterns,
  ...googlePatterns,
  ...s3Patterns,
  ...smtpPatterns,
  ...nestHttpPatterns,
  ...appPatterns,
  ...runtimePatterns,
]
