# 三端服务器目录对齐

根据用户指定入口，管理员端挂载 `/`，用户端 `/user/`，企业端 `/enterprise/`。三个工程的 Vite base 与 Vue Router history 统一，Router 读取 import.meta.env.BASE_URL。开发环境分别使用 localhost:3000/、localhost:3001/user/、localhost:3002/enterprise/。

应用内部路由及安全回跳白名单保持相对应用的路径，由 Router 添加各端前缀。API 继续使用站点级 `/dev-api`（开发）或 `/prod-api`（生产），不把用户或企业前缀加进 API。头像等媒体地址保持原有 API 解析。

只读检查服务器时发现：用户、企业入口 HTML 使用根目录的 `/assets/` 引用，而对应资源实际在各自子目录下。根目录的同名请求返回 HTML，各自子目录的请求返回 JavaScript。新的生产构建分别生成 `/user/assets/` 和 `/enterprise/assets/`，对应服务器的目录结构。本次未修改服务器文件。

验证：

- 三端 npm run gate 均通过：用户端 23 项、企业端 11 项、管理员端 46 项 Node 测试，三份生产构建成功。
- 用户端原有 21 项浏览器检查、8 组创作检查及头像回归在 `/user/` 路径下通过。
- npm run test:paths 的 5 组通过：三份生产包同站点加载及资源 MIME 检查；用户登录、保护页回跳和刷新；企业登录、刷新、退出及令牌隔离；管理员根目录登录；用户过期会话返回自身登录页且 API 不叠加应用前缀。
- 管理端 VM 路由测试模拟 Vite 的 BASE_URL 编译替换；原有身份、菜单及错误清理断言全部保留。

部署时将三份 dist 内容放到各自目录。各子应用的未知页面应回退到自己的 index.html，不能回退到管理端首页；站点级 API 必须优先反向代理。服务器需要替换构建文件后才能加载本次修改。
