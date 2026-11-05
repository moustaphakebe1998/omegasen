import { describe, it, expect } from 'vitest'
import { formatPrice, formatDuration, slugify, cn } from '@/lib/utils'

// Intl utilise des espaces insécables (U+00A0 / U+202F) : on les normalise.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('formatPrice', () => {
  it('formats cents to EUR', () => {
    expect(plain(formatPrice(1000))).toBe('10,00 €')
  })

  it('formats 0', () => {
    expect(plain(formatPrice(0))).toBe('0,00 €')
  })

  it('formats large amounts', () => {
    expect(plain(formatPrice(100000))).toBe('1 000,00 €')
  })
})

describe('formatDuration', () => {
  it('shows seconds under 60', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('shows minutes', () => {
    expect(formatDuration(120)).toBe('2m')
  })

  it('shows minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1m30s')
  })
})

describe('slugify', () => {
  it('lowercases and replaces spaces', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('handles accents', () => {
    expect(slugify('Café Élégant')).toBe('cafe-elegant')
  })

  it('removes special chars', () => {
    expect(slugify('My & Restaurant!')).toBe('my-restaurant')
  })

  it('collapses multiple hyphens', () => {
    expect(slugify('foo   bar')).toBe('foo-bar')
  })
})

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })

  it('deduplicates tailwind classes', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6')
  })
})
