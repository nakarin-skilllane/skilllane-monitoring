import { describe, expect, it } from 'vitest'
import {
  isThaiNationalId,
  REDACTED,
  redactRecord,
  redactText,
} from '../src/logger/redact'

// 1-1015-00001-21-9 style valid IDs computed with the mod-11 rule.
function validThaiId(): string {
  const base = '110150000121'
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (13 - i)
  return base + String((11 - (sum % 11)) % 10)
}

describe('redactText', () => {
  it('redacts a valid Thai national id but keeps 13-digit timestamps', () => {
    const id = validThaiId()
    expect(isThaiNationalId(id)).toBe(true)
    expect(redactText(`citizen ${id} at ${1791255009123}`)).toBe(
      `citizen ${REDACTED} at 1791255009123`,
    )
  })

  it('redacts emails, JWTs, bearer tokens and secret pairs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123'
    const text = `user a.b@school.ac.th token=${jwt} Authorization: Bearer xyz password=hunter2`
    const out = redactText(text)
    expect(out).not.toContain('a.b@school.ac.th')
    expect(out).not.toContain(jwt)
    expect(out).not.toContain('xyz')
    expect(out).not.toContain('hunter2')
  })

  it('removes query strings from URLs and paths', () => {
    expect(redactText('GET /api/scores?token=abc&x=1 failed')).toBe(
      'GET /api/scores failed',
    )
    expect(redactText('call https://imauth.example.go.th/token?code=xyz')).toBe(
      'call https://imauth.example.go.th/token',
    )
  })
})

describe('redactRecord', () => {
  it('drops fields outside the spec and reports them', () => {
    const record: Record<string, unknown> = {
      message: 'x',
      'url.path': '/a?b=1',
      password: 'p',
      foo: 1,
    }
    expect(redactRecord(record).sort()).toEqual(['foo', 'password'])
    expect(record).toEqual({ message: 'x', 'url.path': '/a' })
  })

  it('keeps at most 10 labels and redacts their values', () => {
    const labels = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`k${i}`, i === 0 ? 'a@b.co' : 'v']),
    )
    const record: Record<string, unknown> = { labels }
    redactRecord(record)
    expect(Object.keys(record.labels as object)).toHaveLength(10)
    expect((record.labels as any).k0).toBe(REDACTED)
  })
})
