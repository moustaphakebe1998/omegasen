export type SSEEventType =
  | 'order:new'
  | 'order:update'
  | 'order:cancelled'
  | 'menu:update'
  | 'kitchen:alert'
  | 'system:notice'
  | 'heartbeat'

const connections = new Map<string, Set<ReadableStreamDefaultController>>()

export function broadcast<T>(restaurantId: string, type: SSEEventType, data: T): void {
  const subs = connections.get(restaurantId)
  if (!subs) return
  const msg = `data: ${JSON.stringify({ type, data, ts: Date.now() })}\n\n`
  const encoder = new TextEncoder()
  for (const ctrl of subs) {
    try { ctrl.enqueue(encoder.encode(msg)) } catch { subs.delete(ctrl) }
  }
}

export function createSSEStream(restaurantId: string): ReadableStream {
  let ctrl: ReadableStreamDefaultController
  const stream = new ReadableStream({
    start(c) {
      ctrl = c
      if (!connections.has(restaurantId)) connections.set(restaurantId, new Set())
      connections.get(restaurantId)!.add(ctrl)
      const encoder = new TextEncoder()
      ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`))
    },
    cancel() {
      connections.get(restaurantId)?.delete(ctrl)
    },
  })
  return stream
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no',
}
