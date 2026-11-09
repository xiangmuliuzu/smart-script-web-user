# AI 创作入口与独立流程（PC 创作者端）

日期：2026-11-09

## 背景

「我的作品」页的「创作与上传」卡片原先直接进入三栏创作工作台，作者只能自己写或导入剧本。本次在入口前增加方式选择，并为 AI 创作提供独立的设定 → 大纲 → 章节流程。

## 入口

`src/views/works/index.vue` 打开 `StartCreateDialog.vue`：

- **AI 创作** → `/works/create/ai`（`AiCreate.vue`）
- **自己编辑** → `/works/create`（原有三栏工作台，行为不变）

两个页面都使用 `route.meta.editor` 让 `layout/index.vue` 去掉主区留白；`/works/create/ai` 已加入 `auth.js` 的登录回跳白名单。

## AI 创作流程

1. **设定**：书名（必填）、故事灵感（必填）、题材、集数（1–200）、导演(skill)、模型；展示剩余积分。
2. **大纲**：调用 `POST /api/v1/content/ai/outline/stream`（SSE，带 skillId / model），灵感入参由 `outlineInspiration()` 拼接书名、灵感和「每集一行标题，格式为“第1集：章节名称”」的要求。大纲是可编辑文本；JSON 结果用 `outlineToText()` 转可读文本；`truncated` 时提示减少集数。「重新生成」二次确认后再次消耗积分。`outlineChapters()` 解析失败时不能进入下一步，并给出格式提示。
3. **章节**：确认大纲时用 `POST /api/v1/content/works` 创建草稿作品（简介由 `outlineSummary()` 从大纲提取）。列表默认全选分集，可取消；逐章调用 `POST /api/v1/content/ai/write/stream`（带 workId），每章生成后立即 `POST /users/me/works/{id}/chapters` 落库。达到长度上限时询问是否续写（额外积分）。支持停止、重试单章、重新生成、删除章节。完成后「插入到文章并进入编辑」跳转 `/works/create?workId=&chapterId=`，定位到第一章。

## 视觉结构

沿用纸墨化语言，但不与三栏工作台同构：

- 顶栏：返回 / 「AI 创作」标题与状态句 / 一·二·三步骤（「二」为当前步，已完成为黛青，当前为朱砂下划线）。
- 正文：一张居中的暖白稿纸（`sheet`），每步只显示当前内容，切换时轻微上浮。设定步做成卷宗登记表——字号为主、下划线为行、标签在左，书名用宋体大字；大纲步是一整页可编辑手稿，底部一枚「集」字印章显示识别到的分集数；章节步是竖向卷宗，每行「勾选框 + 序号 + 标题 + 状态印 + 概要」，生成中的行有墨色扫描线，状态变化时印章轻压。
- 右栏采用与工作台 AI 助手头栏相同的黛青（`--indigo`），自带到顶：作品名、积分、进度、本次设定、说明。
- 窄屏（≤1180px）右栏落到页面下方并排展示；≤720px 登记表改为单列，章节行收为两列。
- 稿纸随内容区整宽（最大 1180px），避免宽屏两侧大片留白。

## 流式反馈

- 大纲：标题旁旋转标记 + 「正在生成 · 已写出 N 集」；正文区下方实时列出已出现的分集（宽松识别 `listOutlineChapters`，允许概要尚未写完），最新一集带呼吸点。
- 章节：顶部 3px 进度条按已完成章数推进；状态条显示「正在写「第 N 集」/ 已收到 N 字 / x/y」，停止时改为「当前章写完后停止」；正在生成的章节行内展示最近 600 字的实时正文，完成后折叠为「查看正文」。

## 大纲局部修订

大纲步骤默认是可选中文本的预览页；选中任意段落（按行定位，跨行含首尾行）后浮出「修改这段」，在面板里写意见，调用 `/ai/write/stream`（`type=script`，带大纲上下文）只重写这一段：流式期间原位替换预览，失败自动还原原文，成功后段落带朱笔底纹标记。模型偶尔回显上一行分集标题，由 `stripEchoedHeading` 清掉，避免拆章失败。需要逐字改原文时点「手动编辑」切到文本框，改完点「完成编辑」回到预览。

大纲在确认进入章节步骤后锁定；尚未提交作品/章节前可用「解锁大纲」重新修订，一旦作品或章节已保存则提示到工作台修改。

## AI 使用记录

顶栏「AI 使用记录」按钮（带条数角标）打开右侧抽屉，读取 `/api/v1/content/ai/write-records`（与工作台 AI 助手同一接口），展示最近 50 条大纲 / 正文 / 润色 / 分镜记录：类型、作品、时间、token，点击展开输入与输出。进页面时静默预取一次用于角标，本页每次生成完成后若抽屉开着则立即刷新。

抽屉右上「记录管理」进入多选模式：可逐条勾选或全选，底部「删除所选 N」一次删除；删除走新增的 `DELETE /api/v1/content/ai/write-records`（body `{recordIds}`），服务端强制 `user_id = 当前登录身份`，只删自己的记录，越权 ID 静默无效；作品与章节不受影响。退出多选或关闭抽屉即清空选择。

大纲记录展开后在详情底部带「继续这次创作」（收起行不占位）：`buildAiCreateSession()` 读取这条大纲的输入（书名、灵感、题材、集数）还原设定，并按 recordId 找出它之后生成的章节记录，把大纲与正文一起带回页面（直接进入章节步骤）。恢复的章节是只读预览（标记「来自 AI 使用记录」），不会重复落库；点「插入到文章并进入编辑」时才创建作品并逐章保存。

## 失败与离开

- 创建作品失败：停在章节步骤，可重试；失败时不保留半成品。
- 生成失败：该章节标记失败并显示服务端错误，可重试；已生成章节不受影响。
- 生成中离开页面或关闭窗口会确认；离开后作品和已生成章节保留，可回到工作台继续。

## 复用

- `src/utils/creator.js`：`outlineChapters` / `outlineToText` / `wordCount`。
- `src/utils/creatorAi.js`：`outlineRequest` / `outlineInspiration` / `outlineSummary` / `chapterWritePrompt` / `chapterContinuePrompt`，与 `Create.vue` 的「按大纲生成各章」保持一致的提示词。
- `src/api/creator.js`：`createWork` / `saveChapter` / `deleteChapter` / `generateStream` / `listAiSkills` / `listAiModels` / `getAiQuota`。

## 验证

- `tests/creator-ai.test.js`：简介提取、灵感拼接、章节提示词、分章结果、流式分集扫描、选中段落定位/清洗与局部修订提示词。
- `npm run test:ai-create`：入口弹框、两条路径、大纲生成与解析、创建作品、逐章生成保存、章节预览、跳转编辑页、1024 宽度无横向溢出。
- 既有 `npm run test:ai-stream`、`npm run test:ai-skill` 回归 AI 流式与导演选择。
- 后端 `AiWriteRecordDeleteTest`：归属校验、脏 ID 去重过滤、空入参与未登录短路（`mvn -o -pl smartscript-content -am -Dtest=AiWriteRecordDeleteTest test`）。
