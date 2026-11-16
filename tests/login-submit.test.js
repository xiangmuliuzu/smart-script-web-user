import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { computed, ref, reactive } from 'vue'

test('a second submit during async validation cannot issue another login', async () => {
  const source = await readFile(new URL('../src/views/Login.vue', import.meta.url), 'utf8')
  const setup = source.split('<script setup>')[1].split('</script>')[0].replace(/^import .*$/gm, '')
  let release
  const validation = new Promise(resolve => { release = resolve })
  let requests = 0
  const context = { computed, ref, reactive, onMounted() {},
    portal: { rememberKey: 'test-only' }, localStorage: { getItem() {}, removeItem() {} },
    useRoute: () => ({ query: {} }), useRouter: () => ({ replace: async () => {} }),
    login: async () => { requests++ }, safeRedirect: () => '/session',
    getCaptcha: async () => ({ captchaEnabled: false }), ElMessage: { info() {} }
  }
  runInNewContext(setup + '\nglobalThis.page = { submit, formRef, form, captchaReady, loading }', context)
  const page = context.page
  page.formRef.value = { validate: () => validation }
  page.captchaReady.value = true
  page.form.code = '1234'
  const first = page.submit()
  const second = page.submit()
  release(true)
  await Promise.all([first, second])
  assert.equal(requests, 1)
  assert.equal(page.loading.value, false)
})
