<template>
  <PortalLayer v-model="visible" title="作品设置" modal class="work-settings-dialog" :before-close="beforeClose">
    <form class="work-settings" @submit.prevent="save">
      <p class="settings-intro">完善作品信息，让更多读者发现你的故事。</p>
      <div class="settings-grid">
        <section class="cover-editor" aria-label="作品封面">
          <div class="cover-preview">
            <img v-if="form.cover && !coverFailed" :src="avatarUrl(form.cover) || form.cover" alt="作品封面" @error="coverFailed = true" />
            <div v-else class="cover-placeholder"><span aria-hidden="true">▧</span><small>{{ coverFailed ? '封面加载失败' : '暂无封面' }}</small></div>
          </div>
          <div class="cover-actions">
            <label class="cover-upload upload-control" :class="{ disabled: uploading }">
              <input type="file" accept="image/png,image/jpeg" :disabled="uploading || saving" aria-label="上传作品封面" @change="uploadCover($event.target.files[0]); $event.target.value = ''" />
              <span>{{ uploading ? '上传中…' : form.cover ? '更换封面' : '上传封面' }}</span>
            </label>
            <p>建议 A4 比例（210:297）<br />支持 JPG、PNG，大小不超过 5 MB</p>
          </div>
        </section>
        <section class="settings-fields" aria-label="作品信息">
          <label class="field">书名<input v-model="form.title" maxlength="100" placeholder="请输入作品名称" /></label>
          <label class="field">分类<select v-model="form.genreId" aria-label="分类"><option value="">请选择分类</option><option v-for="category in categories" :key="category.categoryId" :value="category.categoryId">{{ category.categoryName }}</option></select></label>
          <label class="field">简介<textarea v-model="form.summary" placeholder="介绍你的故事、人物或看点" /></label>
          <div class="settings-pricing">
            <label class="field">定价（元）<input v-model.trim="form.price" type="text" inputmode="decimal" placeholder="请输入定价" /></label>
            <label class="field">合作方式<select v-model="form.tradeType"><option value="" disabled>请选择合作方式</option><option v-if="form.tradeType && !tradeTypes.includes(form.tradeType)" :value="form.tradeType">当前值：{{ form.tradeType }}</option><option value="exclusive">独家授权</option><option value="non_exclusive">非独家授权</option><option value="adaptation">改编授权</option></select></label>
          </div>
          <p class="settings-hint">定价最多保留两位小数。实际交易的授权范围以双方达成的协议为准。</p>
        </section>
      </div>
      <div class="settings-errors">
        <p v-if="categoryError" class="note bad" role="alert">{{ categoryError }}<button type="button" class="text-button" @click="loadCategories">重试</button></p>
        <p v-if="error" class="note bad" role="alert">{{ error }}</p>
      </div>
      <div class="settings-footer">
        <button type="button" class="btn quiet" :disabled="saving || uploading" @click="beforeClose(() => visible = false)">取消</button>
        <button class="btn" :disabled="saving || uploading || !!categoryError">{{ saving ? '保存中…' : '保存设置' }}</button>
      </div>
    </form>
  </PortalLayer>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import { canEdit, validateFile, validateWork } from '../../utils/creator.js'
import PortalLayer from '../../components/PortalLayer.vue'
import { avatarUrl } from '../../utils/avatarUrl.js'
const props = defineProps({ modelValue: Boolean, work: Object })
const emit = defineEmits(['update:modelValue', 'saved'])
const { api, user, handleError } = usePortal()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const form = reactive({ title: props.work.title, genreId: props.work.genreId, summary: props.work.summary || '', cover: props.work.cover || '', price: props.work.price == null ? '' : String(props.work.price), tradeType: props.work.tradeType || '' })
const original = JSON.stringify(form)
const tradeTypes = ['exclusive', 'non_exclusive', 'adaptation']
const categories = ref([])
const error = ref('')
const categoryError = ref('')
const saving = ref(false)
const uploading = ref(false)
const coverFailed = ref(false)
async function loadCategories() { categoryError.value = ''; try { categories.value = await api.value.listCategories() } catch (failure) { categoryError.value = failure.message; await handleError(failure) } }
async function beforeClose(done) {
  if (saving.value || uploading.value) return
  if (JSON.stringify(form) !== original) { try { await ElMessageBox.confirm('作品设置尚未保存，确定离开？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑' }) } catch { return } }
  done()
}
async function uploadCover(file) {
  if (!file || uploading.value) return
  error.value = validateFile(file, ['png', 'jpg', 'jpeg'], 5)
  if (error.value) return
  uploading.value = true
  try { const result = await api.value.upload(file, 'cover'); if (!result.url) throw new Error('封面上传响应缺少图片地址，请重试'); form.cover = result.url; coverFailed.value = false }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { uploading.value = false }
}
async function save() {
  if (saving.value || uploading.value || !canEdit(user.value, props.work)) return
  error.value = validateWork(form)
  if (!error.value && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(form.price) || Number(form.price) > 9999999999.99)) error.value = '定价须为 0 到 9999999999.99，最多两位小数'
  if (error.value) return
  saving.value = true
  try { await api.value.updateWork(props.work.workId, { ...form, price: form.price === '' ? undefined : form.price, tradeType: tradeTypes.includes(form.tradeType) ? form.tradeType : undefined }); ElMessage.success('作品设置已保存'); emit('saved'); visible.value = false }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { saving.value = false }
}
onMounted(loadCategories)
</script>

<style scoped>
:global(.work-settings-dialog) { background: var(--paper-2); border-radius: 6px; overflow: hidden; }
:global(.work-settings-dialog .el-dialog__body) { padding: 0; }
:global(.work-settings-dialog .el-dialog__header) { border-bottom: 0; padding-bottom: 0; }
:global(.work-settings-dialog .el-dialog__title) { font-size: 18px; }
.work-settings { color: var(--ink); }
.settings-intro { margin: 0; padding: 4px 24px 18px; color: var(--ink-3); font-size: 13px; border-bottom: 1px solid var(--rule); }
.settings-grid { display: grid; grid-template-columns: 280px minmax(0, 1fr); }
.cover-editor { min-width: 0; padding: 26px 24px; border-right: 1px solid var(--rule); }
.cover-preview { width: 100%; aspect-ratio: 210 / 297; overflow: hidden; background: var(--paper); border: 1px solid var(--rule); border-radius: 4px; }
.cover-preview img { display: block; width: 100%; height: 100%; object-fit: cover; }
.cover-placeholder { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--ink-3); }
.cover-placeholder span { font-size: 38px; line-height: 1; }
.cover-placeholder small { font-size: 12px; }
.cover-upload { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 40px; margin-top: 12px; padding: 8px 14px; color: white; background: var(--indigo); border: 1px solid var(--indigo); border-radius: 4px; font-size: 13px; font-weight: 500; line-height: 1.5; }
.cover-upload:hover { background: var(--indigo-dim); }
.cover-upload.disabled { opacity: .55; cursor: wait; }
.cover-actions p { margin: 12px 0 0; color: var(--ink-3); font-size: 12px; line-height: 1.7; }
.settings-fields { min-width: 0; padding: 26px 30px; }
.work-settings .field { margin: 0 0 18px; color: var(--ink-2); font-size: 13px; }
.work-settings .field input, .work-settings .field select, .work-settings .field textarea { margin-top: 7px; padding: 10px 11px; border-radius: 4px; }
.work-settings .field textarea { min-height: 110px; line-height: 1.7; }
.settings-pricing { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
.settings-pricing .field { margin-bottom: 0; }
.settings-hint { margin: 12px 0 0; color: var(--ink-3); font-size: 12px; line-height: 1.6; }
.settings-errors:not(:empty) { padding: 0 24px; }
.settings-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--rule); }
.settings-footer .btn { min-width: 94px; }
@media (max-width: 640px) {
  .settings-grid { grid-template-columns: 1fr; }
  .cover-editor { display: flex; gap: 16px; align-items: center; padding: 18px; border-right: 0; border-bottom: 1px solid var(--rule); }
  .cover-preview { width: 100px; flex: none; }
  .cover-actions { flex: 1; min-width: 0; }
  .cover-upload { margin-top: 0; }
  .settings-fields { padding: 20px 18px; }
  .settings-intro { padding-left: 18px; padding-right: 18px; }
  .settings-footer { padding: 14px 18px; }
}
@media (max-width: 360px) { .settings-pricing { grid-template-columns: 1fr; } }
</style>
