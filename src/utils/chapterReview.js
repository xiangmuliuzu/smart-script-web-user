export const chapterApproved = chapter => ['0', 'approved'].includes(String(chapter?.status))

export function chapterReviewState(chapter, workStatus) {
  if (workStatus === 'reviewing' && chapter?.chapterId) return { label: '审核中', tone: 'wait' }
  if (['2', 'revision', 'rejected'].includes(String(chapter?.status))
      || (chapterApproved(chapter) && ['revision', 'rejected'].includes(workStatus))) return { label: '未通过审核', tone: 'bad' }
  if (workStatus === 'published' && chapterApproved(chapter)) return { label: '审核通过', tone: 'ok' }
  return { label: '草稿', tone: 'off' }
}

export const canSetChapterTrial = (chapter, workStatus) =>
  Boolean(chapter?.chapterId && workStatus === 'published' && chapterApproved(chapter))
