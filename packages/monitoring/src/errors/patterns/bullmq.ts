import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/taskforcesh/bullmq/blob/master/src/classes/finished-errors.ts (Lua script error codes and messages)
// - https://github.com/taskforcesh/bullmq/tree/master/src/classes (worker, job, queue and connection checks; error classes)
// - https://docs.bullmq.io/guide/workers/stalled-jobs (stalled jobs and lock renewal)
// - https://docs.bullmq.io/guide/jobs/job-ids (custom job id rules)
// - https://docs.bullmq.io/patterns/process-step-jobs (DelayedError, WaitingChildrenError, WaitingError)
// - https://docs.bullmq.io/guide/rate-limiting (Worker.RateLimitError)
// - https://docs.bullmq.io/patterns/stop-retrying-jobs (UnrecoverableError)
/** `… for job 123. moveToFinished` → the script command that failed. */
const JOB_COMMAND = /\. (\w+)(?: from \w+)?$/

// BullMQ: Lua script errors (scripts.ts finishedErrors), worker and job
// errors, and the control-flow errors a processor may throw on purpose.
export const bullmqPatterns: ErrorPattern[] = [
  {
    key: 'BULLMQ_MISSING_LOCK',
    messageMatch: /^Missing lock for job/,
    hint: 'Job lock lost',
    detail:
      'The worker lost the job lock, usually because processing blocked the event loop longer than lockDuration. The job may run twice.',
    howToFix:
      'Split long synchronous work in the processor, await between chunks, or raise lockDuration.',
    category: 'bug',
    explain: ({ message }) => {
      const step = message.match(JOB_COMMAND)?.[1]
      return {
        target: step,
        detail:
          'Long synchronous work in the processor (big loops, Excel/PDF building) starved lock renewal.',
        howToFix: 'Split the job, await between chunks, or raise lockDuration.',
      }
    },
  },
  {
    key: 'BULLMQ_LOCK_MISMATCH',
    messageMatch: /^Lock mismatch for job/,
    hint: 'Job lock held by other worker',
    detail:
      'Another worker holds the lock: the job stalled here and was picked up again elsewhere. This worker was too slow or paused (GC, event loop block).',
    howToFix:
      'Keep the processor from blocking the event loop longer than lockDuration, or raise lockDuration.',
    category: 'bug',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_LOCK_RENEW_FAILED',
    messageMatch: /^could not renew lock for job/,
    hint: 'Job lock renewal failed',
    detail:
      'The lock extend failed: the lock had expired, another worker took the job, or the Redis call errored. The job may be marked stalled and retried.',
    howToFix:
      'Check that Redis is reachable and that the processor does not block the event loop longer than lockDuration.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BULLMQ_STALLED_LIMIT',
    messageMatch: /job stalled more than allowable limit/,
    hint: 'Worker died repeatedly on job',
    detail:
      'The job stalled more than maxStalledCount times: its worker crashed, or blocked the event loop so long that the lock was not renewed.',
    howToFix:
      'Check the worker logs for crashes or OOM on this job, and split long synchronous work in the processor.',
  },
  {
    key: 'BULLMQ_JOB_NOT_EXIST',
    messageMatch: /^Missing key for job/,
    hint: 'Job no longer exists',
    detail:
      'The job key is gone from Redis: removed by removeOnComplete/Fail, a manual clean, or a Redis flush, while a worker still held it.',
    howToFix:
      'Check the removeOnComplete/removeOnFail settings and any clean or flush that runs while workers still hold jobs.',
    category: 'data',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_PARENT_NOT_EXIST',
    messageMatch: /^Missing key for parent job/,
    hint: 'Parent job missing',
    detail:
      'A child job was added (or its parent dependency removed) but the parent job key no longer exists in Redis.',
    howToFix:
      'Check that the parent job still exists when children are added, and do not remove or clean parents while their flow runs.',
    category: 'data',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_JOB_NOT_IN_STATE',
    messageMatch: /^Job \S+ is not in the \w+ state/,
    hint: 'Job in unexpected state',
    detail:
      'The operation needs the job in another state (see target), e.g. moveToCompleted on a job no longer active: it stalled and was retried, or was removed.',
    howToFix:
      'Check for duplicate processing by another worker or a manual action on the job.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(/is not in the (\w+) state\. (\w+)/)
      return found
        ? {
            target: `${found[2]} needs ${found[1]}`,
            detail: `${found[2]} expected the job in "${found[1]}". Another worker or a manual action already moved it.`,
            howToFix: 'Check for duplicate processing.',
          }
        : undefined
    },
  },
  {
    key: 'BULLMQ_PENDING_DEPENDENCIES',
    messageMatch: /^Job \S+ has pending dependencies/,
    hint: 'Job has unfinished children',
    detail:
      'A flow parent was moved to completed while children are still pending.',
    howToFix:
      'Let the flow finish, or throw WaitingChildrenError from the processor.',
    category: 'bug',
    target: JOB_COMMAND,
  },
  {
    key: 'BULLMQ_JOB_LOCKED_REMOVE',
    messageMatch: /could not be removed because it is locked by another worker/,
    hint: 'Job locked, cannot remove',
    detail: 'job.remove() ran while a worker is processing it.',
    howToFix:
      'Wait for the job to finish, or use moveToFailed from the worker.',
    level: 'warn',
  },
  {
    key: 'BULLMQ_SIZE_LIMIT',
    messageMatch: /^The size of job .* exceeds the limit/,
    hint: 'Job payload too large',
    detail: 'The job data exceeds sizeLimit.',
    howToFix: 'Store the payload (S3, DB) and pass a reference in the job.',
    category: 'bug',
    target: /^The size of job (\S+) exceeds/,
  },
  {
    key: 'BULLMQ_INVALID_JOB_ID',
    messageMatch:
      /^(JobId cannot be '0' or start with 0:|Custom Ids cannot be integers)/,
    hint: 'Invalid custom job id',
    detail:
      'BullMQ rejects custom ids made only of digits, and the id "0" or ids starting with "0:".',
    howToFix:
      'Prefix the id with text and separate with "-" or "_", never ":" (e.g. "exam-123").',
    category: 'bug',
  },
  {
    key: 'BULLMQ_INVALID_PRIORITY',
    messageMatch: /^Priority should (be between|not be float)/,
    hint: 'Invalid job priority',
    detail: 'The job priority is a float or outside the allowed range.',
    howToFix: 'Set priority to an integer within the allowed range.',
    category: 'bug',
  },
  {
    key: 'BULLMQ_DELAY_WITH_REPEAT',
    messageMatch: /^Delay and repeat options could not be used together/,
    hint: 'delay and repeat both set',
    detail:
      'A job was added with both delay and repeat (without repeat.count), which BullMQ rejects.',
    howToFix: 'Use only one of delay and repeat.',
    category: 'bug',
  },
  {
    key: 'BULLMQ_NO_PROCESSOR',
    messageMatch: /^No process function is defined/,
    hint: 'Worker has no processor',
    detail: 'The Worker was created without a processor function or file.',
    howToFix: 'Check the WorkerHost registration.',
    category: 'bug',
  },
  {
    key: 'BULLMQ_PROCESSOR_FILE_MISSING',
    messageMatch:
      /^(File .* does not exist|URL .* does not exist in the local file system|No function is exported in processor file)/,
    hint: 'Sandboxed processor missing',
    detail:
      'The sandboxed processor file is not at the given path (".js" is added when there is no extension), or it does not export a function.',
    howToFix:
      'Check the compiled path the Worker receives, and that the file exports the processor function as default.',
    category: 'config',
  },
  {
    key: 'BULLMQ_WORKER_NO_CONNECTION',
    messageMatch: /^Worker requires a connection/,
    hint: 'Worker has no Redis connection',
    detail: 'The Worker was created without a connection option.',
    howToFix: 'Pass the shared Redis connection.',
    category: 'config',
  },
  {
    key: 'BULLMQ_IOREDIS_PREFIX',
    messageMatch: /^BullMQ: ioredis does not support ioredis prefixes/,
    hint: 'keyPrefix on BullMQ connection',
    detail: 'The ioredis client passed to BullMQ has keyPrefix set.',
    howToFix: 'Use the BullMQ prefix option instead.',
    category: 'config',
  },
  {
    key: 'BULLMQ_REDIS_VERSION',
    messageMatch: /^Redis version needs to be greater or equal than/,
    hint: 'Redis too old for BullMQ',
    detail: 'The Redis server is below the version BullMQ needs.',
    howToFix: 'Upgrade Redis.',
    category: 'config',
  },
  {
    key: 'BULLMQ_MOVE_TO_FAILED',
    messageMatch: /^Error "moveToFailed" with command/,
    hint: 'Could not mark job failed',
    detail:
      'A Redis command in the transaction that records the failure (retry, delay or fail) returned an error. The job may be retried as stalled.',
    howToFix:
      'Read the inner error in the message for the Redis cause (e.g. OOM, a script error) and fix that.',
    category: 'dependency',
  },
  {
    key: 'BULLMQ_WORKER_CLOSING',
    messageMatch:
      /^(Worker is closing|Queue is closed|Connection is closed\.?$)/,
    hint: 'Queue closing',
    detail:
      'A queue/worker operation ran during shutdown after close(). Usually harmless.',
    howToFix: 'Stop producing jobs before closing.',
  },
  {
    key: 'UnrecoverableError',
    hint: 'Job failed permanently',
    detail:
      'The processor threw UnrecoverableError: the job fails at once without retries. The message says why.',
    howToFix:
      'Fix the cause the message names, then add the job again if it is still needed.',
    level: 'warn',
    category: 'input',
  },
  {
    key: 'RateLimitError',
    hint: 'Job rate limited',
    detail:
      'The processor hit a rate limit and moved the job back to wait (Worker.RateLimitError).',
    howToFix:
      'Not a failure; no action needed. It runs again after the limit window.',
    level: 'warn',
    retryable: true,
  },
  {
    key: 'DelayedError',
    hint: 'Job delayed by processor',
    detail:
      'The processor moved the job to delayed (moveToDelayed) and threw DelayedError to stop.',
    howToFix: 'Not a failure; no action needed.',
    level: 'warn',
  },
  {
    key: 'WaitingChildrenError',
    hint: 'Job waiting for children',
    detail:
      'The processor moved the job to waiting-children and threw WaitingChildrenError.',
    howToFix:
      'Not a failure; no action needed. It resumes when the children finish.',
    level: 'warn',
  },
  {
    key: 'WaitingError',
    hint: 'Job moved back to wait',
    detail:
      'The processor moved the job back to waiting (moveToWait) and threw WaitingError.',
    howToFix: 'Not a failure; no action needed.',
    level: 'warn',
  },
  {
    key: 'KeyedConcurrencyLimiterBusyError',
    hint: 'Concurrency limit reached',
    detail:
      'Too many tasks for the same key: its wait queue was full, or the wait for a free slot timed out.',
    howToFix: 'Retry later.',
    level: 'warn',
    retryable: true,
  },
]
