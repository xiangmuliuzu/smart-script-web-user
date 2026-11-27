import test from 'node:test'
import assert from 'node:assert/strict'

import { portalSwitchHref } from '../src/portal.js'

test('生产同域跳转到企业端 base 路径', () => {
  assert.equal(
    portalSwitchHref({
      protocol: 'http:',
      hostname: '192.168.100.3',
      port: '1100',
      origin: 'http://192.168.100.3:1100'
    }),
    'http://192.168.100.3:1100/enterprise/'
  )
})

test('本地联调从 3001 切到企业端 3002', () => {
  assert.equal(
    portalSwitchHref({
      protocol: 'http:',
      hostname: 'localhost',
      port: '3001',
      origin: 'http://localhost:3001'
    }),
    'http://localhost:3002/enterprise/'
  )
})
