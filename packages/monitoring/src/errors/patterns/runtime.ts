import type { ErrorPattern, ExplainInput, Explanation } from './types'

// Sources:
// - https://github.com/v8/v8/blob/main/src/common/message-template.h (V8 error message texts)
// - https://github.com/v8/v8/blob/main/include/v8-primitive.h (V8 maximum string length)
// - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors (JavaScript error reference)
// - https://nodejs.org/api/cli.html (--max-old-space-size and heap limits)
// - https://github.com/nodejs/node/blob/main/lib/internal/process/promises.js (unhandled rejection message)

const ARRAY_MEMBERS = new Set([
  'length',
  'map',
  'forEach',
  'filter',
  'find',
  'findIndex',
  'some',
  'every',
  'reduce',
  'includes',
  'push',
  'join',
  'sort',
  'slice',
  'flatMap',
])

/** Turns `reading 'x'` into the likely reason, using the entity relations. */
function explainNullRead({
  message,
  schema,
}: ExplainInput): Explanation | undefined {
  const property = message.match(/\(reading '([^']*)'\)|property '([^']*)'/)
  const name = property?.[1] ?? property?.[2]
  if (!name) return undefined
  const what = /of null/.test(message) ? 'null' : 'undefined'
  if (ARRAY_MEMBERS.has(name)) {
    return {
      target: name,
      detail: `Expected an array but got ${what} before .${name}: a lookup returned nothing or a relation was not loaded.`,
      howToFix: 'Default it to [].',
    }
  }
  const owners = schema.relationOwners(name)
  if (owners.length) {
    return {
      target: name,
      detail: `"${name}" is a relation of ${owners.slice(0, 3).join(', ')}: the parent object was ${what}, or ${name} was not loaded.`,
      howToFix: 'Check relations / leftJoinAndSelect.',
    }
  }
  return {
    target: name,
    detail: `The object holding .${name} was ${what}: a findOne without a null check, or an optional field.`,
    howToFix: `Guard it before reading .${name}.`,
  }
}

// JavaScript runtime errors: a bug in our code, found at log.origin. V8 never
// names the variable, so `target` carries the property or identifier instead.
export const runtimePatterns: ErrorPattern[] = [
  {
    key: 'NULL_READ',
    messageMatch: /Cannot read propert(?:y|ies) of (?:undefined|null)/,
    hint: 'Read from undefined value',
    detail:
      'Code read a property (see target) of undefined or null. The value was likely not found or not loaded.',
    howToFix: 'Guard it at the origin function.',
    category: 'bug',
    explain: explainNullRead,
  },
  {
    key: 'NULL_WRITE',
    messageMatch: /Cannot set propert(?:y|ies) of (?:undefined|null)/,
    hint: 'Write to undefined value',
    detail: 'Code set a property (see target) on undefined or null.',
    howToFix: 'Create the object first, or check why it was not loaded.',
    category: 'bug',
    target: /\(setting '([^']*)'\)|property '([^']*)'/,
  },
  {
    key: 'NOT_A_FUNCTION',
    messageMatch: /is not a function/,
    hint: 'Called a non-function',
    detail:
      'Code called something (see target) that is not a function: a wrong import, a missing method, or an undefined dependency.',
    howToFix: 'Check the import, and that the method exists on the object.',
    category: 'bug',
    target: /^(.+?) is not a function/,
  },
  {
    key: 'NOT_ITERABLE',
    messageMatch: /is not iterable/,
    hint: 'Looped over non-iterable',
    detail:
      'Code looped over or spread a value (see target) that is not an array or iterable, often undefined when no rows matched.',
    howToFix: 'Default the value to [] before looping over or spreading it.',
    category: 'bug',
    target: /^(.+?) is not iterable/,
  },
  {
    key: 'NOT_DEFINED',
    messageMatch: /is not defined$/,
    hint: 'Undefined identifier',
    detail:
      'Code used a name (see target) that does not exist in scope, often a missing import.',
    howToFix: 'Add the missing import, or declare the name.',
    category: 'bug',
    target: /^(\S+) is not defined/,
  },
  {
    key: 'STACK_OVERFLOW',
    messageMatch: /Maximum call stack size exceeded/,
    hint: 'Infinite recursion',
    detail:
      'A function kept calling itself, or recursive code (a custom serializer or deep copy) walked an object that refers back to itself.',
    howToFix: 'Look for recursion near the origin function.',
    category: 'bug',
  },
  {
    key: 'DESTRUCTURE_UNDEFINED',
    messageMatch: /Cannot destructure property/,
    hint: 'Destructured undefined value',
    detail:
      'Code destructured a property from undefined or null, often a missing argument or an empty query result.',
    howToFix: 'Check the caller passes the value, or default it.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(/property '([^']+)' of '([^']+)'/)
      if (!found) return undefined
      const source = found[2] === 'undefined' ? 'the value' : found[2]
      return {
        target: `${found[2]}.${found[1]}`,
        detail: `${source} was undefined or null when reading { ${found[1]} }.`,
        howToFix: 'Check the caller passes it, or default it.',
      }
    },
  },
  {
    key: 'CIRCULAR_JSON',
    messageMatch: /Converting circular structure to JSON/,
    hint: 'Circular object to JSON',
    detail:
      'An object that refers back to itself was serialized, often an entity with a back-reference returned as-is.',
    howToFix: 'Map it to a DTO.',
    category: 'bug',
    explain: ({ message }) => {
      const start = message.match(/constructor '([^']+)'/)?.[1]
      const closes = message.match(/property '([^']+)' closes the circle/)?.[1]
      if (!start) return undefined
      return {
        target: closes ? `${start}.${closes}` : start,
        detail: `${start}${closes ? ` → .${closes}` : ''} points back to itself.`,
        howToFix:
          'Return a DTO, or drop the back-reference before serializing.',
      }
    },
  },
  {
    key: 'INVALID_DATE',
    messageMatch: /^Invalid time value$/,
    hint: 'Invalid date value',
    detail: 'A Date was built from an invalid value and then formatted.',
    howToFix:
      'Check the input string and the Buddhist/Gregorian year conversion.',
    category: 'bug',
  },
  {
    key: 'NOT_A_CONSTRUCTOR',
    messageMatch: /is not a constructor/,
    hint: 'new on a non-class',
    detail:
      'Code used new on something (see target) that is not a class: a default import of a CommonJS module, or an instance instead of the class.',
    howToFix:
      'Check the import style of the module, and pass the class rather than an instance.',
    category: 'bug',
    target: /^(.+?) is not a constructor/,
  },
  {
    key: 'CLASS_WITHOUT_NEW',
    messageMatch: /^Class constructor .* cannot be invoked without 'new'/,
    hint: 'Class called without new',
    detail:
      'A class was called as a function (see target), often a decorator or a factory expecting a plain function, or mixed ES5/ES2015 build targets.',
    howToFix:
      'Call the class with new, and use one build target for all packages.',
    category: 'bug',
    target: /^Class constructor (\S+)/,
  },
  {
    key: 'CONST_ASSIGNMENT',
    messageMatch: /^Assignment to constant variable/,
    hint: 'Assigned to a const',
    detail: 'Code reassigned a const binding.',
    howToFix: 'Use let, or build a new value.',
    category: 'bug',
  },
  {
    key: 'TDZ_ACCESS',
    messageMatch: /^Cannot access '.*' before initialization/,
    hint: 'Used before initialization',
    detail:
      'A let/const/class (see target) was read before its declaration ran: usually a circular import between two files.',
    howToFix: 'Break the import cycle.',
    category: 'bug',
    target: /^Cannot access '([^']+)' before initialization/,
  },
  {
    key: 'NULL_TO_OBJECT',
    messageMatch: /^Cannot convert undefined or null to object/,
    hint: 'Object.keys of undefined',
    detail:
      'Object.keys/values/entries got undefined or null, or Object.assign got it as the target.',
    howToFix: 'Default the value to {} at the origin.',
    category: 'bug',
  },
  {
    key: 'IN_OPERATOR_ON_PRIMITIVE',
    messageMatch: /^Cannot use 'in' operator to search for/,
    hint: "'in' on a non-object",
    detail:
      "The right side of 'in' is a string, number or undefined, not an object, e.g. a JSON string that was never parsed.",
    howToFix: "Check the value is an object before using 'in' on it.",
    category: 'bug',
    target: /^Cannot use 'in' operator to search for '([^']+)'/,
  },
  {
    key: 'READONLY_PROPERTY',
    messageMatch: /^Cannot assign to read only property/,
    hint: 'Wrote a read-only property',
    detail:
      'Code set a property (see target) that is not writable, e.g. on a frozen cached or config object.',
    howToFix: 'Copy the object before changing it.',
    category: 'bug',
    target: /^Cannot assign to read only property '([^']+)'/,
  },
  {
    key: 'NOT_EXTENSIBLE',
    messageMatch: /object is not extensible/,
    hint: 'Write to non-extensible object',
    detail:
      'Code added a property (see target) to a frozen/sealed object, e.g. a cached entity or config.',
    howToFix: 'Clone the object first.',
    category: 'bug',
    target: /^Cannot add property (\S+),/,
  },
  {
    key: 'REDEFINE_PROPERTY',
    messageMatch: /^Cannot redefine property/,
    hint: 'Redefined a property',
    detail:
      'Object.defineProperty ran twice on a non-configurable property (see target), often a module mocked or patched twice.',
    howToFix: 'Define or patch the property only once.',
    category: 'bug',
    target: /^Cannot redefine property: (\S+)/,
  },
  {
    key: 'REDUCE_EMPTY_ARRAY',
    messageMatch: /^Reduce of empty array with no initial value/,
    hint: 'reduce() on empty array',
    detail:
      'reduce() ran on an empty array without an initial value (no rows matched).',
    howToFix: 'Pass an initial value.',
    category: 'bug',
  },
  {
    key: 'INVALID_ARRAY_LENGTH',
    messageMatch: /^Invalid array length/,
    hint: 'Invalid array length',
    detail:
      'new Array(n) or arr.length = n got a negative, fractional or huge n (NaN from a bad calculation).',
    howToFix: 'Check the count.',
    category: 'bug',
  },
  {
    key: 'INVALID_STRING_LENGTH',
    messageMatch: /^Invalid string length/,
    hint: 'String too long for V8',
    detail:
      'A string grew past the V8 limit (2^29 - 24 characters on 64-bit): concatenating a huge export or JSON.stringify of a big result.',
    howToFix: 'Stream or paginate.',
    category: 'bug',
  },
  {
    key: 'INVALID_COUNT_VALUE',
    messageMatch: /^Invalid count value/,
    hint: 'repeat() count invalid',
    detail:
      'String.repeat got a negative or infinite count (a padding computed from a negative width).',
    howToFix: 'Clamp the count to zero or more before calling repeat().',
    category: 'bug',
  },
  {
    key: 'TOFIXED_RANGE',
    messageMatch: /^toFixed\(\) digits argument must be between/,
    hint: 'toFixed() digits invalid',
    detail:
      'toFixed got a digits value outside 0-100, such as a negative or very large precision.',
    howToFix: 'Pass an integer precision between 0 and 100.',
    category: 'bug',
  },
  {
    key: 'INVALID_REGEXP',
    messageMatch: /^Invalid regular expression/,
    hint: 'Invalid regular expression',
    detail:
      'new RegExp got a pattern with unescaped special characters, often user input used as a pattern.',
    howToFix: 'Escape it before building the RegExp.',
    category: 'bug',
    target: /^Invalid regular expression: \/(.*)\/: /,
  },
  {
    key: 'INVALID_URI',
    messageMatch: /^URI malformed/,
    hint: 'URI malformed',
    detail:
      'decodeURIComponent got a string with a bad % sequence (a raw "%" in a query or file name).',
    howToFix:
      'Wrap decodeURIComponent in try/catch, or escape a raw % as %25 before decoding.',
    category: 'bug',
  },
  {
    key: 'BIGINT_SERIALIZE',
    messageMatch: /^Do not know how to serialize a BigInt/,
    hint: 'BigInt in JSON',
    detail:
      'JSON.stringify met a BigInt (a COUNT(*) or a 64-bit id from the driver).',
    howToFix: 'Convert it to Number or String first.',
    category: 'bug',
  },
  {
    key: 'BIGINT_MIX',
    messageMatch: /^Cannot mix BigInt and other types/,
    hint: 'BigInt mixed with number',
    detail: 'Arithmetic mixed a BigInt with a Number.',
    howToFix: 'Convert one side explicitly.',
    category: 'bug',
  },
  {
    key: 'INVALID_DATE_FORMAT',
    messageMatch:
      /^Invalid Date$|^Invalid date$|^Invalid (date|time) (value|range)|is not a valid date/i,
    hint: 'Invalid date value',
    detail:
      'A date built from an invalid string was formatted (date-fns, Intl, toISOString).',
    howToFix: 'Check the input and the Buddhist/Gregorian year conversion.',
    category: 'bug',
  },
  {
    key: 'INVALID_TIMEZONE',
    messageMatch: /^Invalid time zone specified/,
    hint: 'Invalid time zone name',
    detail: 'Intl got an unknown time zone id (see target).',
    howToFix: 'Use an IANA name such as Asia/Bangkok.',
    category: 'config',
    target: /^Invalid time zone specified: (\S+)/,
  },
  {
    key: 'INVALID_LOCALE',
    messageMatch: /^Incorrect locale information provided/,
    hint: 'Invalid locale tag',
    detail: 'Intl got an invalid locale string.',
    howToFix: 'Use a BCP 47 tag such as th-TH.',
    category: 'config',
  },
  {
    key: 'PROMISE_ANY_REJECTED',
    messageMatch: /^All promises were rejected/,
    hint: 'Every attempt failed',
    detail: 'Promise.any: no promise fulfilled.',
    howToFix: 'Read error.errors for each failure.',
  },
  {
    key: 'UNHANDLED_NON_ERROR_REJECTION',
    messageMatch:
      /^This error originated either by throwing inside of an async function without a catch block/,
    hint: 'Unhandled promise rejection',
    detail: 'A promise rejected with a non-Error value and nothing caught it.',
    howToFix: 'Find the missing await or .catch at the origin.',
    category: 'bug',
  },
  {
    key: 'HEAP_OUT_OF_MEMORY',
    messageMatch:
      /heap out of memory|Reached heap limit|Allocation failed - JavaScript heap out of memory/,
    hint: 'JavaScript heap exhausted',
    detail:
      'V8 ran out of heap: a huge result set, export or cache held in memory.',
    howToFix:
      'Stream/paginate, or raise --max-old-space-size with the container limit.',
    category: 'bug',
  },
  {
    key: 'ARRAY_BUFFER_ALLOCATION',
    messageMatch: /^Array buffer allocation failed/,
    hint: 'Buffer allocation failed',
    detail:
      'Could not allocate a large ArrayBuffer/Buffer: not enough memory, or a size computed from a bad value.',
    howToFix:
      'Check the computed size, and stream large data instead of buffering it.',
    category: 'bug',
  },
  {
    key: 'PRIVATE_MEMBER_ACCESS',
    messageMatch:
      /^Cannot read private member|^Cannot write private member|^Receiver must be an instance of class/,
    hint: 'Private field on wrong object',
    detail:
      'A #private member was accessed on an object that is not an instance of the class (a method detached from its instance).',
    howToFix: 'Bind the method to its instance, or call it on the instance.',
    category: 'bug',
  },
  {
    key: 'ILLEGAL_INVOCATION',
    messageMatch: /^Illegal invocation/,
    hint: 'Method called unbound',
    detail:
      'A built-in method (fetch, setTimeout, URLSearchParams) was called with the wrong this.',
    howToFix: 'Bind it or call it directly.',
    category: 'bug',
  },
  {
    key: 'SYNTAX_UNEXPECTED_TOKEN',
    messageMatch:
      /^Unexpected token|^Unexpected identifier|^Unexpected end of input|^missing \) after argument list|^Unexpected reserved word/,
    hint: 'JavaScript syntax error',
    detail:
      'V8 could not parse code: a broken build artifact, an ESM file loaded as CommonJS (import/export), or eval of non-JS text.',
    howToFix:
      'Rebuild the artifact, and check the module format (ESM or CommonJS) of the loaded file.',
    category: 'bug',
  },
]
