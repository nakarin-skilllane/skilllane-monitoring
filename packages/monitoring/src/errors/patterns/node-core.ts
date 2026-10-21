import type { ErrorPattern } from './types'

// Node.js internal ERR_* codes: argument validation, modules, workers,
// child processes, encoding (nodejs.org/api/errors.html).
export const nodeCorePatterns: ErrorPattern[] = [
  {
    key: 'ERR_INVALID_ARG_TYPE',
    hint: 'Wrong argument type',
    hintDetail:
      'A Node API got an argument of the wrong type (see target), often undefined from a missing env var or an unloaded field.',
    category: 'bug',
    target: /^The "([^"]+)" (?:argument|property|option)/,
    explain: ({ message }) => {
      const found = message.match(
        /^The "([^"]+)" (?:argument|property|option) must be (?:of type |an instance of |one of type )?([^.]+)\. Received (.+)$/,
      )
      if (!found) return undefined
      return {
        target: found[1],
        fix: `"${found[1]}" must be ${found[2]} but was ${found[3].slice(0, 60)}. Check where it comes from (env, DTO, query result).`,
      }
    },
  },
  {
    key: 'ERR_INVALID_ARG_VALUE',
    hint: 'Invalid argument value',
    hintDetail:
      'A Node API rejected an argument value (see target): empty string, wrong format or unsupported option.',
    category: 'bug',
    target: /^The (?:argument|property|option) '([^']+)'/,
  },
  {
    key: 'ERR_OUT_OF_RANGE',
    hint: 'Value out of range',
    hintDetail:
      'A numeric argument is outside the allowed range (see target): a negative offset, a size above the limit or a huge buffer.',
    category: 'bug',
    target: /^The value of "([^"]+)"/,
  },
  {
    key: 'ERR_MISSING_ARGS',
    hint: 'Required argument missing',
    hintDetail:
      'A Node API was called without a required argument (see target).',
    category: 'bug',
    target: /^The "([^"]+)" argument/,
  },
  {
    key: 'ERR_STRING_TOO_LONG',
    hint: 'String too long for V8',
    hintDetail:
      'A string would exceed the V8 maximum (about 512 MB): a huge JSON.stringify or file read as text. Stream it or paginate.',
    category: 'bug',
  },
  {
    key: 'ERR_BUFFER_OUT_OF_BOUNDS',
    hint: 'Buffer read out of bounds',
    hintDetail:
      'A read/write went outside the Buffer: a truncated binary payload or a wrong offset calculation.',
    category: 'bug',
  },
  {
    key: 'ERR_BUFFER_TOO_LARGE',
    hint: 'Buffer too large',
    hintDetail:
      'A Buffer bigger than the Node maximum was requested. Stream the data instead of loading it all.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_STATE',
    hint: 'Invalid object state',
    hintDetail:
      'An operation ran on an object in the wrong state (stream locked, reader released, controller closed).',
    category: 'bug',
  },
  {
    key: 'ERR_USE_AFTER_CLOSE',
    hint: 'Used after close',
    hintDetail:
      'Something (readline, a handle) was used after it had been closed, usually during shutdown.',
    category: 'bug',
  },
  {
    key: 'ERR_UNHANDLED_ERROR',
    hint: 'Unhandled error event',
    hintDetail:
      'An EventEmitter emitted "error" with no listener. Attach an error handler to the stream, socket or client at the origin.',
    category: 'bug',
  },
  {
    key: 'ERR_UNHANDLED_REJECTION',
    hint: 'Unhandled promise rejection',
    hintDetail:
      'A promise rejected with a non-Error value and nothing caught it. Find the missing await/catch at the origin.',
    category: 'bug',
  },
  {
    key: 'UnhandledPromiseRejection',
    hint: 'Unhandled promise rejection',
    hintDetail:
      'A promise rejected and nothing caught it; the process would exit. Find the missing await or .catch at the origin.',
    category: 'bug',
  },
  {
    key: 'ERR_MULTIPLE_CALLBACK',
    hint: 'Callback called twice',
    hintDetail:
      'A callback was invoked more than once: a done() in both try and catch, or in a loop.',
    category: 'bug',
  },
  {
    key: 'ERR_ASSERTION',
    hint: 'Assertion failed',
    hintDetail:
      'An assert() in our code failed (see message). The invariant it protects does not hold.',
    category: 'bug',
  },
  {
    key: 'ERR_METHOD_NOT_IMPLEMENTED',
    hint: 'Method not implemented',
    hintDetail:
      'A required method (_read, _write, _transform) is missing on a custom stream or class.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_RETURN_VALUE',
    hint: 'Wrong return value',
    hintDetail:
      'A callback or option returned the wrong type (e.g. a promise was expected).',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_THIS',
    hint: 'Method called unbound',
    hintDetail:
      'A method was called with the wrong "this": it was passed as a callback without bind or an arrow function.',
    category: 'bug',
  },
  {
    key: 'ERR_ILLEGAL_CONSTRUCTOR',
    hint: 'Illegal constructor',
    hintDetail:
      'new was used on a class that cannot be constructed directly (Headers, Response internals).',
    category: 'bug',
  },
  {
    key: 'MODULE_NOT_FOUND',
    hint: 'Module not found',
    hintDetail:
      'require() could not resolve a module (see target): a dependency missing from package.json, a wrong relative path, or a file not in the build output.',
    category: 'config',
    target: /Cannot find module '([^']+)'/,
  },
  {
    key: 'ERR_MODULE_NOT_FOUND',
    hint: 'ES module not found',
    hintDetail:
      'import could not resolve a module (see target): missing dependency, wrong path or a missing file extension in ESM.',
    category: 'config',
    target: /Cannot find (?:module|package) '([^']+)'/,
  },
  {
    key: 'ERR_REQUIRE_ESM',
    hint: 'require() of ES module',
    hintDetail:
      'A CommonJS require() loaded an ESM-only package (see target). Use a dynamic import() or pin the CommonJS version of the package.',
    category: 'config',
    target: /require\(\) of ES Module ([^\s]+)/,
  },
  {
    key: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    hint: 'Package subpath not exported',
    hintDetail:
      'The imported subpath is not in the package "exports" map (see target). Import from the package root or the documented subpath.',
    category: 'config',
    target: /Package subpath '([^']+)'/,
  },
  {
    key: 'ERR_UNKNOWN_FILE_EXTENSION',
    hint: 'Unknown file extension',
    hintDetail:
      'Node cannot load this file type (e.g. .ts without a loader). Run the compiled JS or register a loader.',
    category: 'config',
  },
  {
    key: 'ERR_UNSUPPORTED_DIR_IMPORT',
    hint: 'Directory import in ESM',
    hintDetail:
      'ESM does not resolve a directory to index.js. Import the file explicitly.',
    category: 'config',
  },
  {
    key: 'ERR_IMPORT_ATTRIBUTE_MISSING',
    hint: 'JSON import attribute missing',
    hintDetail: 'Importing JSON in ESM needs `with { type: "json" }`.',
    category: 'bug',
  },
  {
    key: 'ERR_DLOPEN_FAILED',
    hint: 'Native addon failed to load',
    hintDetail:
      'A native module (.node) could not be loaded: built for another OS/arch/Node version, or a missing shared library. Rebuild in the image.',
    category: 'config',
  },
  {
    key: 'ERR_WORKER_OUT_OF_MEMORY',
    hint: 'Worker out of memory',
    hintDetail:
      'A worker thread hit its memory limit (resourceLimits). The task holds too much data; chunk it or raise the limit.',
    category: 'bug',
  },
  {
    key: 'ERR_WORKER_INIT_FAILED',
    hint: 'Worker failed to start',
    hintDetail: 'A worker thread could not initialize. See the cause.',
  },
  {
    key: 'ERR_FS_FILE_TOO_LARGE',
    hint: 'File too large to read',
    hintDetail:
      'readFile cannot load files over 2 GiB. Stream the file instead.',
    category: 'bug',
  },
  {
    key: 'ERR_FS_EISDIR',
    hint: 'Path is a directory',
    hintDetail:
      'A file operation got a directory path. Check how the path is built.',
    category: 'bug',
  },
  {
    key: 'ERR_FS_CP_EEXIST',
    hint: 'Copy target exists',
    hintDetail:
      'fs.cp refused to overwrite an existing file. Pass force or remove it first.',
  },
  {
    key: 'ERR_UNKNOWN_ENCODING',
    hint: 'Unknown encoding',
    hintDetail:
      'An encoding name Node does not know was used (e.g. "utf8mb4", "tis-620" via Buffer). Use iconv-lite for legacy charsets.',
    category: 'bug',
  },
  {
    key: 'ERR_ENCODING_INVALID_ENCODED_DATA',
    hint: 'Invalid encoded bytes',
    hintDetail:
      'TextDecoder (fatal) got bytes that are not valid for the encoding. The input is binary or another charset.',
    level: 'warn',
  },
  {
    key: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
    hint: 'Child output too large',
    hintDetail:
      'exec() output exceeded maxBuffer (1 MB default). Use spawn with streams, or raise maxBuffer.',
    category: 'bug',
  },
  {
    key: 'ERR_CHILD_CLOSED_BEFORE_REPLY',
    hint: 'Child process exited early',
    hintDetail:
      'A child process closed before answering. It crashed or was killed (OOM); check its stderr.',
  },
  {
    key: 'ERR_IPC_CHANNEL_CLOSED',
    hint: 'IPC channel closed',
    hintDetail:
      'process.send was used after the parent/child IPC channel closed, usually during shutdown.',
  },
  {
    key: 'ERR_IPC_DISCONNECTED',
    hint: 'IPC already disconnected',
    hintDetail: 'disconnect() was called twice on the IPC channel.',
    category: 'bug',
  },
  {
    key: 'ABORT_ERR',
    hint: 'Operation aborted',
    hintDetail:
      'The operation was cancelled through an AbortSignal (timeout or caller cancel). Usually not an error by itself.',
  },
  {
    key: 'AbortError',
    hint: 'Operation aborted',
    hintDetail:
      'An AbortController cancelled the operation: a request timeout, a client that went away, or shutdown.',
  },
  {
    key: 'TimeoutError',
    hint: 'Operation timed out',
    hintDetail:
      'The operation exceeded its time limit (AbortSignal.timeout, SDK requestTimeout, page navigation). The remote side is slow or down.',
    retryable: true,
  },
  {
    key: 'ERR_INVALID_FILE_URL_PATH',
    hint: 'Invalid file URL',
    hintDetail: 'A file: URL has an invalid path. Check how the URL is built.',
    category: 'bug',
  },
  {
    key: 'ERR_INVALID_PROTOCOL',
    hint: 'Wrong protocol for client',
    hintDetail:
      'http.request got an https: URL (or vice versa). Use the client that matches the scheme.',
    category: 'bug',
  },
  {
    key: 'ERR_PERFORMANCE_INVALID_TIMESTAMP',
    hint: 'Invalid performance mark',
    hintDetail: 'A performance measure used a mark that does not exist.',
    category: 'bug',
  },
  {
    key: 'ERR_PARSE_ARGS_UNKNOWN_OPTION',
    hint: 'Unknown CLI option',
    hintDetail:
      'parseArgs got an option it does not know. Check the command line.',
    category: 'config',
  },
]
