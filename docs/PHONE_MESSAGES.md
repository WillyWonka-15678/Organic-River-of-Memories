# 手机毕业寄语提交（第二阶段）

当前第四阶段已提供管理员后台，首次自动审核默认开启，以 SQLite 开关为准；关闭时手机显示等待审核。旧完整开发查询也要求管理员登录。此处保留第二阶段历史验收，当前用法以 [ADMIN.md](ADMIN.md) 为准。

后续第三阶段已接入 approved 留言的实时大屏展示。本页保留第二阶段流程说明，当前启动、自动审核与统一数据源请以 [DATABASE_DISPLAY.md](DATABASE_DISPLAY.md) 为准；默认仍以 pending 保存，只有批准内容才可展示。

## 启动与手机操作

使用 **Node.js 24 LTS**（本机验证为 24.13.0）；服务使用内置 `node:sqlite`，不需要安装 SQLite 命令行程序。该 Node 版本可能打印 SQLite ExperimentalWarning，不影响已验证的保存流程。换电脑时先运行 `npm.cmd install`。

在项目根目录运行：

```powershell
npm.cmd run server
```

电脑访问 http://localhost:3000/submit 。手机连接方式与第一阶段相同：保持热点开启，电脑连接热点，手机访问 `http://电脑Wi-Fi的IPv4:3000/submit`。使用启动日志的 WLAN 候选并以 `ipconfig` 核对；不要使用示例 IP 或手机端 localhost。详细网络排查见 [LAN_TEST.md](LAN_TEST.md)。

填写中文寄语，点击「送出这段记忆」。出现「你的记忆已送达，请抬头看看大屏」说明数据库保存成功，表单会重置，可继续提交下一条。**该提示按本阶段要求显示，留言目前不会进入大屏。**

字段规则：昵称选填、最多 20 字，默认「匿名毕业生」；专业选填、最多 40 字；年份默认 2026，允许 1900–2100；寄语必填、去首尾空格后最多 60 个 Unicode 码点（普通中文和常见单码点 emoji 各计一字，组合 emoji 可能计多字）。中文输入法组字期间不裁剪输入。超长内容由页面提示且服务端拒绝，不静默截断。

## 查看已保存内容

查询默认返回 403，只有**同时**设置两个环境变量并从本机回环地址访问才开放：

```powershell
# 先在原服务器窗口按 Ctrl+C，避免端口重复占用
$env:NODE_ENV='development'
$env:ENABLE_DEV_MESSAGES='1'
npm.cmd run server
```

另开 PowerShell：

```powershell
Invoke-RestMethod 'http://localhost:3000/api/messages?page=1&limit=20' | ConvertTo-Json -Depth 5
```

返回 items、total、page、limit，按 createdAt 倒序，时间相同按 id 倒序；limit 默认 20、最多 100。手机和其他局域网电脑即使知道地址也不能通过此查询接口读取留言；服务不信任 X-Forwarded-For。生产模式禁止查询，未来正式查询需要管理员认证。

结束开发查询后，停止服务并清理环境变量，再正常启动：

```powershell
Remove-Item Env:ENABLE_DEV_MESSAGES
Remove-Item Env:NODE_ENV
npm.cmd run server
```

## 持久化与重启验收

默认文件为项目根目录 `data/messages.sqlite`，固定相对服务器源文件定位，不随终端工作目录改变；不在静态页面目录或 dist 内，浏览器没有数据库下载路由。SQLite 文件及 WAL/SHM 等临时文件均已加入 Git 忽略。不要删除 data 目录。可用 DATABASE_PATH 指定文件，若设相对路径则相对当前工作目录解析。

1. 提交一条独特寄语，在开发接口中记下它的 id。
2. 在服务器终端按 Ctrl+C 停止，再运行同一启动命令；保持数据库路径不变。
3. 重新查询，确认相同 id 和 content 仍在。

数据库字段为 id（UUID）、name、major、year、content、createdAt（UTC ISO 时间）、status。所有留言仅作为纯文本保存，使用参数化 SQL。客户端提交 status 会被拒绝，审核状态固定 pending，没有审核后台。

## 接口与限流

- `POST /api/messages`：JSON `{ name?, major?, year?, content }`，成功 HTTP 201，返回 `{ok,id,status,message}`。
- `GET /api/messages?page=1&limit=20`：受上述开发模式及本机地址限制。
- 保留 `/test`、`GET /api/health`、`POST /api/test`。
- 每个 IP 每分钟最多 10 次留言提交尝试（包含无效请求），超额 HTTP 429 和 Retry-After；重启后限流计数重置。热点可能让多个设备共用一个源 IP，本阶段限流只是基础保护。
- 无效字段 HTTP 400，过大 JSON HTTP 413，数据库异常 HTTP 500。网络超时时不要连续点击重试；请求可能已保存，应先由电脑查询确认。本阶段未实现跨重试幂等键。

## 验证范围

`npm.cmd run test:server` 覆盖真实 HTTP 中文保存、默认值、校验、分页、限流、关闭并重启 HTTP 服务/数据库后的持久化，以及第一阶段接口回归，测试使用临时 SQLite 文件并清理。

另已用 Edge 390×844 手机尺寸页面完成中文输入、两次提交、成功提示、表单重置和连接测试按钮，查看实际渲染截图。原大屏生产构建通过。未操作真实手机；手机热点、系统中文输入法组字和大屏现场仍需人工验证。第二阶段没有 Socket.IO、正式二维码、后台或大屏数据接入。
