import test from 'node:test'
import assert from 'node:assert/strict'

import { portalSwitchHref } from '../src/portal.js'

test('生产同域跳转到企业端 base 路径', () => {
  assert.equal(
    portalSwitchHref({
      protocol: 'https:',
      hostname: 'www.eyhereal.site',
      port: '',
      origin: 'https://www.eyhereal.site'
    }),
    'https://www.eyhereal.site/enterprise/'
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
