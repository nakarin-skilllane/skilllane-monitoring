import { appPatterns } from './app'
import { browserPatterns } from './browser'
import { bullmqPatterns } from './bullmq'
import { fetchPatterns } from './fetch'
import { googlePatterns } from './google'
import { httpPatterns } from './http'
import { httpBodyPatterns } from './http-body'
import { kafkaPatterns } from './kafka'
import { ldapPatterns } from './ldap'
import { mongodbPatterns } from './mongodb'
import { mysqlPatterns } from './mysql'
import { nestCorePatterns } from './nest-core'
import { nestHttpPatterns } from './nest-http'
import { nodeCorePatterns } from './node-core'
import { nodeHttpPatterns } from './node-http'
import { nodeNetPatterns } from './node-net'
import { nodeTlsPatterns } from './node-tls'
import { oraclePatterns } from './oracle'
import { postgresPatterns } from './postgres'
import { rabbitmqPatterns } from './rabbitmq'
import { redisPatterns } from './redis'
import { runtimePatterns } from './runtime'
import { s3Patterns } from './s3'
import { smtpPatterns } from './smtp'
import { typeormPatterns } from './typeorm'
import type { ErrorPattern } from './types'

export * from './types'

// Order matters only for messageMatch: the first matching pattern wins, so
// library-specific messages come before the generic Node/V8 ones.
export const ALL_PATTERNS: readonly ErrorPattern[] = [
  ...oraclePatterns,
  ...postgresPatterns,
  ...mysqlPatterns,
  ...mongodbPatterns,
  ...typeormPatterns,
  ...redisPatterns,
  ...bullmqPatterns,
  ...kafkaPatterns,
  ...rabbitmqPatterns,
  ...httpPatterns,
  ...fetchPatterns,
  ...ldapPatterns,
  ...googlePatterns,
  ...s3Patterns,
  ...smtpPatterns,
  ...nestHttpPatterns,
  ...nestCorePatterns,
  ...httpBodyPatterns,
  ...browserPatterns,
  ...appPatterns,
  ...nodeNetPatterns,
  ...nodeTlsPatterns,
  ...nodeHttpPatterns,
  ...nodeCorePatterns,
  ...runtimePatterns,
]
