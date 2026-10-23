<template>
  <PortalLayer v-model="visible" title="作品设置" wide :before-close="beforeClose"><div class="panel-content"><form @submit.prevent="save"><div class="grid2"><section><div class="sub-head"><h3>作品信息</h3></div><div class="panel attached"><label class="field">书名<input v-model="form.title" maxlength="100" /></label><label class="field">分类<select aria-label="分类" v-model="form.genreId"><option value="">请选择分类</option><option v-for="category in categories" :key="category.categoryId" :value="category.categoryId">{{ category.categoryName }}</option></select></label><label class="field">简介<textarea v-model="form.summary" /></label><button class="btn sm" :disabled="saving || uploading || !!categoryError">{{ saving ? '保存中…' : '保存' }}</button></div></section><section><div class="sub-head"><h3>封面与定价</h3></div><div class="panel attached"><label class="field">封面</label><img v-if="form.cover" :src="form.cover" class="settings-cover" alt="作品封面" /><label class="drop upload-control"><input type="file" accept="image/png,image/jpeg" @change="uploadCover($event.target.files[0]); $event.target.value = ''" /><span>{{ uploading ? '上传中…' : '点击上传封面（建议 A4 比例（210:297），≤5 MB）' }}</span></label><label class="field top-gap">定价（元）<input :value="work.price || 0" readonly /></label><p class="cost">0 表示免费。定价与授权方式由平台合作流程维护。</p><label class="field">合作方式<select disabled><option>{{ work.authorizationType || '独家授权' }}</option></select></label><p class="cost">当前保存仅修改书名、分类、简介与封面。</p></div></section></div><p v-if="categoryError" class="note bad" role="alert">{{ categoryError }}<button type="button" class="text-button" @click="loadCategories">重试</button></p><p v-if="error" class="note bad" role="alert">{{ error }}</p></form></div></PortalLayer>
</template>
<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../../utils/portal.js'
import { canEdit, validateFile, validateWork } from '../../utils/creator.js'
import PortalLayer from '../../components/PortalLayer.vue'
const props = defineProps({ modelValue: Boolean, work: Object })
const emit = defineEmits(['update:modelValue', 'saved'])
const { api, user, handleError } = usePortal()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const form = reactive({ title: props.work.title, genreId: props.work.genreId, summary: props.work.summary || '', cover: props.work.cover || '' })
const original = JSON.stringify(form)
const categories = ref([])
const error = ref('')
const categoryError = ref('')
const saving = ref(false)
const uploading = ref(false)
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
  try { const result = await api.value.upload(file, 'cover'); if (!result.url) throw new Error('封面上传响应缺少图片地址，请重试'); form.cover = result.url }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { uploading.value = false }
}
async function save() {
  if (saving.value || uploading.value || !canEdit(user.value, props.work)) return
  error.value = validateWork(form)
  if (error.value) return
  saving.value = true
  try { await api.value.updateWork(props.work.workId, form); ElMessage.success('作品设置已保存'); emit('saved'); visible.value = false }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { saving.value = false }
}
onMounted(loadCategories)
</script>
