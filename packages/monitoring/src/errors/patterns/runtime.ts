import type { ErrorPattern, ExplainInput, Explanation } from './types'

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
      fix: `Expected an array but got ${what} before .${name}: a lookup returned nothing or a relation was not loaded. Default it to [].`,
    }
  }
  const owners = schema.relationOwners(name)
  if (owners.length) {
    return {
      target: name,
      fix: `"${name}" is a relation of ${owners.slice(0, 3).join(', ')}: the parent object was ${what}, or ${name} was not loaded. Check relations / leftJoinAndSelect.`,
    }
  }
  return {
    target: name,
    fix: `The object holding .${name} was ${what}: a findOne without a null check, or an optional field. Guard it before reading .${name}.`,
  }
}

// JavaScript runtime errors: a bug in our code, found at log.origin. V8 never
// names the variable, so `target` carries the property or identifier instead.
export const runtimePatterns: ErrorPattern[] = [
  {
    key: 'NULL_READ',
    messageMatch: /Cannot read propert(?:y|ies) of (?:undefined|null)/,
    hint: 'Read from undefined value',
    hintDetail:
      'Code read a property (see target) of undefined or null. The value was likely not found or not loaded; guard it at the origin function.',
    category: 'bug',
    explain: explainNullRead,
  },
  {
    key: 'NULL_WRITE',
    messageMatch: /Cannot set propert(?:y|ies) of (?:undefined|null)/,
    hint: 'Write to undefined value',
    hintDetail:
      'Code set a property (see target) on undefined or null. Create the object first, or check why it was not loaded.',
    category: 'bug',
    target: /\(setting '([^']*)'\)|property '([^']*)'/,
  },
  {
    key: 'NOT_A_FUNCTION',
    messageMatch: /is not a function/,
    hint: 'Called a non-function',
    hintDetail:
      'Code called something (see target) that is not a function: a wrong import, a missing method, or an undefined dependency.',
    category: 'bug',
    target: /^(.+?) is not a function/,
  },
  {
    key: 'NOT_ITERABLE',
    messageMatch: /is not iterable/,
    hint: 'Looped over non-iterable',
    hintDetail:
      'Code looped over or spread a value (see target) that is not an array or iterable, often undefined when no rows matched.',
    category: 'bug',
    target: /^(.+?) is not iterable/,
  },
  {
    key: 'NOT_DEFINED',
    messageMatch: /is not defined$/,
    hint: 'Undefined identifier',
    hintDetail:
      'Code used a name (see target) that does not exist in scope, often a missing import.',
    category: 'bug',
    target: /^(\S+) is not defined/,
  },
  {
    key: 'STACK_OVERFLOW',
    messageMatch: /Maximum call stack size exceeded/,
    hint: 'Infinite recursion',
    hintDetail:
      'A function kept calling itself, or a circular object was serialized. Look for recursion near the origin function.',
    category: 'bug',
  },
  {
    key: 'DESTRUCTURE_UNDEFINED',
    messageMatch: /Cannot destructure property/,
    hint: 'Destructured undefined value',
    hintDetail:
      'Code destructured a property from undefined or null, often a missing argument or an empty query result.',
    category: 'bug',
    explain: ({ message }) => {
      const found = message.match(/property '([^']+)' of '([^']+)'/)
      if (!found) return undefined
      const source = found[2] === 'undefined' ? 'the value' : found[2]
      return {
        target: `${found[2]}.${found[1]}`,
        fix: `${source} was undefined when reading { ${found[1]} }. Check the caller passes it, or default it.`,
      }
    },
  },
  {
    key: 'CIRCULAR_JSON',
    messageMatch: /Converting circular structure to JSON/,
    hint: 'Circular object to JSON',
    hintDetail:
      'An object that refers back to itself was serialized, often an entity with a back-reference returned as-is. Map it to a DTO.',
    category: 'bug',
    explain: ({ message }) => {
      const start = message.match(/constructor '([^']+)'/)?.[1]
      const closes = message.match(/property '([^']+)' closes the circle/)?.[1]
      if (!start) return undefined
      return {
        target: closes ? `${start}.${closes}` : start,
        fix: `${start}${closes ? ` → .${closes}` : ''} points back to itself. Return a DTO, or drop the back-reference before serializing.`,
      }
    },
  },
  {
    key: 'INVALID_DATE',
    messageMatch: /^Invalid time value$/,
    hint: 'Invalid date value',
    hintDetail:
      'A Date was built from an invalid value and then formatted. Check the input string and the Buddhist/Gregorian year conversion.',
    category: 'bug',
  },
  {
    key: 'NOT_A_CONSTRUCTOR',
    messageMatch: /is not a constructor/,
    hint: 'new on a non-class',
    hintDetail:
      'Code used new on something (see target) that is not a class: a default import of a CommonJS module, or an instance instead of the class.',
    category: 'bug',
    target: /^(.+?) is not a constructor/,
  },
  {
    key: 'CLASS_WITHOUT_NEW',
    messageMatch: /^Class constructor .* cannot be invoked without 'new'/,
    hint: 'Class called without new',
    hintDetail:
      'A class was called as a function (see target), often a decorator or a factory expecting a plain function, or mixed ES5/ES2015 build targets.',
    category: 'bug',
    target: /^Class constructor (\S+)/,
  },
  {
    key: 'CONST_ASSIGNMENT',
    messageMatch: /^Assignment to constant variable/,
    hint: 'Assigned to a const',
    hintDetail:
      'Code reassigned a const binding. Use let, or build a new value.',
    category: 'bug',
  },
  {
    key: 'TDZ_ACCESS',
    messageMatch: /^Cannot access '.*' before initialization/,
    hint: 'Used before initialization',
    hintDetail:
      'A let/const/class (see target) was read before its declaration ran: usually a circular import between two files. Break the cycle.',
    category: 'bug',
    target: /^Cannot access '([^']+)' before initialization/,
  },
  {
    key: 'NULL_TO_OBJECT',
    messageMatch: /^Cannot convert undefined or null to object/,
    hint: 'Object.keys of undefined',
    hintDetail:
      'Object.keys/entries/assign or a spread into an object got undefined or null. Default the value to {} at the origin.',
    category: 'bug',
  },
  {
    key: 'IN_OPERATOR_ON_PRIMITIVE',
    messageMatch: /^Cannot use 'in' operator to search for/,
    hint: "'in' on a non-object",
    hintDetail:
      "The right side of 'in' (or a destructuring/instanceof) is a string, number or undefined, not an object.",
    category: 'bug',
    target: /^Cannot use 'in' operator to search for '([^']+)'/,
  },
  {
    key: 'READONLY_PROPERTY',
    messageMatch: /^Cannot assign to read only property/,
    hint: 'Wrote a read-only property',
    hintDetail:
      'Code set a property (see target) on a frozen object or a getter-only property, e.g. mutating a cached/config object.',
    category: 'bug',
    target: /^Cannot assign to read only property '([^']+)'/,
  },
  {
    key: 'NOT_EXTENSIBLE',
    messageMatch: /object is not extensible/,
    hint: 'Write to non-extensible object',
    hintDetail:
      'Code added a property (see target) to a frozen/sealed object, e.g. a cached entity or config. Clone it first.',
    category: 'bug',
    target: /^Cannot add property (\S+),/,
  },
  {
    key: 'REDEFINE_PROPERTY',
    messageMatch: /^Cannot redefine property/,
    hint: 'Redefined a property',
    hintDetail:
      'Object.defineProperty ran twice on a non-configurable property (see target), often a module mocked or patched twice.',
    category: 'bug',
    target: /^Cannot redefine property: (\S+)/,
  },
  {
    key: 'REDUCE_EMPTY_ARRAY',
    messageMatch: /^Reduce of empty array with no initial value/,
    hint: 'reduce() on empty array',
    hintDetail:
      'reduce() ran on an empty array without an initial value (no rows matched). Pass an initial value.',
    category: 'bug',
  },
  {
    key: 'INVALID_ARRAY_LENGTH',
    messageMatch: /^Invalid array length/,
    hint: 'Invalid array length',
    hintDetail:
      'new Array(n) or arr.length = n got a negative, fractional or huge n (NaN from a bad calculation). Check the count.',
    category: 'bug',
  },
  {
    key: 'INVALID_STRING_LENGTH',
    messageMatch: /^Invalid string length/,
    hint: 'String too long for V8',
    hintDetail:
      'A string grew past the V8 limit (about 512 MB): concatenating a huge export or JSON.stringify of a big result. Stream or paginate.',
    category: 'bug',
  },
  {
    key: 'INVALID_COUNT_VALUE',
    messageMatch: /^Invalid count value/,
    hint: 'repeat() count invalid',
    hintDetail:
      'String.repeat got a negative or infinite count (a padding computed from a negative width).',
    category: 'bug',
  },
  {
    key: 'TOFIXED_RANGE',
    messageMatch: /^toFixed\(\) digits argument must be between/,
    hint: 'toFixed() digits invalid',
    hintDetail:
      'toFixed got digits outside 0-100 (undefined or a negative precision).',
    category: 'bug',
  },
  {
    key: 'INVALID_REGEXP',
    messageMatch: /^Invalid regular expression/,
    hint: 'Invalid regular expression',
    hintDetail:
      'new RegExp got a pattern with unescaped special characters, often user input used as a pattern. Escape it before building the RegExp.',
    category: 'bug',
    target: /^Invalid regular expression: \/(.*)\/: /,
  },
  {
    key: 'INVALID_URI',
    messageMatch: /^URI malformed/,
    hint: 'URI malformed',
    hintDetail:
      'decodeURIComponent got a string with a bad % sequence (a raw "%" in a query or file name). Guard the decode.',
    category: 'bug',
  },
  {
    key: 'BIGINT_SERIALIZE',
    messageMatch: /^Do not know how to serialize a BigInt/,
    hint: 'BigInt in JSON',
    hintDetail:
      'JSON.stringify met a BigInt (a COUNT(*) or a 64-bit id from the driver). Convert it to Number or String first.',
    category: 'bug',
  },
  {
    key: 'BIGINT_MIX',
    messageMatch: /^Cannot mix BigInt and other types/,
    hint: 'BigInt mixed with number',
    hintDetail:
      'Arithmetic mixed a BigInt with a Number. Convert one side explicitly.',
    category: 'bug',
  },
  {
    key: 'INVALID_DATE_FORMAT',
    messageMatch:
      /^Invalid Date$|^Invalid date$|^Invalid (date|time) (value|range)|is not a valid date/i,
    hint: 'Invalid date value',
    hintDetail:
      'A date built from an invalid string was formatted (date-fns, Intl, toISOString). Check the input and the Buddhist/Gregorian year conversion.',
    category: 'bug',
  },
  {
    key: 'INVALID_TIMEZONE',
    messageMatch: /^Invalid time zone specified/,
    hint: 'Invalid time zone name',
    hintDetail:
      'Intl got an unknown time zone id (see target). Use an IANA name such as Asia/Bangkok.',
    category: 'config',
    target: /^Invalid time zone specified: (\S+)/,
  },
  {
    key: 'INVALID_LOCALE',
    messageMatch: /^Incorrect locale information provided/,
    hint: 'Invalid locale tag',
    hintDetail:
      'Intl got an invalid locale string. Use a BCP 47 tag such as th-TH.',
    category: 'config',
  },
  {
    key: 'PROMISE_ANY_REJECTED',
    messageMatch: /^All promises were rejected/,
    hint: 'Every attempt failed',
    hintDetail:
      'Promise.any: no promise fulfilled. Read error.errors for each failure.',
  },
  {
    key: 'UNHANDLED_NON_ERROR_REJECTION',
    messageMatch:
      /^This error originated either by throwing inside of an async function without a catch block/,
    hint: 'Unhandled promise rejection',
    hintDetail:
      'A promise rejected with a non-Error value and nothing caught it. Find the missing await or .catch at the origin.',
    category: 'bug',
  },
  {
    key: 'HEAP_OUT_OF_MEMORY',
    messageMatch:
      /heap out of memory|Reached heap limit|Allocation failed - JavaScript heap out of memory/,
    hint: 'JavaScript heap exhausted',
    hintDetail:
      'V8 ran out of heap: a huge result set, export or cache held in memory. Stream/paginate, or raise --max-old-space-size with the container limit.',
    category: 'bug',
  },
  {
    key: 'ARRAY_BUFFER_ALLOCATION',
    messageMatch: /^Array buffer allocation failed/,
    hint: 'Buffer allocation failed',
    hintDetail:
      'Could not allocate a large ArrayBuffer/Buffer: not enough memory, or a size computed from a bad value.',
    category: 'bug',
  },
  {
    key: 'PRIVATE_MEMBER_ACCESS',
    messageMatch:
      /^Cannot read private member|^Cannot write private member|^Receiver must be an instance of class/,
    hint: 'Private field on wrong object',
    hintDetail:
      'A #private member was accessed on an object that is not an instance of the class (a method detached from its instance).',
    category: 'bug',
  },
  {
    key: 'ILLEGAL_INVOCATION',
    messageMatch: /^Illegal invocation/,
    hint: 'Method called unbound',
    hintDetail:
      'A built-in method (fetch, setTimeout, URLSearchParams) was called with the wrong this. Bind it or call it directly.',
    category: 'bug',
  },
  {
    key: 'SYNTAX_UNEXPECTED_TOKEN',
    messageMatch:
      /^Unexpected token|^Unexpected identifier|^Unexpected end of input|^missing \) after argument list|^Unexpected reserved word/,
    hint: 'JavaScript syntax error',
    hintDetail:
      'V8 could not parse code: a broken build artifact, an ESM file loaded as CommonJS (import/export), or eval of non-JS text.',
    category: 'bug',
  },
]
