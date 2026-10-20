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
]
