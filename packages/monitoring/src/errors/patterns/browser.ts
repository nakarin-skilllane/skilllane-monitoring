import type { ErrorPattern } from './types'

// Headless Chrome via Puppeteer / Playwright (PDF and screenshot jobs).
export const browserPatterns: ErrorPattern[] = [
  {
    key: 'BROWSER_NAVIGATION_TIMEOUT',
    messageMatch:
      /^(Navigation timeout of \d+ ms exceeded|Timeout \d+ms exceeded\.|page\.goto: Timeout)/,
    hint: 'Page load timed out',
    hintDetail:
      'The page did not reach the wait condition in time: slow assets, a networkidle wait that never settles, or the URL is unreachable from the pod.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BROWSER_TARGET_CLOSED',
    messageMatch:
      /Target closed|Session closed|Target page, context or browser has been closed|browser has disconnected/i,
    hint: 'Browser tab closed',
    hintDetail:
      'Chrome closed the page mid-operation: the browser crashed (out of memory in the container) or was closed by another job. Check memory limits and page lifecycle.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BROWSER_PROTOCOL_ERROR',
    messageMatch: /^Protocol error \(/,
    hint: 'Browser protocol error',
    hintDetail:
      'The DevTools protocol call failed (see message): the page navigated away, a detached frame, or Chrome crashed.',
    category: 'dependency',
    retryable: true,
  },
  {
    key: 'BROWSER_NOT_FOUND',
    messageMatch:
      /Could not find (Chrome|Chromium|browser|expected browser)|Failed to launch the browser process|Executable doesn't exist/i,
    hint: 'Chrome not installed',
    hintDetail:
      'Puppeteer/Playwright could not launch Chrome: the browser is not in the image, or executablePath / PUPPETEER_CACHE_DIR is wrong. Install it in the Dockerfile.',
    category: 'config',
  },
  {
    key: 'BROWSER_NET_ERROR',
    messageMatch: /net::ERR_[A-Z_]+/,
    hint: 'Browser network error',
    hintDetail:
      'Chrome could not load the URL (see target): DNS, TLS, a blocked host, or a server down. The page URL must be reachable from the pod.',
    category: 'dependency',
    target: /(net::ERR_[A-Z_]+)/,
    retryable: true,
  },
  {
    key: 'BROWSER_NO_NODE',
    messageMatch:
      /^(No node found for selector|No element found for selector|Waiting for selector .* failed|waiting for (selector|locator))/,
    hint: 'Element not found on page',
    hintDetail:
      'The selector matched nothing before the timeout (see target). The page markup changed or did not finish rendering.',
    category: 'bug',
    target: /selector[:\s]+["`']?([^"`'\s]+)/,
  },
  {
    key: 'BROWSER_EXECUTION_CONTEXT',
    messageMatch:
      /^Execution context was destroyed|^Cannot find context with specified id/,
    hint: 'Page navigated mid-script',
    hintDetail:
      'page.evaluate ran while the page navigated. Wait for navigation before evaluating.',
    category: 'bug',
    retryable: true,
  },
]
