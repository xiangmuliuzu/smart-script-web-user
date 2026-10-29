import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTodoOrders, orderStepIndex } from '../src/utils/orderTodo.js'

test('seller todo orders include all pages and ignore non-active statuses', async () => {
  const calls = []
  const api = { async listOrders(params) {
    calls.push(params)
    if (params.status === 'confirmed' && params.pageNum === 1) return { total: 101, rows: Array.from({ length: 100 }, (_, i) => ({ orderId: i + 1, status: 'confirmed' })) }
    if (params.status === 'confirmed') return { total: 101, rows: [{ orderId: 101, status: 'confirmed' }] }
    if (params.status === 'paying') return { total: 1, rows: [{ orderId: 102, status: 'paying' }, { orderId: 103, status: 'completed' }] }
    return { total: 0, rows: [] }
  } }
  const result = await loadTodoOrders(api, 'seller')
  assert.equal(result.length, 102)
  assert.ok(result.some(order => order.orderId === 101))
  assert.ok(result.every(order => order.status !== 'completed'))
  assert.ok(calls.every(call => call.role === 'seller'))
  assert.equal(orderStepIndex('delivering'), 2)
})

test('order retrieval failures are surfaced for retry', async () => {
  await assert.rejects(loadTodoOrders({ listOrders: async () => { throw new Error('订单加载失败') } }, 'seller'), /订单加载失败/)
})
