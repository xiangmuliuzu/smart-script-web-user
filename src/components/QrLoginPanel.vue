<template>
  <div class="qr-panel">
    <h2 class="qr-heading">扫码登录</h2>
    <p class="qr-sub">请使用<b>剧云策 App</b> 扫一扫</p>

    <div class="qr-stage">
      <img v-if="qrImage" :src="qrImage" alt="扫码登录二维码" class="qr-image" />
      <div v-else class="qr-placeholder">二维码加载中…</div>

      <div v-if="status === 'scanned'" class="qr-mask">
        <span class="qr-spinner" aria-hidden="true" />
        <b>扫码成功</b>
        <p>正在等待手机端确认…</p>
        <small v-if="scannedAccount">{{ scannedAccount }}</small>
        <button type="button" class="qr-reject" :disabled="rejecting" @click="reject">不是我，拒绝登录</button>
      </div>
      <div v-else-if="status === 'confirmed'" class="qr-mask">
        <span class="qr-spinner" aria-hidden="true" />
        <b>登录成功</b>
        <p>正在进入工作台…</p>
      </div>
      <div v-else-if="status === 'expired' || status === 'error'" class="qr-mask">
        <b>{{ status === 'error' ? failureTitle : '二维码已失效' }}</b>
        <p v-if="errorMessage">{{ errorMessage }}</p>
        <button type="button" class="qr-refresh" @click="start">刷新二维码</button>
      </div>
    </div>

    <p class="qr-hint" aria-live="polite">
      <template v-if="status === 'scanned'">手机上点击「确认登录」后，本页自动进入工作台</template>
      <template v-else-if="status === 'confirmed'">登录成功，正在跳转…</template>
      <template v-else-if="status === 'expired' || status === 'error'">点击上方按钮重新获取二维码</template>
      <template v-else-if="status === 'loading'">正在生成二维码…</template>
      <template v-else>打开 App 后点「我的 · 扫一扫」· 二维码 {{ remaining }} 秒内有效</template>
    </p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue'
import QRCode from 'qrcode'
import { useRoute, useRouter } from 'vue-router'
import { abortQrLogin, acceptQrLogin, createQrLogin, isAuthFailure, pollQrLogin, safeRedirect } from '../auth.js'

const router = useRouter()
const route = useRoute()

const status = ref('loading')
const qrImage = ref('')
const qrToken = ref('')
const scannedAccount = ref('')
const errorMessage = ref('')
const failureTitle = ref('二维码加载失败')
const remaining = ref(120)
const rejecting = ref(false)

let pollTimer = null
let expiryTimer = null
let pollInterval = 2
let generation = 0

function stopTimers() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
  if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = null }
}

/** 出码：服务端只回一次性票据，二维码里也只放这张票据，不含任何账号信息。 */
async function start() {
  stopTimers()
  const current = ++generation
  status.value = 'loading'
  qrImage.value = ''
  qrToken.value = ''
  scannedAccount.value = ''
  errorMessage.value = ''
  remaining.value = 120

  try {
    const result = await createQrLogin()
    if (current !== generation) return
    qrToken.value = result.qrToken
    remaining.value = result.expiresIn || 120
    pollInterval = Math.max(1, result.pollInterval || 2)
    // 载荷是 App 专用的 scheme + 一次性票据：通用扫码器只会显示一串文本，
    // 不会把它当网页打开，也就没有把用户导向仿冒站点的余地。
    qrImage.value = await QRCode.toDataURL(
      `juyunce://qr-login?t=${encodeURIComponent(result.qrToken)}`,
      {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#1B1A18', light: '#FFFFFF' }
      }
    )
    if (current !== generation) return
    status.value = 'waiting'
    countdown()
    schedulePoll(current)
  } catch (failure) {
    if (current !== generation) return
    failureTitle.value = '二维码加载失败'
    errorMessage.value = failure.message || '请稍后重试'
    status.value = 'error'
  }
}

/** 陌生人在扫我的码：当场作废，避免对方确认后把我的浏览器登进他的账号。 */
async function reject() {
  if (rejecting.value) return
  rejecting.value = true
  try {
    await abortQrLogin(qrToken.value)
  } catch {
    // 作废失败也把本地状态收口：票据到期自然失效，不给用户留下「还能被确认」的错觉。
  }
  rejecting.value = false
  generation += 1
  stopTimers()
  failureTitle.value = '已拒绝本次登录'
  errorMessage.value = '如果不是你本人扫码，请在手机上重新登录。'
  status.value = 'error'
}

function countdown() {
  expiryTimer = setInterval(() => {
    remaining.value -= 1
    if (remaining.value <= 0) {
      stopTimers()
      if (status.value !== 'confirmed') status.value = 'expired'
    }
  }, 1000)
}

function schedulePoll(current) {
  pollTimer = setTimeout(() => poll(current), pollInterval * 1000)
}

async function poll(current) {
  if (current !== generation || !qrToken.value) return
  try {
    const result = await pollQrLogin(qrToken.value)
    if (current !== generation) return
    if (result.status === 'SCANNED') {
      status.value = 'scanned'
      scannedAccount.value = [result.nickname, result.phoneMasked].filter(Boolean).join(' · ')
    } else if (result.status === 'CONFIRMED' && result.token) {
      await finish(result)
      return
    }
    schedulePoll(current)
  } catch (failure) {
    if (current !== generation) return
    // 票据失效 / 鉴权失败都直接结束；其余（网络抖动、限频）继续轮询到票据自然过期。
    if (isAuthFailure(failure) || /已失效|不存在/.test(failure.message || '')) {
      stopTimers()
      status.value = 'expired'
      return
    }
    schedulePoll(current)
  }
}

async function finish(result) {
  generation += 1
  stopTimers()
  status.value = 'confirmed'
  try {
    acceptQrLogin(result)
    // 留一小段「登录成功」的可读时间再跳转；令牌已落库，用户不会看到卡住的旧状态。
    await new Promise((resolve) => setTimeout(resolve, 400))
    await router.replace(safeRedirect(route.query.redirect))
  } catch (failure) {
    // 准入失败（账号域 / 创作者能力）拦在这里：令牌不落库，直接说明原因，不让用户误以为已登录。
    failureTitle.value = '无法登录'
    errorMessage.value = failure.message || '账号暂不满足登录条件'
    status.value = 'error'
  }
}

onBeforeUnmount(() => {
  generation += 1
  stopTimers()
})

start()
</script>

<style scoped>
.qr-panel {
  /* 两端主题变量名不同：这里做一次映射，面板在两个门户里都能取到颜色。 */
  --qr-ink: var(--ink);
  --qr-muted: var(--ink-2, var(--muted));
  --qr-faint: var(--ink-3, var(--muted));
  --qr-line: var(--rule-2, var(--line));
  --qr-accent: var(--indigo, var(--brand));
  --qr-surface: var(--paper-2, #fff);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.qr-heading { margin: 0 0 8px; font-size: 24px; color: var(--qr-ink); }
.qr-sub { margin: 0 0 26px; font-size: 13px; color: var(--qr-muted); }
.qr-sub b { color: var(--qr-ink); font-weight: 500; }
.qr-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 268px;
  height: 268px;
  padding: 14px;
  border-radius: 12px;
  background: var(--qr-surface);
  box-shadow: 0 0 0 1px var(--qr-line) inset;
}
.qr-image { width: 240px; height: 240px; display: block; }
.qr-placeholder { font-size: 13px; color: var(--qr-faint); }
.qr-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 18px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
}
.qr-mask b { font-size: 15px; color: var(--qr-ink); font-weight: 500; }
.qr-mask p { margin: 0; font-size: 12.5px; color: var(--qr-muted); line-height: 1.6; }
.qr-mask small { margin-top: 6px; font-size: 12px; color: var(--qr-faint); }
.qr-spinner {
  width: 22px;
  height: 22px;
  margin-bottom: 10px;
  border: 2px solid var(--qr-line);
  border-top-color: var(--qr-accent);
  border-radius: 50%;
  animation: qr-spin 0.8s linear infinite;
}
@keyframes qr-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .qr-spinner { animation-duration: 2.4s; }
}
.qr-refresh {
  margin-top: 14px;
  padding: 8px 18px;
  border: 1px solid var(--qr-accent);
  border-radius: 2px;
  background: var(--qr-accent);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.qr-refresh:hover { background: var(--qr-ink); border-color: var(--qr-ink); }
.qr-reject {
  margin-top: 12px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--qr-accent);
  font-size: 12.5px;
  text-decoration: underline;
  cursor: pointer;
}
.qr-reject:disabled { opacity: 0.6; cursor: default; }
.qr-hint { margin: 20px 0 0; font-size: 12.5px; color: var(--qr-faint); min-height: 18px; }
</style>
