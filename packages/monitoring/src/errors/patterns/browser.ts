import type { ErrorPattern } from './types'

// Sources:
// - https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/node/BrowserLauncher.ts (Puppeteer launch errors)
// - https://github.com/puppeteer/puppeteer/blob/main/packages/puppeteer-core/src/cdp/ExecutionContext.ts (execution context errors)
// - https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/progress.ts (Playwright timeouts)
// - https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/errors.ts (Playwright target closed)
// - https://raw.githubusercontent.com/chromium/chromium/main/net/base/net_error_list.h (Chrome net::ERR_ codes)

// Headless Chrome via Puppeteer / Playwright (PDF and screenshot jobs).
export const browserPatterns: ErrorPattern[] = [
  {
    key: 'BROWSER_NAVIGATION_TIMEOUT',
    messageMatch:
      /^(Navigation timeout of \d+ ms exceeded|Timeout \d+ms exceeded\.|page\.goto: Timeout)/,
    hint: 'Page load timed out',
    detail:
      'A page load or browser action did not finish in time: slow assets, a networkidle wait that never settles, or the URL is unreachable from the pod.',
    howToFix:
      'Check the URL is reachable from the pod, and wait for a condition that settles, such as load.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BROWSER_TARGET_CLOSED',
    messageMatch:
      /Target closed|Session closed|Target page, context or browser has been closed|browser has disconnected/i,
    hint: 'Browser tab closed',
    detail:
      'Chrome closed the page mid-operation: the browser crashed (out of memory in the container) or was closed by another job.',
    howToFix: 'Check memory limits and page lifecycle.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BROWSER_PROTOCOL_ERROR',
    messageMatch: /^Protocol error \(/,
    hint: 'Browser protocol error',
    detail:
      'The DevTools protocol call failed (see message): the page navigated away, a detached frame, or Chrome crashed.',
    howToFix: 'Wait for navigation to finish before the call, and retry.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BROWSER_NOT_FOUND',
    messageMatch:
      /Could not find (Chrome|Chromium|browser|expected browser)|Failed to launch the browser process|Executable doesn't exist/i,
    hint: 'Chrome not installed',
    detail:
      'Puppeteer/Playwright could not start Chrome: it is not in the image, executablePath or the cache dir is wrong, or Chrome exited at launch.',
    howToFix:
      'Install the browser and its system libraries in the Dockerfile, and check executablePath and the cache dir.',
    category: 'config',
  },
  {
    key: 'BROWSER_NET_ERROR',
    messageMatch: /net::ERR_[A-Z_]+/,
    hint: 'Browser network error',
    detail:
      'Chrome could not load the URL (see target): DNS, TLS, a blocked host, or a server down.',
    howToFix: 'Make sure the page URL is reachable from the pod.',
    category: 'dependency',
    target: /(net::ERR_[A-Z_]+)/,
    retryable: true,
  },
  {
    key: 'BROWSER_NO_NODE',
    messageMatch:
      /^(No node found for selector|No element found for selector|Waiting for selector .* failed|waiting for (selector|locator))/,
    hint: 'Element not found on page',
    detail:
      'The selector matched no element (see target), at once for click/type or within the wait timeout. The page markup changed or did not finish rendering.',
    howToFix:
      'Check the selector against the current markup, and wait for rendering to finish.',
    category: 'bug',
    target: /selector[:\s]+["`']?([^"`'\s]+)/,
  },
  {
    key: 'BROWSER_EXECUTION_CONTEXT',
    messageMatch:
      /^Execution context was destroyed|^Cannot find context with specified id/,
    hint: 'Page navigated mid-script',
    detail: 'page.evaluate ran while the page navigated.',
    howToFix: 'Wait for navigation before evaluating.',
    category: 'bug',
    retryable: true,
  },
]
