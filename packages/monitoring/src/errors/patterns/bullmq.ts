import type { ErrorPattern } from './types'

/** `… for job 123. moveToFinished` → the script command that failed. */
const JOB_COMMAND = /\. (\w+)(?: from \w+)?$/

// BullMQ: Lua script errors (scripts.ts finishedErrors), worker and job
// errors, and the control-flow errors a processor may throw on purpose.
export const bullmqPatterns: ErrorPattern[] = [
  {
    key: 'BULLMQ_MISSING_LOCK',
    messageMatch: /^Missing lock for job/,
    hint: 'Job lock lost',
    hintDetail:
      'The worker lost the job lock, usually because processing blocked the event loop longer than lockDuration. The job may run twice.',
    category: 'bug',
    explain: ({ message }) => {
      const step = message.match(JOB_COMMAND)?.[1]
      return {
        target: step,
        fix: 'Long synchronous work in the processor (big loops, Excel/PDF building) starved lock renewal. Split the job, await between chunks, or raise lockDuration.',
      }
    },
  },
  {
    key: 'BULLMQ_LOCK_MISMATCH',
    messageMatch: /^Lock mismatch for job/,
    hint: 'Job lock held by other worker',
    hintDetail:
      'Another worker holds the lock: the job stalled here and was picked up again elsewhere. This worker was too slow or paused (GC, event loop block).',
    category: 'bug',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_LOCK_RENEW_FAILED',
    messageMatch: /^could not renew lock for job/,
    hint: 'Job lock renewal failed',
    hintDetail:
      'The lock extend command failed: Redis was unreachable or the lock already expired. The job may be marked stalled and retried.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BULLMQ_STALLED_LIMIT',
    messageMatch: /job stalled more than allowable limit/,
    hint: 'Worker died repeatedly on job',
    hintDetail:
      'The job stalled more than maxStalledCount times. The worker probably crashed or ran out of memory while processing it.',
  },
  {
    key: 'BULLMQ_JOB_NOT_EXIST',
    messageMatch: /^Missing key for job/,
    hint: 'Job no longer exists',
    hintDetail:
      'The job key is gone from Redis: removed by removeOnComplete/Fail, a manual clean, or a Redis flush, while a worker still held it.',
    category: 'data',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_PARENT_NOT_EXIST',
    messageMatch: /^Missing key for parent job/,
    hint: 'Parent job missing',
    hintDetail:
      'A flow child finished but its parent job was removed. Keep parents until children complete (removeOnComplete on the parent).',
    category: 'data',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_JOB_NOT_IN_STATE',
    messageMatch: /^Job \S+ is not in the \w+ state/,
    hint: 'Job in unexpected state',
    hintDetail:
      'The operation needs the job in another state (see target), e.g. moveToCompleted on a job no longer active: it stalled and was retried, or was removed.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(/is not in the (\w+) state\. (\w+)/)
      return found
        ? {
            target: `${found[2]} needs ${found[1]}`,
            fix: `${found[2]} expected the job in "${found[1]}". Another worker or a manual action already moved it; check for duplicate processing.`,
          }
        : undefined
    },
  },
  {
    key: 'BULLMQ_PENDING_DEPENDENCIES',
    messageMatch: /^Job \S+ has pending dependencies/,
    hint: 'Job has unfinished children',
    hintDetail:
      'A flow parent was moved to completed while children are still pending. Let the flow finish, or throw WaitingChildrenError from the processor.',
    category: 'bug',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_JOB_LOCKED_REMOVE',
    messageMatch: /could not be removed because it is locked by another worker/,
    hint: 'Job locked, cannot remove',
    hintDetail:
      'job.remove() ran while a worker is processing it. Wait for it to finish, or use moveToFailed from the worker.',
    level: 'warn',
  },
  {
    key: 'BULLMQ_SIZE_LIMIT',
    messageMatch: /^The size of job .* exceeds the limit/,
    hint: 'Job payload too large',
    hintDetail:
      'The job data exceeds sizeLimit. Store the payload (S3, DB) and pass a reference in the job.',
    category: 'bug',
    target: /^The size of job (\S+) exceeds/,
  },
  {
    key: 'BULLMQ_INVALID_JOB_ID',
    messageMatch:
      /^(JobId cannot be '0' or start with 0:|Custom Ids cannot be integers)/,
    hint: 'Invalid custom job id',
    hintDetail:
      'BullMQ rejects integer-like custom ids and ids starting with 0. Prefix the id (e.g. "exam:123").',
    category: 'bug',
  },
  {
    key: 'BULLMQ_INVALID_PRIORITY',
    messageMatch: /^Priority should (be between|not be float)/,
    hint: 'Invalid job priority',
    hintDetail: 'Priority must be an integer within the allowed range.',
    category: 'bug',
  },
  {
    key: 'BULLMQ_DELAY_WITH_REPEAT',
    messageMatch: /^Delay and repeat options could not be used together/,
    hint: 'delay and repeat both set',
    hintDetail: 'A job cannot have both delay and repeat. Use one.',
    category: 'bug',
  },
  {
    key: 'BULLMQ_NO_PROCESSOR',
    messageMatch: /^No process function is defined/,
    hint: 'Worker has no processor',
    hintDetail:
      'The Worker was created without a processor function or file. Check the WorkerHost registration.',
    category: 'bug',
  },
  {
    key: 'BULLMQ_PROCESSOR_FILE_MISSING',
    messageMatch:
      /^(File .* does not exist|URL .* does not exist in the local file system|No function is exported in processor file)/,
    hint: 'Sandboxed processor missing',
    hintDetail:
      'The sandboxed processor file is not in the build output or exports nothing. Check the path after compilation.',
    category: 'config',
  },
  {
    key: 'BULLMQ_WORKER_NO_CONNECTION',
    messageMatch: /^Worker requires a connection/,
    hint: 'Worker has no Redis connection',
    hintDetail:
      'The Worker was created without a connection option. Pass the shared Redis connection.',
    category: 'config',
  },
  {
    key: 'BULLMQ_IOREDIS_PREFIX',
    messageMatch: /^BullMQ: ioredis does not support ioredis prefixes/,
    hint: 'keyPrefix on BullMQ connection',
    hintDetail:
      'The ioredis client passed to BullMQ has keyPrefix set. Use the BullMQ prefix option instead.',
    category: 'config',
  },
  {
    key: 'BULLMQ_REDIS_VERSION',
    messageMatch: /^Redis version needs to be greater or equal than/,
    hint: 'Redis too old for BullMQ',
    hintDetail:
      'The Redis server is below the version BullMQ needs. Upgrade Redis.',
    category: 'config',
  },
  {
    key: 'BULLMQ_MOVE_TO_FAILED',
    messageMatch: /^Error "moveToFailed" with command/,
    hint: 'Could not mark job failed',
    hintDetail:
      'Recording the failure in Redis failed (see the inner error): Redis down, or the job/lock vanished. The job may be retried as stalled.',
    category: 'dependency',
  },
  {
    key: 'BULLMQ_WORKER_CLOSING',
    messageMatch:
      /^(Worker is closing|Queue is closed|Connection is closed\.?$)/,
    hint: 'Queue closing',
    hintDetail:
      'A queue/worker operation ran during shutdown after close(). Usually harmless; stop producing jobs before closing.',
  },
  {
    key: 'UnrecoverableError',
    hint: 'Job failed permanently',
    hintDetail:
      'The processor threw UnrecoverableError: the job fails at once without retries. The message says why.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'RateLimitError',
    hint: 'Job rate limited',
    hintDetail:
      'The processor hit a rate limit and moved the job back to wait (Worker.RateLimitError). Not a failure; it runs again after the limit window.',
    level: 'warn',
    retryable: true,
  },
  {
    key: 'DelayedError',
    hint: 'Job delayed by processor',
    hintDetail:
      'The processor moved the job to delayed (moveToDelayed) and threw DelayedError to stop. Not a failure.',
    level: 'warn',
  },
  {
    key: 'WaitingChildrenError',
    hint: 'Job waiting for children',
    hintDetail:
      'The processor moved the job to waiting-children and threw WaitingChildrenError. Not a failure; it resumes when the children finish.',
    level: 'warn',
  },
  {
    key: 'WaitingError',
    hint: 'Job moved back to wait',
    hintDetail:
      'The processor moved the job back to waiting (moveToWait) and threw WaitingError. Not a failure.',
    level: 'warn',
  },
  {
    key: 'KeyedConcurrencyLimiterBusyError',
    hint: 'Concurrency limit reached',
    hintDetail:
      'Another task with the same key is still running, so this one was rejected. Retry later.',
    level: 'warn',
    retryable: true,
  },
]
