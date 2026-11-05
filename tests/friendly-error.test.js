import test from 'node:test'
import assert from 'node:assert/strict'
import { friendlyErrorMessage, networkErrorMessage, safeMessage } from '../src/utils/friendly-error.js'

test('known code and status use Chinese copy', () => {
  assert.equal(friendlyErrorMessage({ code: 40001, message: 'sms code invalid' }), '验证码错误，请重新输入')
  assert.equal(friendlyErrorMessage({ code: 40301, message: 'account disabled' }), '账号暂时无法使用，请联系客服或管理员')
  assert.equal(friendlyErrorMessage({ status: 404 }), '内容不存在或暂时不可用')
  assert.equal(friendlyErrorMessage({ status: 503 }), '服务暂时不可用，请稍后再试')
})

test('safe backend Chinese is preserved', () => {
  assert.equal(friendlyErrorMessage({ message: '姓名长度不正确，请检查后重试' }), '姓名长度不正确，请检查后重试')
})

test('English or technical copy is replaced', () => {
  assert.equal(friendlyErrorMessage({ status: 400, message: 'invalid request' }), '您的信息不符合规范，请检查后重试')
  assert.equal(friendlyErrorMessage({ message: 'HTTP 404' }), '操作未完成，请稍后再试')
  assert.equal(safeMessage('Some English'), null)
})

test('network and timeout errors are friendly', () => {
  assert.equal(networkErrorMessage(new TypeError('Failed to fetch')), '网络连接异常，请检查网络后重试')
  const timeout = new Error('timeout')
  timeout.name = 'TimeoutError'
  assert.equal(networkErrorMessage(timeout), '请求超时，请稍后再试')
})
