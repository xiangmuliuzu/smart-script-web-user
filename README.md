# 剧云策 PC 用户端

Vue 3 + Vite + Element Plus。当前交付登录、验证码、登录身份确认和退出；主体业务页面后续重构，不包含原用户端主体页面。

用户端与企业端共用平台普通用户账号。普通用户默认是甲方，可申请创作者能力；未来创作功能只依据服务端 authorCapability，不按 userType 硬分流。现有用户域 01/02/03 均可登录，管理员域 00 使用独立运维管理端。

## 开发与验证

要求 Node.js ^20.19.0 或 >=22.12.0。

```sh
npm ci
npm run dev
npm run gate
```

开发地址 http://localhost:3001。通过 .env.local 的 VITE_API_TARGET 指定同一整体后端；默认 http://localhost:8080。

## 认证协议

| 动作 | 接口 |
| --- | --- |
| 验证码 | GET /api/v1/auth/captchaImage |
| 登录 | POST /api/v1/auth/login，username/password/code/uuid |
| 身份恢复 | GET /api/v1/auth/getInfo |
| 退出 | POST /api/v1/auth/logout |

使用若依 AjaxResult：成功 code=200，token、user、roles、permissions 在顶层；受保护请求附 Authorization: Bearer token。只记住用户名，不存密码或 refresh token。用户端令牌独立存储，两个端互不清理彼此会话。
验证码只有服务端明确 captchaEnabled=false 时才关闭；加载失败需重试。刷新会重新确认身份；认证失效/账号停用清理会话，普通权限错误或网络/5xx 保留令牌并允许重试。

## 部署

npm run build 输出 dist。生产默认 VITE_APP_BASE_API=/prod-api；网关需将 /prod-api/* 去除前缀后转发至整体后端，SPA 路由回退 index.html。不要把 /login SPA 地址代理到后端。
按仓库分别配置域名或站点。当前版本的回跳白名单仅包含 /session 和 /session-check；新增主体路由时同步扩展。
前端账号域检查只用于入口防护，业务授权与创作者能力仍由后端验证。
