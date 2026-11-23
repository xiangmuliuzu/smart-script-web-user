import test from 'node:test'
import assert from 'node:assert/strict'
import { uuid } from '../src/utils/uuid.js'

const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('uuid 生成 RFC 4122 v4，且每次都不同', () => {
  const first = uuid()
  assert.match(first, v4)
  assert.notEqual(first, uuid())
})
