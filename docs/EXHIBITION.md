# 第五阶段：展览运行与部署准备

## 每日启动

Windows 使用 Node.js 24。更新依赖后运行一次 `npm.cmd install`；新电脑按 README 准备模型资源并执行 `npm.cmd run admin:init`，旧电脑已有管理员无需重复初始化。

先在旧服务终端按 Ctrl+C 停止旧版本，随后在项目目录运行：

```powershell
npm.cmd start
```

命令检查 3000 端口，构建 Worker、检查 TypeScript、构建正式前端，并启动**同一个** Express/Socket.IO 服务。大屏地址 http://localhost:3000/display ，手机提交与后台仍在同一端口的 `/submit`、`/admin`。默认尝试用 Edge 新窗口全屏打开；摄像头仍在电脑浏览器通过 localhost 的安全来源使用，首次需要点击允许。如果已有浏览器窗口未响应全屏参数，可手动 F11。

不要每天改 IP：局域网模式启动时自动读取当前 WLAN IPv4。网络有多个候选时用 `ipconfig` 核对，可一次配置正确的网卡名称。IP 改变后静态打印二维码也会失效，需重新导出/打印；长期展出建议在路由器上预留 DHCP 地址或以后用稳定 HTTPS 域名。不能靠软件保证热点每天分配同一 IP。

不自动开浏览器：`$env:OPEN_BROWSER='false'` 后启动；按 Ctrl+C 停止服务。重复启动不会自动杀进程或另占端口，而是明确报错。服务异常退出后手动重新运行同一命令即可，数据库不丢失；异常中断的锁会按进程是否仍存活检查。

原开发模式仍为两个终端 `npm.cmd run server` 与 `npm.cmd run dev`，没有改变已有用法。`npm.cmd run preview` 同样支持配置与代理。展览模式使用构建后的前端，默认隐藏调试信息，没有减少粒子数或更改颜色、轨迹、字体和人体算法。EXHIBITION_MODE=true 标记由 start 自动传给服务。

## 统一配置

配置优先级：环境变量 > `config/exhibition.local.json` > 默认值。本地文件被 Git 忽略，可以从 `config/exhibition.example.json` 复制。配置改变后重启服务和 Vite；二维码地址与显隐也会在页面约三十秒自动复查。没有有效网卡时不虚构地址，二维码暂时隐藏；接好网络后重新启动并检查。

| 字段 | 默认 / 含义 |
| --- | --- |
| NETWORK_MODE | lan；也可 public |
| PUBLIC_SUBMIT_URL | 空，lan 自动计算；指定时必须是真实完整 `/submit` URL |
| LAN_INTERFACE | 空，优先 WLAN/Wi-Fi；可固定网卡名称，而不是每天设置 IP |
| PORT | 3000 |
| SHOW_QR | true，false 隐藏大屏二维码 |
| EXHIBITION_MODE | start 自动 true |
| DATABASE_PATH | 项目 data/messages.sqlite，始终与管理员初始化/备份使用同一设置 |
| BACKUP_DIR | 项目 backups，与数据库目录分开，不可放 public/dist |
| BACKUP_INTERVAL_MINUTES | 60；0 关闭自动备份，仅保留手动命令 |
| BACKUP_RETENTION_DAYS | 14；每次成功备份后清理过期的本工具备份，至少保留最新一个 |
| DISPLAY_ONLY | false；公网现场电脑可 true，仅供静态大屏，不打开本地数据库 |

AUTO_APPROVE_MESSAGES 仍不参与运行时判断。审核开关只读写 SQLite，首次默认 true，已有设置原样保留，没有紧急暂停功能。

## 二维码

先确认服务已启动，再运行：

```powershell
npm.cmd run qr
```

导出 `exports/submit-qr.png`（2400×2400，适合高分辨率打印）、`exports/submit-qr.svg`（矢量）和 `exports/submit-url.txt`（地址核对）。保留完整白色静区，建议打印至少 4cm 方形，按实际距离测试；不要裁切或粒子化。

生成前会实际请求地址，非成功 HTML 响应拒绝导出；没有配置公网域名时自动使用当前局域网地址，不使用 example.com。此次交付已导出 `http://192.168.31.28:3000/submit` 并检查可访问，**仅适用于交付时该电脑网络**，不是固定源码地址；换热点后必须核对并重新生成。自动测试的网卡视图可能与宿主不同，应以正式服务日志和真实手机可达性为最终依据。

大屏右下角为静态高对比 SVG 二维码，深色半透明区域避开底部操作按钮。实际 1080p 渲染的 144 像素二维码已独立解码成功，不等于已经用真实手机扫码。二维码链接随服务器配置生成，不参与 WebGL 粒子计算。`SHOW_QR=false` 可隐藏。

## 连接与缓存策略

默认不显示技术状态。点击「参数」开启调试，可在左下区域查看 connected、disconnected、reconnecting、synchronization-error、池数量、队列长度和最近成功同步时间。正式画面不会弹网络错误。

每个大屏页面只有一个 Socket.IO 连接；自动重连延迟有上限。HTTP 同步有超时及一个可取消、逐步退避的重试计时器，销毁时停止；Socket 连接恢复后立即重取 approved 快照，每三十秒再对账，事件 epoch/revision、ID seen 和队列规则继续避免重复首次入场。

离线策略为**保留当前页面内存中的最后一份 approved 池，无强制到期**：现有留言继续漂流，河流和人体主循环独立运行；不写永久浏览器缓存，刷新或重启浏览器且服务器不可用时，不伪造硬编码留言。恢复后以 SQLite 快照为准，撤下所有 hidden/rejected/deleted、补齐新 approved，取消对应捕获并平滑淡出。

**离线无法保证即时撤下**：服务器已经隐藏的留言在离线大屏中可能继续出现，直到连接恢复并成功对账。自然离屏仅销毁实例，未来可从仍 approved 的数据库池再次抽取；管理撤下会删除池/队列并失效全部当前实例。不能用强制刷新解决断网撤下，因为刷新也无法得到权威状态。

## 备份与恢复

```powershell
npm.cmd run backup
```

用 Node SQLite 在线 backup API 打开正式源库，写入 `backups/memory-river-UTC日期时间-UUID.sqlite`，完整性检查通过才报告成功；不直接复制写入中的主文件或忽略 WAL。正式数据库原样保留。自动备份随 Node 服务每六十分钟运行，重叠任务跳过，错误写到终端，不停止艺术画面。停服时不会继续定时备份；首次运行可立即手动备份。

备份包含全部留言（含模拟/手机、审核/软删除）、设置、管理员哈希、审计和会话。目录不在公开 HTTP 根目录，不提供下载 API；POSIX 创建目录/文件采用 0700/0600。Windows 继承所在文件夹 ACL，脚本不会调整 Windows ACL 或系统安全策略，请选个人账号私有目录并人工检查访问权限。重要展出建议另存离线介质；本阶段没有上传备份。

恢复必须停止所有使用该库的服务：

```powershell
npm.cmd run restore -- "备份文件的完整路径.sqlite"
```

脚本检查源完整性/必需表，拒绝当前服务锁和源目标相同；必须在交互终端输入 `RESTORE`，否则不改动目标。确认后持有维护锁，先为当前库做安全副本，再用 SQLite backup API 恢复；清除恢复后的旧会话，需要重新登录，管理员密码和审核设置保留。不要在开发或试验时将测试备份覆盖正式库。本轮恢复验证只针对临时目标，未覆盖你的正式库。

通过独立恢复测试确认了原文、pending/deleted、自动审核 false 及管理员哈希可恢复，包括覆盖临时旧目标的情况。管理员本身没有依赖外部 Session 密钥，因此兼容同一 Node 24/scrypt 实现。

## 健康检查与 Windows 重启

```powershell
npm.cmd run healthcheck
```

检查健康、展示池、公开配置、手机页面和正式大屏页面。仅说明 HTTP/数据库通路正常，不代替 GPU、摄像头或实际扫码。当前旧服务可能没有第五阶段接口，需要停止旧服务再启动新版。

电脑重启后：先连展览网络，打开 PowerShell 进入项目运行 `npm.cmd start`，确认摄像头权限、二维码和一次手机提交。不要删除 data 或只拷贝 dist 到另一电脑。

如需可选自启动，由你在 Windows「任务计划程序」手动建立**用户登录后**任务：程序使用实际 npm.cmd 路径，参数 start，起始目录为项目根目录，保持正常用户权限；可以设置失败重试。不要设置“无论用户是否登录都运行”来期待显示浏览器；摄像头/大屏需要交互用户会话。先手动验证成功再启用。本项目没有创建启动项、修改防火墙、注册表或电源设置。

## 公网准备（未部署）

服务端未来配置 NETWORK_MODE=public、真实 PUBLIC_SUBMIT_URL=https://真实域名/submit、DISPLAY_ONLY=false、NODE_ENV=production、ADMIN_ORIGIN=同一 HTTPS origin。持久化磁盘上的 DATABASE_PATH 和 BACKUP_DIR 必须明确设置；Railway/Render 等平台的临时容器目录不能保存正式 SQLite，必须使用持久化卷，或另行迁移托管数据库。不要将当前 data 上传到未审查的公共仓库或镜像。

现场电脑可复制 `config/exhibition.public.example.json`，填真实 URL，DISPLAY_ONLY=true，再运行 npm start。此时本机只托管构建资源及 QR/配置，**不打开另一套 SQLite，也不接收本地手机留言**；浏览器从 HTTPS/WSS 远程权威服务读取 approved 数据，摄像头仍在本机 localhost 安全来源运行。

远程服务需设置 DISPLAY_ORIGINS 为允许的本机大屏 origin 列表，例如现场的 localhost/127.0.0.1 与实际端口，逗号分隔。只对公开展示 API 和 Socket.IO 开 CORS，不对管理接口开放跨域或携带凭据。HTTPS 地址由 Socket.IO 自动使用安全传输，反向代理须允许 WebSocket Upgrade。`deploy/Caddyfile.example` 是待填写真实域名的反向代理模板，尚未执行；若代理在同机 loopback，可显式设置 TRUST_PROXY=loopback，以正确识别来源 IP，避免全部访客共享限流。不要将任意代理都设为可信；后端端口应限制为代理可访问，系统/云规则由部署时人工配置。

公网前还需准备：真实域名与 DNS、有效 TLS、WebSocket 代理、持久卷及备份恢复演练、管理员独特密码、访问日志与监控、平台重启策略、现场到服务器的连通/掉线演练。短密码按你的要求仍允许，但不能据此声称公网安全已验收。

## 文件与测试记录

新增：`server/config.mjs`、`entry.mjs`、`backup.mjs`、`restore.mjs`、`service-lock.mjs`、`exhibition.test.mjs`；`scripts/start.mjs`、`scripts/healthcheck.mjs`；两份配置示例及 Caddy 模板；`src/integrations/ExhibitionUI.ts`。

修改：`server/index.mjs`、`app.mjs`、`realtime.mjs`、`messages.mjs`、`admin.mjs`、浏览器测试脚本；`MemorySync.ts`、main.ts、index.html、art.css、vite.config.ts；同步测试、npm 脚本/依赖/锁文件、Git 忽略、README 和开发日志。没有改动主河流 Shader、运动参数、字体、Body Wake 或 MediaPipe 算法。

已通过 39 项单元测试、九项服务端集成测试、生产构建、隔离一键启动/健康检查/拒绝重复启动、浏览器提交→审核→入场→断线恢复→捕获撤下闭环。二维码 2400px PNG 独立解码及实际 144px 叠层截图解码通过，真实数据库在线备份成功，独立临时库恢复验证通过。构建有运行时 display-config.js 不打包的预期提示及既有大包体积提示，该脚本由 Node/Vite 单独提供。

仍须人工验证：**真实手机扫描打印与屏幕二维码、热点访问、实际中文输入法、USB 摄像头和人体对齐、物理断网、可见 Edge 全屏/权限、目标大屏连续数小时性能**。没有购买云服务、创建公开站点、上传数据库或执行公网部署。

机制参考：[Node 24 SQLite backup](https://nodejs.org/download/release/v24.13.0/docs/api/sqlite.html)、[Socket.IO 客户端重连](https://socket.io/docs/v4/client-options/)。
