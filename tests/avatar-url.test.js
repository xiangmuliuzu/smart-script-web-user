import test from 'node:test'
import assert from 'node:assert/strict'
import { avatarUrl } from '../src/utils/avatarUrl.js'

test('platform avatars load through the current API prefix rather than the SPA host or an old device', () => {
  const path = '/profile/upload/2026/10/14/avatar.jpg'
  assert.equal(avatarUrl(path), '/dev-api' + path)
  assert.equal(avatarUrl(path, '/prod-api/'), '/prod-api' + path)
  assert.equal(avatarUrl('http://10.0.2.2:8080' + path, '/dev-api'), '/dev-api' + path)
  assert.equal(avatarUrl('http://localhost:3001/dev-api' + path, '/dev-api'), '/dev-api' + path)
  assert.equal(avatarUrl(path, 'https://api.example.test/api/v1'), 'https://api.example.test' + path)
})
test('external avatars and local raster previews are preserved; empty, unsafe or traversal values use fallback', () => {
  assert.equal(avatarUrl('https://cdn.example.test/avatar.jpg'), 'https://cdn.example.test/avatar.jpg')
  const localImage = 'data:image/png;base64,test-only'
  assert.equal(avatarUrl(localImage), localImage)
  for (const value of [null, '', '   ', '//evil.test/avatar.jpg', 'javascript:alert(1)', 'data:text/html,test', '/profile/upload/../secret.jpg']) assert.equal(avatarUrl(value), '')
})
