# PC 三端拆分设计（2026-10-13）

## 已确认范围
用户端与企业端共用普通用户账号。普通用户默认是甲方，可以申请开通创作者能力；authorCapability 是创作者能力唯一依据。不能按 userType=01/02/03 分配访问端。管理员凭证域仍独立。
本次只创建两个端的登录页、认证基础和可退出的登录成功页，不迁移或重构旧用户端主体页面。清理管理员仓库内旧用户端专属代码。保留管理员仍使用的公共组件、工具和业务功能。

## 接口与数据流
两个新端：GET /api/v1/auth/captchaImage、POST /api/v1/auth/login、GET /api/v1/auth/getInfo、POST /api/v1/auth/logout。
登录提交 username/password/code/uuid，响应为若依 AjaxResult，读取顶层 token/user；getInfo 的 user/roles/permissions 保持顶层结构。受保护请求使用 Authorization: Bearer token。
两个新端接收所有现有普通用户域类型 01/02/03，拒绝管理员域 00；用户类型不作为企业与用户端分流条件。服务端登录和业务接口继续负责认证授权。前端不创建新的角色、企业身份或业务 API。
分别采用 PcUser-Token、PcEnterprise-Token 和各自独立的记住账号键。只记住用户名，不保存密码。没有 refresh token。
验证码明确 captchaEnabled=false 才关闭；加载失败或图像缺失时阻止提交并允许重试。登录失败更新验证码。刷新后重新查询 getInfo 确认身份；401/40100/40301 清理会话，普通 403、超时和 5xx 保留令牌并允许重试。
登录成功页仅显示已确认的昵称和退出入口。临时身份查询失败时不展示用户信息。当前只开放 /session 和 /session-check 的登录回跳，拒绝外部 URL、协议相对 URL、反斜杠和未知路由。

## 管理员仓库清理边界
删除 src/views/pc、pcUser/pcUnread store、pcUser/pcWork/chat API、pcRequest、account 分流逻辑及对应专属测试。公告 API 保留管理员 reader 和管理接口，去除用户 reader。
恢复 /login、/getInfo、/getRouters、/logout 的管理员登录和动态路由流程。保留管理员用户管理、角色管理、消息公告、客服聊天、内容、版权和交易等页面。
pcFormat 中管理员消息仍使用的注册时间函数转为公共 dateFormat；其余用户端专属函数与测试删除。历史阶段文档保留供追溯，README 明确当前仓库仅为管理员端。

## 验证与交付
三个仓库使用独立功能分支，保留 main/release。用户端和企业端执行 node:test、生产构建及浏览器检查；管理员执行原有 gate 并检查其余业务文件与基线一致。
浏览器检查覆盖有效登录、缺失验证码、错误密码、认证失效、身份查询 5xx 重试、退出、刷新及两个端令牌隔离。真实后端联调与 Mock 分开记录。
提交并推送各仓库功能分支，创建可审阅 PR；不自动合并。后端和 App 不改动。
