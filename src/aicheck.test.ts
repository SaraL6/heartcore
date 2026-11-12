import { describe, expect, it } from 'vitest'
import { findAiMarker, looksAiByWords } from './aicheck'

const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0) & 0xff))

describe('findAiMarker', () => {
  it('spots content credentials that say AI made or edited the image', () => {
    expect(findAiMarker(bytes('\xff\xd8 ... <Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia</...'))).toBe('made with AI (content credentials)')
    expect(findAiMarker(bytes('...digitalsourcetype/compositeWithTrainedAlgorithmicMedia...'))).toBe('edited with AI (content credentials)')
  })
  it('spots generator names and Stable Diffusion PNG settings', () => {
    expect(findAiMarker(bytes('Exif\x00\x00 Software\x00Midjourney v6'))).toBe('Midjourney')
    expect(findAiMarker(bytes('\x89PNG....tEXtparameters\x00a cat, masterpiece, Steps: 20'))).toBe('Stable Diffusion settings')
    expect(findAiMarker(bytes('c2pa claim_generator: ChatGPT'))).toBe('OpenAI')
    expect(findAiMarker(new TextEncoder().encode('made with DALL·E 3'))).toBe('DALL·E')
  })
  it('lets ordinary photos through', () => {
    expect(findAiMarker(bytes('\xff\xd8\xff\xe1 Exif Canon EOS 5D Mark II Adobe Photoshop Lightroom'))).toBeNull()
    expect(findAiMarker(bytes('\x89PNG\r\n\x1a\n IHDR tEXtSoftware\x00GIMP 2.10'))).toBeNull()
  })
})

describe('looksAiByWords', () => {
  it('drops library photos that call themselves AI', () => {
    expect(looksAiByWords({ caption: 'Dreamy castle, AI generated', tags: [] })).toBe(true)
    expect(looksAiByWords({ caption: 'portrait', tags: ['midjourney'] })).toBe(true)
    expect(looksAiByWords({ caption: 'x', tags: ['AI'] })).toBe(true)
    expect(looksAiByWords({ caption: 'Stable Diffusion test render', tags: [] })).toBe(true)
  })
  it('keeps photos that merely contain the letters', () => {
    expect(looksAiByWords({ caption: 'Paris in the rain', tags: ['air', 'aisle', 'maine'] })).toBe(false)
    expect(looksAiByWords({ caption: 'Mount Fuji from Hakone', tags: ['japan'] })).toBe(false)
  })
})
