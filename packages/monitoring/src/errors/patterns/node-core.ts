import type { ErrorPattern } from './types'

// Sources:
// - https://nodejs.org/api/errors.html (Node.js error codes: ERR_*, ABORT_ERR, MODULE_NOT_FOUND)
// - https://github.com/nodejs/node/tree/main/lib/internal (where each ERR_* code is thrown)
// - https://github.com/nodejs/node/blob/main/lib/internal/process/promises.js (UnhandledPromiseRejection)
// - https://nodejs.org/api/buffer.html (buffer.constants max lengths)
// - https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static (AbortError, TimeoutError)

// Node.js internal ERR_* codes: argument validation, modules, workers,
// child processes, encoding (nodejs.org/api/errors.html).
export const nodeCorePatterns: ErrorPattern[] = [
  {
    key: 'ERR_INVALID_ARG_TYPE',
    hint: 'Wrong argument type',
    detail:
      'A Node API got an argument of the wrong type (see target), often undefined from a missing env var or an unloaded field.',
    howToFix:
      'Check where the value comes from (env, DTO, query result) and pass the expected type.',
    category: 'bug',
    target: /^The "([^"]+)" (?:argument|property|option)/,
    explain: ({ message }) => {
      const found = message.match(
        /^The "([^"]+)" (?:argument|property|option) must be (?:of type |an instance of |one of type )?([^.]+)\. Received (.+)$/,
      )
      if (!found) return undefined
      return {
        target: found[1],
        detail: `"${found[1]}" must be ${found[2]} but was ${found[3].slice(0, 60)}.`,
        howToFix: `Check where "${found[1]}" comes from (env, DTO, query result).`,
      }
    },
  },
  {
    key: 'ERR_INVALID_ARG_VALUE',
    hint: 'Invalid argument value',
    detail:
      'A Node API rejected an argument value (see target): empty string, wrong format or unsupported option.',
    howToFix:
      'Check the value passed to the Node API and use a supported format or option.',
    category: 'bug',
    target: /^The (?:argument|property|option) '([^']+)'/,
  },
  {
    key: 'ERR_OUT_OF_RANGE',
    hint: 'Value out of range',
    detail:
      'A numeric argument is outside the allowed range (see target): a negative offset, a size above the limit or a huge buffer.',
    howToFix: 'Validate or clamp the value before the call.',
    category: 'bug',
    target: /^The value of "([^"]+)"/,
  },
  {
    key: 'ERR_MISSING_ARGS',
    hint: 'Required argument missing',
    detail: 'A Node API was called without a required argument (see target).',
    howToFix:
      'Pass the required argument and check it is defined at the call site.',
    category: 'bug',
    target: /^The "([^"]+)" argument/,
  },
  {
    key: 'ERR_STRING_TOO_LONG',
    hint: 'String too long for V8',
    detail:
      'A string would exceed the V8 maximum length (buffer.constants.MAX_STRING_LENGTH, about 2^29 UTF-16 units): a huge JSON.stringify or a big file read as text.',
    howToFix: 'Stream it or paginate.',
    category: 'bug',
  },
  {
    key: 'ERR_BUFFER_OUT_OF_BOUNDS',
    hint: 'Buffer read out of bounds',
    detail:
      'A read/write went outside the Buffer: a truncated binary payload or a wrong offset calculation.',
    howToFix:
      'Check the payload length before reading, and the offset calculation.',
    category: 'bug',
  },
  {
    key: 'ERR_BUFFER_TOO_LARGE',
    hint: 'Buffer too large',
    detail: 'A Buffer bigger than the Node maximum was requested.',
    howToFix: 'Stream the data instead of loading it all.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_STATE',
    hint: 'Invalid object state',
    detail:
      'An operation ran on an object in the wrong state (stream locked, reader released, controller closed).',
    howToFix:
      'Check the object state before the call, and do not reuse a locked, released or closed object.',
    category: 'bug',
  },
  {
    key: 'ERR_USE_AFTER_CLOSE',
    hint: 'Used after close',
    detail:
      'A readline interface was used after it had been closed, usually during shutdown.',
    howToFix:
      'Stop using the object once it is closed, for example by checking the shutdown state first.',
    category: 'bug',
  },
  {
    key: 'ERR_UNHANDLED_ERROR',
    hint: 'Unhandled error event',
    detail: 'An EventEmitter emitted "error" with no listener.',
    howToFix:
      'Attach an error handler to the stream, socket or client at the origin.',
    category: 'bug',
  },
  {
    key: 'ERR_UNHANDLED_REJECTION',
    hint: 'Unhandled promise rejection',
    detail: 'A promise rejected with a non-Error value and nothing caught it.',
    howToFix:
      'Find the missing await or .catch at the origin, and reject with an Error object so the stack trace is kept.',
    category: 'bug',
  },
  {
    key: 'UnhandledPromiseRejection',
    hint: 'Unhandled promise rejection',
    detail:
      'A promise rejected with a non-Error value and nothing caught it; Node exits the process by default.',
    howToFix:
      'Find the missing await or .catch at the origin, and reject with an Error object so the stack trace is kept.',
    category: 'bug',
  },
  {
    key: 'ERR_MULTIPLE_CALLBACK',
    hint: 'Callback called twice',
    detail:
      'A stream callback (of _write, _transform, _final or destroy) was called more than once, e.g. in both try and catch of a custom stream.',
    howToFix: 'Make sure the callback is called exactly once on every path.',
    category: 'bug',
  },
  {
    key: 'ERR_ASSERTION',
    hint: 'Assertion failed',
    detail:
      'An assert() in our code failed (see message). The invariant it protects does not hold.',
    howToFix: 'Find where the invariant is broken before the assert runs.',
    category: 'bug',
  },
  {
    key: 'ERR_METHOD_NOT_IMPLEMENTED',
    hint: 'Method not implemented',
    detail:
      'A required method (_read, _write, _transform) is missing on a custom stream or class.',
    howToFix: 'Implement the missing method on the custom stream or class.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_RETURN_VALUE',
    hint: 'Wrong return value',
    detail:
      'A callback or option returned the wrong type (e.g. a promise was expected).',
    howToFix: 'Return the type the API expects from the callback or option.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_THIS',
    hint: 'Method called unbound',
    detail:
      'A method was called with the wrong "this": it was passed as a callback without bind or an arrow function.',
    howToFix:
      'Bind the method or wrap it in an arrow function before passing it as a callback.',
    category: 'bug',
  },
  {
    key: 'ERR_ILLEGAL_CONSTRUCTOR',
    hint: 'Illegal constructor',
    detail:
      'new was used on a class that cannot be constructed directly (e.g. AbortSignal, CryptoKey, PerformanceEntry, web stream readers and controllers).',
    howToFix:
      'Use the API that creates the object instead of calling new on it.',
    category: 'bug',
  },
  {
    key: 'MODULE_NOT_FOUND',
    hint: 'Module not found',
    detail:
      'require() could not resolve a module (see target): a dependency missing from package.json, a wrong relative path, or a file not in the build output.',
    howToFix:
      'Add the dependency to package.json, fix the path, or check the file is in the build output.',
    category: 'config',
    target: /Cannot find module '([^']+)'/,
  },
  {
    key: 'ERR_MODULE_NOT_FOUND',
    hint: 'ES module not found',
    detail:
      'import could not resolve a module (see target): missing dependency, wrong path or a missing file extension in ESM.',
    howToFix:
      'Install the dependency, fix the path, or add the file extension to the import.',
    category: 'config',
    target: /Cannot find (?:module|package) '([^']+)'/,
  },
  {
    key: 'ERR_REQUIRE_ESM',
    hint: 'require() of ES module',
    detail:
      'A CommonJS require() loaded an ES module (see target); Node before 20.19 and 22.12 cannot require ES modules.',
    howToFix:
      'Upgrade Node to 20.19+ or 22.12+, use a dynamic import(), or pin the CommonJS version of the package.',
    category: 'config',
    target: /require\(\) of ES Module ([^\s]+)/,
  },
  {
    key: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    hint: 'Package subpath not exported',
    detail:
      'The imported subpath is not in the package "exports" map (see target).',
    howToFix: 'Import from the package root or the documented subpath.',
    category: 'config',
    target: /Package subpath '([^']+)'/,
  },
  {
    key: 'ERR_UNKNOWN_FILE_EXTENSION',
    hint: 'Unknown file extension',
    detail: 'Node cannot load this file type (e.g. .ts without a loader).',
    howToFix: 'Run the compiled JS or register a loader.',
    category: 'config',
  },
  {
    key: 'ERR_UNSUPPORTED_DIR_IMPORT',
    hint: 'Directory import in ESM',
    detail: 'ESM does not resolve a directory to index.js.',
    howToFix: 'Import the file explicitly.',
    category: 'config',
  },
  {
    key: 'ERR_IMPORT_ATTRIBUTE_MISSING',
    hint: 'JSON import attribute missing',
    detail:
      'A JSON file was imported in ESM without the JSON import attribute.',
    howToFix:
      'Importing JSON in ESM needs `with { type: "json" }`; add it to the import.',
    category: 'bug',
  },
  {
    key: 'ERR_DLOPEN_FAILED',
    hint: 'Native addon failed to load',
    detail:
      'A native module (.node) could not be loaded: built for another OS/arch/Node version, or a missing shared library.',
    howToFix: 'Rebuild the native module in the image.',
    category: 'config',
  },
  {
    key: 'ERR_WORKER_OUT_OF_MEMORY',
    hint: 'Worker out of memory',
    detail:
      'A worker thread hit its memory limit (resourceLimits). The task holds too much data.',
    howToFix: 'Chunk the data or raise the limit.',
    category: 'bug',
  },
  {
    key: 'ERR_WORKER_INIT_FAILED',
    hint: 'Worker failed to start',
    detail:
      'A worker thread could not start: the OS refused a new thread or event loop (errno in the message), or V8 could not create the isolate.',
    howToFix:
      'Check the errno in the message; it is usually a memory or thread limit, so run fewer workers at once or give the container more memory.',
  },
  {
    key: 'ERR_FS_FILE_TOO_LARGE',
    hint: 'File too large to read',
    detail: 'readFile cannot load files over 2 GiB.',
    howToFix: 'Stream the file instead.',
    category: 'bug',
  },
  {
    key: 'ERR_FS_EISDIR',
    hint: 'Path is a directory',
    detail: 'fs.rm or fs.cp got a directory without the recursive option.',
    howToFix:
      'Pass recursive: true if the whole directory is meant, or fix how the path is built.',
    category: 'bug',
  },
  {
    key: 'ERR_FS_CP_EEXIST',
    hint: 'Copy target exists',
    detail: 'fs.cp refused to overwrite an existing file.',
    howToFix: 'Pass force or remove it first.',
  },
  {
    key: 'ERR_UNKNOWN_ENCODING',
    hint: 'Unknown encoding',
    detail:
      'An encoding name Node does not know was used (e.g. "utf8mb4", "tis-620" via Buffer).',
    howToFix:
      'Use an encoding name Node supports (utf8, latin1, base64, hex); decode legacy charsets such as TIS-620 with iconv-lite.',
    category: 'bug',
  },
  {
    key: 'ERR_ENCODING_INVALID_ENCODED_DATA',
    hint: 'Invalid encoded bytes',
    detail:
      'TextDecoder (fatal) got bytes that are not valid for the encoding. The input is binary or another charset.',
    howToFix:
      'Check the charset of the source and decode with the matching encoding.',
    level: 'warn',
  },
  {
    key: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
    hint: 'Child output too large',
    detail: 'exec() output exceeded maxBuffer (1 MB default).',
    howToFix: 'Use spawn with streams, or raise maxBuffer.',
    category: 'bug',
  },
  {
    key: 'ERR_CHILD_CLOSED_BEFORE_REPLY',
    hint: 'Child process exited early',
    detail:
      'A child process closed before answering. It crashed or was killed (OOM).',
    howToFix: 'Check its stderr.',
  },
  {
    key: 'ERR_IPC_CHANNEL_CLOSED',
    hint: 'IPC channel closed',
    detail:
      'process.send was used after the parent/child IPC channel closed, usually during shutdown.',
    howToFix:
      'Check process.connected before process.send, and stop sending during shutdown.',
  },
  {
    key: 'ERR_IPC_DISCONNECTED',
    hint: 'IPC already disconnected',
    detail: 'disconnect() was called twice on the IPC channel.',
    howToFix: 'Call disconnect() once, or check process.connected first.',
    category: 'bug',
  },
  {
    key: 'ABORT_ERR',
    hint: 'Operation aborted',
    detail:
      'The operation was cancelled through an AbortSignal (timeout or caller cancel). Usually not an error by itself.',
    howToFix:
      'Check whether the timeout is too short; a caller cancel needs no action.',
  },
  {
    key: 'AbortError',
    hint: 'Operation aborted',
    detail:
      'An AbortController cancelled the operation: a request timeout, a client that went away, or shutdown.',
    howToFix:
      'Check whether the timeout is too short; a client that went away or a shutdown needs no action.',
  },
  {
    key: 'TimeoutError',
    hint: 'Operation timed out',
    detail:
      'The operation exceeded its time limit (AbortSignal.timeout, SDK requestTimeout, page navigation). The remote side is slow or down.',
    howToFix:
      'Retry later, and check the health of the remote side or the timeout setting.',
    retryable: true,
  },
  {
    key: 'ERR_INVALID_FILE_URL_PATH',
    hint: 'Invalid file URL',
    detail: 'A file: URL has an invalid path.',
    howToFix: 'Check how the URL is built.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_PROTOCOL',
    hint: 'Wrong protocol for client',
    detail: 'http.request got an https: URL (or vice versa).',
    howToFix: 'Use the client that matches the scheme.',
    category: 'bug',
  },
  {
    key: 'ERR_PERFORMANCE_INVALID_TIMESTAMP',
    hint: 'Invalid performance mark',
    detail:
      'A performance mark or measure got a negative timestamp (startTime, start or end).',
    howToFix:
      'Pass a non-negative time, such as one from performance.now(), or the name of an existing mark.',
    category: 'bug',
  },
  {
    key: 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
    hint: 'Unknown CLI option',
    detail: 'parseArgs got an option it does not know.',
    howToFix: 'Check the command line.',
    category: 'config',
  },
]
