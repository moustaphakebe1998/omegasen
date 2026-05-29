import { describe, it, expect, vi } from 'vitest'
import { ALLOWED_TRANSITIONS } from '@/server/orders'

describe('Order status transitions', () => {
  it('allows PENDING → CONFIRMED', () => {
    const transitions = ALLOWED_TRANSITIONS['PENDING']
    expect(transitions?.map(t => t.to)).toContain('CONFIRMED')
  })

  it('allows CONFIRMED → PREPARING', () => {
    const transitions = ALLOWED_TRANSITIONS['CONFIRMED']
    expect(transitions?.map(t => t.to)).toContain('PREPARING')
  })

  it('allows PREPARING → READY', () => {
    const transitions = ALLOWED_TRANSITIONS['PREPARING']
    expect(transitions?.map(t => t.to)).toContain('READY')
  })

  it('allows READY → SERVED', () => {
    const transitions = ALLOWED_TRANSITIONS['READY']
    expect(transitions?.map(t => t.to)).toContain('SERVED')
  })

  it('allows PREPARING → CONFIRMED (rollback)', () => {
    const transitions = ALLOWED_TRANSITIONS['PREPARING']
    const rollbacks = transitions?.filter(t => t.isRollback)
    expect(rollbacks?.map(t => t.to)).toContain('CONFIRMED')
  })

  it('allows READY → PREPARING (rollback)', () => {
    const transitions = ALLOWED_TRANSITIONS['READY']
    const rollbacks = transitions?.filter(t => t.isRollback)
    expect(rollbacks?.map(t => t.to)).toContain('PREPARING')
  })

  it('does NOT allow CANCELLED → any status', () => {
    const transitions = ALLOWED_TRANSITIONS['CANCELLED']
    expect(transitions).toBeUndefined()
  })

  it('does NOT allow ARCHIVED → any status', () => {
    const transitions = ALLOWED_TRANSITIONS['ARCHIVED']
    expect(transitions).toBeUndefined()
  })

  it('does NOT allow SERVED → CANCELLED directly', () => {
    const transitions = ALLOWED_TRANSITIONS['SERVED']
    const toStatuses = transitions?.map(t => t.to) ?? []
    expect(toStatuses).not.toContain('CANCELLED')
  })

  it('requires elevated role for SERVED → READY rollback', () => {
    const transitions = ALLOWED_TRANSITIONS['SERVED']
    const rollback = transitions?.find(t => t.to === 'READY' && t.isRollback)
    expect(rollback).toBeDefined()
    expect(rollback?.roles).toContain('CEO')
    expect(rollback?.roles).toContain('MANAGER')
    expect(rollback?.roles).not.toContain('KITCHEN')
  })
})
