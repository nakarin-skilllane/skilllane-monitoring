import type { ErrorPattern } from './types'

export const bullmqPatterns: ErrorPattern[] = [
  {
    key: 'BULLMQ_MISSING_LOCK',
    messageMatch: /^Missing lock for job/,
    hint: 'Job lock lost',
    hintDetail:
      'The worker lost the job lock, usually because processing blocked the event loop longer than lockDuration. The job may run twice.',
    category: 'bug',
    explain: ({ message }) => {
      const step = message.match(/\. (\w+)$/)?.[1]
      return {
        target: step,
        fix: 'Long synchronous work in the processor (big loops, Excel/PDF building) starved lock renewal. Split the job, await between chunks, or raise lockDuration.',
      }
    },
  },
  {
    key: 'BULLMQ_STALLED_LIMIT',
    messageMatch: /job stalled more than allowable limit/,
    hint: 'Worker died repeatedly on job',
    hintDetail:
      'The job stalled more than maxStalledCount times. The worker probably crashed or ran out of memory while processing it.',
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
