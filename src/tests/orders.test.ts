import { describe, it, expect } from 'vitest'
import { canTransition } from '@/server/orders'

describe('Transitions de statut de commande', () => {
  it.each([
    ['PENDING', 'CONFIRMED', 'MANAGER'],
    ['CONFIRMED', 'PREPARING', 'KITCHEN'],
    ['PREPARING', 'READY', 'KITCHEN'],
    ['READY', 'SERVED', 'KITCHEN'],
    ['PREPARING', 'CONFIRMED', 'KITCHEN'],
    ['READY', 'PREPARING', 'KITCHEN'],
    ['SERVED', 'READY', 'MANAGER'],
    ['CONFIRMED', 'CANCELLED', 'CEO'],
    ['SERVED', 'ARCHIVED', 'MANAGER'],
  ] as const)('autorise %s → %s pour %s', (from, to, role) => {
    expect(canTransition(from, to, role)).toBe(true)
  })

  it.each([
    ['PENDING', 'CONFIRMED', 'KITCHEN'],
    ['SERVED', 'READY', 'KITCHEN'],
    ['SERVED', 'CANCELLED', 'CEO'],
    ['PREPARING', 'CANCELLED', 'MANAGER'],
    ['CANCELLED', 'PENDING', 'CEO'],
    ['ARCHIVED', 'SERVED', 'CEO'],
    ['PENDING', 'CONFIRMED', 'KIOSK'],
  ] as const)('refuse %s → %s pour %s', (from, to, role) => {
    expect(canTransition(from, to, role)).toBe(false)
  })
})
