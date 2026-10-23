# 第四阶段：管理员与持久化审核

## 第一次使用

使用 Node.js 24，在电脑的项目根目录 PowerShell 操作。先停止旧 Node 服务，避免 3000 端口冲突。

```powershell
npm.cmd install
npm.cmd run admin:init
```

在**交互终端**按提示输入用户名、密码和确认密码。密码不回显，不从命令行参数或环境变量读取；无最低长度和字符组合要求，允许单字符密码；不能为空，最多 256 UTF-8 字节。没有默认账户或默认密码。已存在账号时会拒绝覆盖；本阶段没有在线注册、重置密码或多角色功能。自动测试只创建临时数据库账户，**没有替你创建真实管理员**。

初始化和服务应使用同一个数据库路径。默认 `data/messages.sqlite`，如曾设置 DATABASE_PATH，请在两个终端中保持一致。

在当前 Codex Windows 伪终端中，初始化结束可能提示无法恢复输入模式；账户创建结果会保留，命令会退出。此时关闭该终端窗口，再用新的 PowerShell 启动服务器即可。正常初始化不显示密码，重复运行不会覆盖账户。

```powershell
# 终端一
npm.cmd run server

# 终端二（保持终端一运行）
npm.cmd run dev
```

管理员打开 http://localhost:3000/admin ，未登录会跳转登录页；大屏仍打开 Vite 输出的地址，手机仍用 `http://电脑热点Wi-Fi的IPv4:3000/submit`。后台也支持同一局域网手机浏览器登录，地址改成电脑 IPv4 的 `/admin`。不需要修改大屏或防火墙规则。

本地 HTTP 热点测试使用默认 NODE_ENV 或 development。`NODE_ENV=production` 时 Cookie 强制 Secure，只应在 HTTPS 环境使用；本阶段不配置 HTTPS 或公网部署。未来代理下若外部 Origin 与 Node 内部地址不同，可显式配置 ADMIN_ORIGIN，但不应以关闭 CSRF 或 Secure 代替正确配置。

## 自动审核的新规则

唯一真实来源是 SQLite 的 `settings` 表中 `autoApproveMessages`。该设置不存在时初始化为 true；已有 false 或 true 从不被启动、种子导入、刷新或登录覆盖。第三阶段的 `AUTO_APPROVE_MESSAGES` **已停用**，即使遗留该环境变量也只打印提示，不读取它决定审核状态。

顶部显示实际服务器状态，点击「关闭自动审核」或「开启自动审核」保存。只有请求成功后才确认切换，失败会显示原因并重新核对；多个页面读到旧值时，服务端返回 409，需刷新再操作。页面每十秒刷新当前服务器数据。

- 开启：之后的手机提交保存为 approved，广播 `message:approved` 并按现有队列入场。
- 关闭：之后的手机提交保存为 pending，不广播；手机显示「留言已提交，等待审核」。此前 approved 不受影响。
- 重新开启：不会批准任何积累的 pending，需要管理员逐条通过。

公开提交在 `BEGIN IMMEDIATE` 事务内读取设置并插入记录，和设置/管理事务串行；不存在先读环境变量、再异步写入的竞态。审核状态由服务端决定，客户端不能指定。

## 管理留言

顶部统计总数（含软删除）、已通过、待审核、已隐藏。列表默认排除 deleted；输入搜索词可匹配昵称和寄语，支持状态/来源、提交时间正倒序及分页，每页二十条。

| 原状态 | 操作 | 新状态 / 实时事件 |
| --- | --- | --- |
| pending | 通过 | approved / message:approved |
| pending | 拒绝 | rejected / message:removed |
| approved | 隐藏 | hidden / message:removed |
| hidden | 恢复 | approved / message:approved |
| 任意非 deleted | 删除 | deleted / message:removed |

隐藏、拒绝、删除需要页面二次确认。删除为软删除，不能在普通列表继续操作，只在「已删除」筛选中查看；本阶段不提供物理删除或已删除恢复。状态修改携带期望原状态，过期页面操作返回 409，避免覆盖另一浏览器已作出的修改。

原有三条 seed 留言同样可管理。种子脚本保留稳定唯一标识并只插入不存在的记录；hidden/deleted 行仍占有标识，重启和再次导入不会让它们复活。手机历史内容和状态不会被迁移或切换开关重写。

## 与大屏同步的验收

1. 同时启动大屏和服务，登录后台，保持顶部开启；手机提交一条独特寄语，后台应为已通过，大屏通过原队列入场。
2. 关闭开关，提交第二条，手机应显示等待审核；后台筛选待审核，确认大屏公共池没有它。
3. 点击「通过」，大屏收到新事件并排队。已有生成周期、名额和屏外进入耗时仍适用，并非立即弹窗。
4. 关闭后再开启开关，刷新待审核列表，确认未人工批准的旧记录仍为 pending。
5. 找到正在大屏漂流或被手捕获的留言，后台点击「隐藏」并确认。原有客户端会从池、队列和对应所有实例中移除，约 0.8 秒淡出，取消捕获。恢复后重新进入历史池；同一 ID 的首次队列依然遵守第三阶段去重，不保证恢复操作产生第二次优先首次入场。
6. 删除一条测试留言，刷新/重连大屏和重新运行种子导入，确认它不会再次出现；后台改筛选「已删除」可查到软删除行。

## 持久化与备份

旧三阶段表不允许 deleted，本次迁移前创建 `data/messages.sqlite.pre-stage4.bak` 一致性备份，在事务中复制原记录并扩展状态约束。不清库，不改寄语正文，失败回滚。更早版本会先经过已有兼容迁移和备份。

同一 SQLite 文件新增 `settings`、`admin`、`sessions`、`login_limits`、`audit`。账号、设置、会话有效期、审核状态及操作日志均持久化；data 已被 Git 忽略，不公开提供下载。

确认开关持久化：关闭开关，记下一条 pending 的 ID；Ctrl+C 停止服务，重新运行 `npm.cmd run server`，日志应仍显示关闭，后台刷新仍是关闭，旧 pending ID 状态不变。也可使用 SQLite 工具**只读**检查：

```sql
SELECT key,value FROM settings WHERE key='autoApproveMessages';
SELECT id,status,source FROM messages;
SELECT actor,action,target,createdAt FROM audit ORDER BY id DESC LIMIT 50;
```

管理日志通过登录后的 `/api/admin/audit?page=1` 查询，每页五十条，记录初始化、登录/登出、失败登录、开关和审核/隐藏/删除操作。旧的本地 `messages:approve` 脚本保留开发限制，其批准操作也写入审计。

## 认证与 API

使用 Node 内置 scrypt（N=131072,r=8,p=1，随机盐）存密码哈希。服务器只存会话 token 的 SHA-256，浏览器得到随机 256 位 token；会话绝对有效期八小时，退出立即吊销。Cookie 为 HttpOnly、SameSite=Strict，生产增加 Secure。登录每来源 IP 每十五分钟最多五次尝试（包含成功），另有账户级限制；窗口和会话在重启后不丢失。

管理修改同时验证登录会话、同源 Origin 和会话 CSRF token；登录验证同源与专用自定义请求头。后台使用外部脚本、CSP 和 textContent 呈现寄语。账号初始化只在本机终端执行，没有公开初始化/注册 API。

| 接口 | 说明 |
| --- | --- |
| POST /api/admin/login | 同源登录，限流 |
| GET /api/admin/session | 获取当前管理员及 CSRF token |
| POST /api/admin/logout | 校验 CSRF，撤销会话 |
| GET /api/admin/settings | 当前持久化开关 |
| PATCH /api/admin/settings | `{autoApproveMessages:boolean,expected:boolean}` |
| GET /api/admin/stats | 统计 |
| GET /api/admin/messages | q/status/source/order/page/limit，limit 最多 100 |
| PATCH /api/admin/messages/:id/status | `{status,expected}`，事务修改、审计、提交后广播 |
| GET /api/admin/audit | 登录后的审计记录 |

除登录外上述管理 API 都需要有效会话，写入还需 CSRF。旧 `/api/messages` 完整开发查询也增加管理员身份验证，不能仅靠开发环境开关绕过认证；推荐直接用后台。公开 `/api/display/messages` 仍只返回 approved 的展示字段，不含管理设置、会话、密码或待审核内容。

实现参考：[Node scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)、[OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)、[OWASP Session](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。当前局域网 HTTP 不提供传输加密；这里只完成后台功能，不声明已完成公网安全部署。

## 文件与自动验证

新增 `management-store.mjs`、`auth.mjs`、`admin.mjs`、`init-admin.mjs`、`admin.test.mjs`，以及 `server/public/admin*` 登录/管理页面、脚本和样式。修改 `messages.mjs`、`app.mjs`、`realtime.mjs`、`index.mjs`、手机成功提示、测试与 npm 命令；没有修改本阶段的 src 视觉/交互模块，没有新增 npm 依赖。

```powershell
npm.cmd run test:server
npm.cmd test
npm.cmd run build
node server/display-browser.mjs
```

服务端集成测试覆盖 A–F、权限、CSRF、登录限流/会话过期/退出、生产 Secure、冲突、种子和旧表迁移。隔离浏览器脚本使用临时数据库、3107/5175 端口，验证真实表单、后台登录切换/批准及大屏被捕获文字的隐藏淡出，自动关闭测试进程并清理临时数据；不创建真实管理员。已查看后台桌面与手机截图。

需要你手工完成：真实管理员初始化、真实手机热点登录/提交，以及 USB 摄像头和大屏现场复测。没有进入第五阶段公网部署。

