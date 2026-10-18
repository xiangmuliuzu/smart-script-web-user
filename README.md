# 剧云策 PC 创作者端

Vue 3 + Vite + Element Plus。用户端即创作者端，视觉以 `剧云策-用户端原型-v2.html` 为准，代码采用若依常用的 API、布局、页面、组件、工具分层。

与企业端共用平台普通用户账号，但创作者端只允许 `authorCapability === true` 的普通账号登录。缺失、未开通或撤销创作者能力时，登录和身份恢复都拒绝进入并清理本端令牌。用户域 01/02/03 不作为创作者身份依据；管理员域 00 使用独立运维管理端。

已实现登录、作品卡片墙、筛选搜索、待办、作品详情、章节编辑与草稿导入、作品设置、审核记录与提交、创作上传、AI 大纲/正文/润色/生成记录，以及消息、平台沟通、合作、合同、版权收益、个人资料、实名、改密、换绑手机和反馈页面。

作品、章节、分类、上传、AI、消息、聊天、资料、实名、改密、换绑和反馈使用现有用户接口。合作/合同/版权/印章/结算/提现当前缺少完整的用户接口，正常账号显示服务未开放；不调用管理员接口，不伪造业务成功。创作者擅长题材为只读投影，授权方式、定价、反馈截图和设备管理目前展示待接入状态。

登录地址为 `/user/login`，成功后进入 `/user/works`。所有工作区页面均需通过登录和创作者能力校验，不提供匿名原型演示入口。登录页的「忘记密码？」与「注册个人账号」在同一张登录卡片内切换（`src/components/AccountPanel.vue`，不弹窗）：忘记密码走手机号 + 短信验证码重置；注册会创建普通账号（无创作者能力），成功后不写本端令牌，而是提示用同一手机号在 App 完成创作者认证。

## 开发与验证

要求 Node.js ^20.19.0 或 >=22.12.0。

```sh
npm ci
npm run dev
npm run gate
```

开发地址 http://localhost:3001/user/。通过 .env.local 的 VITE_API_TARGET 指定同一整体后端；默认 http://localhost:8080。

浏览器验证：先启动开发服务，再运行 `npm run test:browser`。测试脚本在浏览器拦截 API 响应，应用仍执行正常登录与接口流程。脚本优先使用项目可解析的 Playwright，也可复用本工作区 `../shared/scripts` 已安装的 Playwright；独立 checkout 需自行准备 Playwright 及 Chromium。截图与校验结果在 `docs/screenshots`，验证范围和联调边界见 `docs/superpowers/reports/2026-10-14-user-prototype-v2-validation.md`。

创作上传采用三栏工作区：左侧管理资料和分集、中间编辑正文、右侧 AI 助手。默认分集名为「第 1 集、第 2 集…」，删除按钮在各分集卡片右下角，确认后删除，删除其他分集时保留当前正文。字体、字号、文字与段落格式及剧本工具使用单行可左右滚动的工具栏；窄屏目录与 AI 使用抽屉。草稿按用户保存在本机，保存草稿后同步到作品并进入详情；提交审核前确认锁定规则。人物便签仅在本机存档，可导出。

TXT/Markdown/DOCX 草稿使用原生浏览器文本读取与解压，不执行文档代码。书名从文件名载入；正文导入当前分集，替换前确认，分类由用户选择。Markdown 按 TXT 上传以兼容服务端白名单。封面与头像支持 JPG/PNG，限制 5 MB。

格式正文使用 Quill 编辑，恢复前通过 DOMPurify 与编辑器格式白名单过滤。配套后端在章节长文本中保存带版本标记的文档，content 对旧阅读接口仍返回纯正文，formattedContent 用于恢复格式。升级本前端时应同时使用配套后端代码。`npm run test:creation` 检查布局、工具栏、格式恢复、AI 插入、断线重试及审核提交。

顶部和个人资料共用头像地址解析：平台 `/profile/upload/`、`/profile/avatar/` 资源通过当前 API 前缀加载，保存资料后同步顶部头像；图片缺失或加载失败时显示昵称首字。`npm run test:avatar` 验证图片加载、保存同步、刷新恢复与失败回退。

## 认证协议

| 动作 | 接口 |
| --- | --- |
| 验证码 | GET /api/v1/auth/captchaImage |
| 登录 | POST /api/v1/auth/login，username/password/code/uuid |
| 身份恢复 | GET /api/v1/auth/getInfo |
| 退出 | POST /api/v1/auth/logout |
| 协议版本 | GET /api/v1/auth/agreements（列表在 data.agreements） |
| 发送短信验证码 | POST /api/v1/auth/sms/send，scene=REGISTER / RESET_PASSWORD |
| 注册个人账号 | POST /api/v1/auth/register，含 agreementAcceptances |
| 重置密码 | POST /api/v1/auth/password/reset，phone/code/newPassword |

使用若依 AjaxResult：成功 code=200，token、user、roles、permissions 在顶层；受保护请求附 Authorization: Bearer token。登录页勾选「记住密码」时把账号与密码写入本机 `localStorage`（取消勾选即清除，兼容早期只存账号的旧值），不存 refresh token。用户端令牌独立存储，两个端互不清理彼此会话。
验证码只有服务端明确 captchaEnabled=false 时才关闭；加载失败需重试。刷新会重新确认身份；认证失效/账号停用清理会话，普通权限错误或网络/5xx 保留令牌并允许重试。

## 部署

npm run build 输出 dist，固定挂载到 `/user/`，对应服务器 http://124.221.131.38/user/。Vite 资源前缀和 Vue Router history 使用同一基础路径；例如 `/user/login`、`/user/works/create`。将 dist 内容部署到用户端目录，`/user/*` 的 SPA 路由必须回退到该目录的 index.html。

生产默认 VITE_APP_BASE_API=/prod-api；网关需将站点根路径 /prod-api/* 去除前缀后转发至整体后端。接口地址不加 `/user/`，例如 `/prod-api/api/v1/auth/login`。不要把 `/user/login` SPA 地址代理到后端。

三端都完成生产构建后，可运行 `npm run test:paths`。脚本把三份真实 dist 挂载到同一个本机站点，验证资源路径、子目录登录/刷新/回跳及令牌隔离；仅拦截测试 API，不改服务器。修改基础路径后需要重新部署 dist，服务器上的旧构建不会自动改变。
管理员端位于 `/`，企业端位于 `/enterprise/`。下述回跳地址是应用内部路径，由 Router 自动添加 `/user/` 前缀，不能手工重复添加。回跳白名单包含 /works、/works/create、数字作品详情路径及兼容的 /session、/session-check；/session 跳转到 /works。未实现的地址不在登录回跳白名单中。
前端账号域检查只用于入口防护，业务授权与创作者能力仍由后端验证。
