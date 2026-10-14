import { request } from '../auth.js'
import { asList } from '../utils/creator.js'

// 沿用若依 request，认证响应保持顶层结构，业务接口在这里读取 data。
const data = async (path, options) => (await request(path, options)).data
const workPath = id => '/api/v1/users/me/works/' + encodeURIComponent(id)
export const listWorks = async () => asList(await data('/api/v1/users/me/works'))
export const getWork = async id => {
  const detail = await data(workPath(id))
  if (detail?.chapters) detail.chapters = detail.chapters.map(chapter => ({ ...chapter, content: chapter.formattedContent || chapter.content || '' }))
  return detail
}
export const listReviews = async id => asList(await data(workPath(id) + '/review-records'))
export const listVersions = async id => asList(await data(`/api/v1/content/works/${encodeURIComponent(id)}/versions`))
export const listCategories = async () => asList(await data('/api/v1/content/categories'))
export const createWork = form => data('/api/v1/content/works', { method: 'POST', body: { title: form.title.trim(), categoryId: Number(form.genreId), description: form.summary, scriptUrl: form.scriptUrl, scriptName: form.scriptName, scriptSize: form.scriptSize } })
export const updateWork = (id, form) => data(workPath(id), { method: 'PUT', body: { title: form.title.trim(), genreId: Number(form.genreId), summary: form.summary, cover: form.cover } })
export const submitWork = id => data(workPath(id) + '/submit', { method: 'POST' })
export const saveChapter = (id, chapter) => data(workPath(id) + '/chapters' + (chapter.chapterId ? '/' + encodeURIComponent(chapter.chapterId) : ''), { method: chapter.chapterId ? 'PUT' : 'POST', body: { chapterTitle: chapter.chapterTitle.trim(), content: chapter.content } })
export const deleteChapter = (id, chapterId) => data(workPath(id) + '/chapters/' + encodeURIComponent(chapterId), { method: 'DELETE' })
export async function upload(file, purpose = 'script') {
  const body = new FormData()
  // 后端剧本上传白名单包含 txt/docx，Markdown 保留文本内容并按 txt 上传。
  const uploaded = purpose === 'script' && /\.md$/i.test(file.name) ? new File([file], file.name.replace(/\.md$/i, '.txt'), { type: 'text/plain' }) : file
  body.append('file', uploaded)
  const path = purpose === 'avatar' ? '/api/v1/users/me/avatar' : purpose === 'material' ? '/api/v1/users/me/real-name/material' : '/api/v1/content/upload'
  if (purpose === 'script' || purpose === 'cover') body.append('type', purpose)
  return data(path, { method: 'POST', body })
}
export const generate = (type, form) => data('/api/v1/content/ai/' + type, { method: 'POST', body: form })
export const listAiRecords = async () => asList(await data('/api/v1/content/ai/write-records'))
export const listMessages = async () => asList(await data('/api/v1/messages?pageSize=100')).map(item => ({ ...item, isRead: item.read, content: item.summary, createTime: item.createdAt }))
export const getMessage = id => data(`/api/v1/messages/${encodeURIComponent(id)}`)
export const unreadCount = async () => (await data('/api/v1/messages/unread-count')).total
export const readMessage = id => data(`/api/v1/messages/${encodeURIComponent(id)}/read`, { method: 'PUT' })
export const readAllMessages = () => data('/api/v1/messages/read-all', { method: 'PUT' })
export const openChat = () => data('/api/v1/users/me/chat/sessions', { method: 'POST', body: { businessType: 'GENERAL', businessName: '平台沟通' } })
export const listChat = async id => asList(await data(`/api/v1/users/me/chat/sessions/${encodeURIComponent(id)}/messages`))
export const sendChat = (id, content) => data(`/api/v1/users/me/chat/sessions/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { msgType: 'TEXT', content } })
export const getProfile = () => data('/api/v1/users/me/profile')
export const saveProfile = form => data('/api/v1/users/me/profile', { method: 'PUT', body: { nickname: form.nickname, avatar: form.avatar, bio: form.bio } })
export const getRealName = () => data('/api/v1/users/me/real-name')
export const submitRealName = (form, resubmit = false) => data('/api/v1/users/me/real-name' + (resubmit ? '/resubmit' : ''), { method: 'POST', body: form })
export const changePassword = form => data('/api/v1/auth/password/change', { method: 'POST', body: form })
export const phoneChange = (step, body) => data('/api/v1/users/me/phone/change/' + step, { method: 'POST', body })
export const listFeedback = async () => asList(await data('/api/v1/feedback'))
export const sendFeedback = form => data('/api/v1/feedback', { method: 'POST', body: { category: form.category, content: form.content, attachmentRef: form.attachmentRef } })
