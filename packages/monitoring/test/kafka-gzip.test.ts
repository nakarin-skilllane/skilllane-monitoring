import { describe, expect, it } from 'vitest'
import { gzipSync } from 'zlib'
import { installGzipCodec, withFastGzip } from '../src/transport/kafka'

const kafkajs = require('kafkajs')
const { CompressionCodecs, CompressionTypes } = kafkajs

// Long enough that the compression levels produce different bytes.
const buffer = Buffer.from(
  JSON.stringify(
    Array.from({ length: 500 }, (_, i) => ({
      message: `Exam answer saved ${i}`,
      examId: i * 7919,
      text: 'ส่งคำตอบข้อสอบเรียบร้อย '.repeat(3),
    })),
  ),
)

describe('kafkajs gzip codec', () => {
  it("compresses the SDK's own sends at the fast level", async () => {
    installGzipCodec(kafkajs)
    const codec = CompressionCodecs[CompressionTypes.GZIP]()
    const out = await withFastGzip(() => codec.compress({ buffer }))
    expect(out).toEqual(gzipSync(buffer, { level: 1 }))
    expect(await codec.decompress(out)).toEqual(buffer)
  })

  it("leaves the app's own producers at zlib's default level", async () => {
    installGzipCodec(kafkajs)
    const codec = CompressionCodecs[CompressionTypes.GZIP]()
    const out = await codec.compress({ buffer })
    expect(out).toEqual(gzipSync(buffer))
    expect(out).not.toEqual(gzipSync(buffer, { level: 1 }))
  })

  it('keeps the fast level through the awaits inside a send', async () => {
    installGzipCodec(kafkajs)
    const codec = CompressionCodecs[CompressionTypes.GZIP]()
    const out = await withFastGzip(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return codec.compress({ buffer })
    })
    expect(out).toEqual(gzipSync(buffer, { level: 1 }))
  })
})
