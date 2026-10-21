import { redisCommand } from '../contract'
import { captureSettings } from './settings'

/**
 * `dbStatementSerializer` for ioredis / redis: the whole command with every
 * argument (the default keeps only the key of SET, HSET …), masked and quoted
 * the way redis-cli reads it (shared rules, skilllane-monitoring-contract src/mask/redis.ts):
 * AUTH / HELLO AUTH / MIGRATE AUTH / CONFIG SET / ACL credentials, a key whose
 * prefix segment is a secret (`session:[REDACTED]`), values stored under a
 * sensitive key, hash or stream field, EVAL arguments of a script touching a
 * sensitive key, JSON values by key, every string by the value rule; binary
 * arguments become `<N bytes>`. At most LOG_BODY_MAX_BYTES is looked at:
 * arguments are cut to the room left before they are masked.
 */
export function redisStatement(
  cmdName: string,
  cmdArgs: unknown[] = [],
): string {
  try {
    return redisCommand(cmdName, cmdArgs, captureSettings().maxBytes)
  } catch {
    return String(cmdName)
  }
}
