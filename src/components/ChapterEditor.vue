<template>
  <PortalLayer v-model="visible" :title="form.chapterId ? '编辑章节' : '新建章节'" modal big :before-close="beforeClose">
    <div v-if="opinion" class="note bad editor-note">{{ opinion }}</div>
    <form @submit.prevent="save">
      <div class="row"><label class="field grow">章节标题<input v-model="form.chapterTitle" placeholder="给这一章起个名字" maxlength="100" /></label><label class="field chapter-number">集数<input :value="chapterNo" readonly /></label></div>
      <div class="field">正文<ScriptEditor v-model="form.content" label="正文" hide-title compact :disabled="saving || importing" /></div>
      <div class="chapter-trial-setting"><el-switch v-model="form.isFree" active-value="1" inactive-value="0" aria-label="设为试读章节（免费阅读）" :disabled="saving || importing" /><span>设为试读章节（免费阅读）</span></div>
      <div class="field"><label>或从草稿上传</label><label class="drop upload-control" :class="{ done: imported }" @dragover.prevent @drop.prevent="importFile($event.dataTransfer.files[0])"><input type="file" accept=".txt,.md,.docx" @change="importFile($event.target.files[0]); $event.target.value = ''" /><span>{{ importing ? '正在读取草稿…' : imported || '点击选择草稿文件（.txt / .docx / .md），也可以直接拖进来' }}</span></label></div>
      <p v-if="error" class="note bad" role="alert">{{ error }}</p>
      <div class="row"><button class="btn" :disabled="saving || importing" type="submit">{{ saving ? '正在保存…' : '保存' }}</button><button class="btn quiet" :disabled="saving || importing" type="button" @click="save">存为草稿</button><span class="cost">{{ wordCount(form.content).toLocaleString() }} 字 · 保存后可提交审核</span></div>
    </form>
  </PortalLayer>
</template>
<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePortal } from '../utils/portal.js'
import { validateChapter, wordCount } from '../utils/creator.js'
import { readDraft } from '../utils/draft.js'
import PortalLayer from './PortalLayer.vue'
import ScriptEditor from './ScriptEditor.vue'
import '../assets/styles/creation.css'
const props = defineProps({ modelValue: Boolean, workId: [String, Number], chapter: Object, chapterNo: Number, opinion: String, initialContent: String })
const emit = defineEmits(['update:modelValue', 'saved'])
const { api, handleError, canCreate } = usePortal()
const visible = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const form = reactive({ chapterId: props.chapter?.chapterId, chapterTitle: props.chapter?.chapterTitle || '', content: props.chapter?.content || props.initialContent || '', isFree: String(props.chapter?.isFree ?? '0') })
const original = JSON.stringify(form)
const error = ref('')
const saving = ref(false)
const importing = ref(false)
const imported = ref('')
async function beforeClose(done) {
  if (saving.value || importing.value) return
  if (JSON.stringify(form) !== original) { try { await ElMessageBox.confirm('章节内容尚未保存，确定离开？', '未保存的修改', { confirmButtonText: '放弃修改', cancelButtonText: '继续编辑', type: 'warning' }) } catch { return } }
  done()
}
async function importFile(file) {
  if (!file || importing.value || saving.value) return
  if (form.content.trim()) { try { await ElMessageBox.confirm('导入草稿会替换当前正文，是否继续？', '导入草稿', { confirmButtonText: '替换正文', cancelButtonText: '取消' }) } catch { return } }
  importing.value = true; error.value = ''
  try { form.content = await readDraft(file); if (!form.chapterTitle.trim()) form.chapterTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 100); imported.value = '已载入 · ' + file.name }
  catch (failure) { error.value = failure.message }
  finally { importing.value = false }
}
async function save() {
  if (saving.value || importing.value) return
  error.value = validateChapter(form)
  if (error.value) return
  if (!canCreate.value) { error.value = '请先开通创作者能力'; return }
  saving.value = true
  try { await api.value.saveChapter(props.workId, form); ElMessage.success('章节已保存'); emit('saved'); visible.value = false }
  catch (failure) { error.value = failure.message; await handleError(failure) }
  finally { saving.value = false }
}
</script>
