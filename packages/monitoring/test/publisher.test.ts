import { describe, expect, it } from 'vitest'
import { ExportLink, Publisher } from '../src/transport/publisher'
import type { OutgoingMessage, Transport } from '../src/transport/types'

function capturing(): { sent: string[]; transport: Transport } {
  const sent: string[] = []
  const transport: Transport = {
    name: 'http',
    target: 'engine',
    connect: () => Promise.resolve(),
    close: () => Promise.resolve(),
    async publish(_stream, outgoing: OutgoingMessage) {
      sent.push(outgoing.body.toString())
    },
  }
  return { sent, transport }
}

function publisher(
  transport: Transport,
  settings: Partial<ConstructorParameters<typeof Publisher>[2]> = {},
): Publisher {
  return new Publisher(
    'logs',
    new ExportLink(transport),
    {
      batchMs: 10_000,
      batchSize: 500,
      maxQueue: 100,
      maxQueueBytes: 1_000_000,
      maxBytes: 100_000,
      sendTimeoutMs: 1_000,
      ...settings,
    },
    '{"service.name":"svc"}',
    'svc',
  )
}

describe('Publisher.push with the line already serialized', () => {
  it('sends that line as it is instead of serializing the item again', async () => {
    const { sent, transport } = capturing()
    const p = publisher(transport)
    p.push({ message: 'from the item' }, '{"message":"from stdout"}')
    await p.flush(Date.now() + 2_000)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('{"message":"from stdout"}')
    expect(sent[0]).not.toContain('from the item')
    await p.close(Date.now() + 500)
  })

  it('still serializes an item that comes without one', async () => {
    const { sent, transport } = capturing()
    const p = publisher(transport)
    p.push({ message: 'one' })
    p.push({ message: 'two' }, '{"message":"two"}')
    await p.flush(Date.now() + 2_000)
    const envelope = JSON.parse(sent[0])
    expect(envelope.items).toEqual([{ message: 'one' }, { message: 'two' }])
    await p.close(Date.now() + 500)
  })
})

describe('Publisher queue bounds', () => {
  it('drops the oldest items past LOG_EXPORT_MAX_QUEUE_BYTES, keeping the newest', async () => {
    const { sent, transport } = capturing()
    // Each line is about 30 bytes; the bound holds three of them.
    const p = publisher(transport, { maxQueueBytes: 100 })
    for (const n of [1, 2, 3, 4, 5])
      p.push({ message: `line-${n}`, pad: 'xxxxxxxx' })
    await p.flush(Date.now() + 2_000)
    const items = sent.flatMap((body) => JSON.parse(body).items)
    expect(items.length).toBeLessThan(5)
    expect(items[items.length - 1].message).toBe('line-5')
    expect(items[0].message).not.toBe('line-1')
    await p.close(Date.now() + 500)
  })

  it('keeps a failed batch, oldest first, and sends it on the next flush', async () => {
    const sent: string[] = []
    let fail = true
    const transport: Transport = {
      name: 'http',
      target: 'engine',
      connect: () => Promise.resolve(),
      close: () => Promise.resolve(),
      async publish(_stream, outgoing: OutgoingMessage) {
        if (fail) throw new Error('down')
        sent.push(outgoing.body.toString())
      },
    }
    const p = publisher(transport)
    p.push({ message: 'a' })
    p.push({ message: 'b' })
    await p.flush(Date.now() + 500)
    expect(sent).toHaveLength(0)
    fail = false
    p.push({ message: 'c' })
    await p.flush(Date.now() + 2_000)
    const items = sent.flatMap((body) => JSON.parse(body).items)
    expect(items.map((item) => item.message)).toEqual(['a', 'b', 'c'])
    await p.close(Date.now() + 500)
  })
})

describe('Publisher at LOG_EXPORT_MAX_QUEUE', () => {
  it('drops the oldest one by one and sends the newest maxQueue items', async () => {
    const { sent, transport } = capturing()
    const p = publisher(transport, { maxQueue: 3 })
    for (const n of [1, 2, 3, 4, 5, 6]) p.push({ message: `line-${n}` })
    await p.flush(Date.now() + 2_000)
    const items = sent.flatMap((body) => JSON.parse(body).items)
    expect(items.map((item) => item.message)).toEqual([
      'line-4',
      'line-5',
      'line-6',
    ])
    await p.close(Date.now() + 500)
  })
})
