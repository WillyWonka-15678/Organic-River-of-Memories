# 第三阶段：统一留言池与实时大屏

**第四阶段已完成后台**：当前审核模式以 SQLite 持久化开关为准，首次默认开启，通过 `/admin` 随时切换。旧 AUTO_APPROVE_MESSAGES 已停用，管理/认证与当前操作步骤见 [ADMIN.md](ADMIN.md)。下述数据迁移和同步设计继续适用。

## 启动（Windows / Node.js 24）

首次安装或更新依赖：`npm.cmd install`。先停止旧版本服务器，避免 3000 端口重复占用。

终端一：

```powershell
# 如尚未初始化，先执行 npm.cmd run admin:init
npm.cmd run server
```

终端二：

```powershell
npm.cmd run dev
```

电脑打开 Vite 输出的大屏地址（通常 http://127.0.0.1:5173/ ），手机打开 `http://电脑热点Wi-Fi的IPv4:3000/submit`。大屏通过 Vite 同源代理访问 `/api` 和 `/socket.io`，连接地址没有硬编码局域网 IP。自定义 API 端口时，在**启动 Vite 的终端**设置 `$env:MEMORY_API_TARGET='http://127.0.0.1:3001'`，同时按原说明设置服务器 PORT。修改代理配置后重启 Vite。`npm.cmd run preview` 使用相同代理，仍需启动 Node 服务。

关闭或重新开启自动审核：登录 `/admin` 点击顶部开关，无需重启。SQLite 已有设置不会被启动或旧环境变量覆盖。既有 pending 不会自动批准。

## 数据迁移与确认

唯一原始种子来源仍是 `src/memories/MemoryRecord.ts` 的三条原始记录，文件保留作为备份和服务端种子输入，浏览器正式展示不再导入该数组。

| 原字段 | SQLite 字段 | 说明 |
| --- | --- | --- |
| id | sourceKey | `study-1/2/3`，SQLite 主键使用 `seed:study-1` 等 |
| message | content | 原文不改动 |
| name / major | name / major | 未填写保存为空字符串，不虚构署名 |
| year | year | 原字符串年份转 INTEGER，显示时转回字符串 |
| 模拟来源 | source=seed, status=approved | 手机记录 source=user |

`source + sourceKey` 唯一约束保证重复导入幂等。启动服务会检查种子，也可独立运行：

```powershell
npm.cmd run messages:seed
```

实际首次导入结果：原模拟 3 条、新增 3、跳过 0、手机历史 1 条。再次运行：新增 0、跳过 3、手机历史仍为 1。未删除或批准既有手机记录。

旧表的 `CHECK(status='pending')` 需要迁移。迁移前对真实 SQLite 建立 `data/messages.sqlite.pre-stage3.bak` 一致性备份，再在事务中复制所有原字段，添加 source/sourceKey 与审核状态约束。原 pending 和 id 保留，失败则回滚。备份与数据库均留在 Git 忽略的 data 目录，不公开提供下载。

公共展示查询（不返回 pending、source、审核信息或提交时间）：

```powershell
Invoke-RestMethod 'http://localhost:3000/api/display/messages' | ConvertTo-Json -Depth 5
```

开发完整查询：在服务器终端同时设置 `$env:NODE_ENV='development'` 和 `$env:ENABLE_DEV_MESSAGES='1'` 并重启，再从电脑 localhost 查询 `/api/messages?page=1&limit=100`，可核对 seed/user 和各状态。该接口继续限制为本机回环，默认和生产环境关闭。

手动批准历史测试留言，另开终端明确指定 ID（不是启动时自动批准全部）：

```powershell
$env:NODE_ENV='development'
npm.cmd run messages:approve -- "要批准的手机留言ID"
```

只修改指定 user/pending 行；没有全量批准开关。大屏定时同步至多约 30 秒后发现，也可通过重连/刷新立即重取。脚本直接修改 SQLite，不跨进程伪造实时广播。

## 数据与视觉实例分离

SQLite 是永久记录池。HTTP `/api/display/messages` 返回完整 approved 集合和当前服务 epoch/revision；浏览器 `MemoryPool` 保存历史池及首次展示 FIFO 队列，`MemoryInteraction` 仍按原轨迹和时间产生临时实例。离屏、送别和手部召唤都不删除数据库内容。

大屏首次成功同步仍按原数量预置屏内留言；以后随机重复抽取 approved 历史记录，正文、第二行 12px、捕获三倍渐大与光晕、身体减速及送别材质保持原逻辑。没有本地模拟数据回退：首次启动连不上服务器时河流和人体交互仍可运行，但不会凭空出现硬编码留言；曾经加载过则断网继续循环已有池。

手机 approved 事件只入队，下一个有名额的生成时机从左侧进入，不清屏。常规上限默认 36 条，另保留一个实时入场位（总活动对象最多 64 条，包含捕获/释放/撤下过渡），面板生成间隔为 1.5 秒。普通历史抽取会根据完整漂流时间协调节奏，默认实际约 1.86 秒一条；启动预置覆盖完整入场至离场区间，避免中段满额后左侧断档，详见 MEMORY_INTERACTION.md。

**等待时间**：无积压且实时名额可用时，约一个生成周期内（默认最多 1.5 秒）生成。生成位置仍为 x=-0.24，需要约 6–11 秒逐渐进入可见区，取决于文本宽度；不能把“收到事件”等同于“全文已经入屏”。有队列或实时名额占用时按 FIFO 等待名额再进入，可能跨多个周期；身体减速、捕获与暂停会延长等待，不能保证所有留言固定周期数内显示。不会为追求即时显示而清空已有文字或批量挤入。

## 同步顺序与撤下接口

Socket.IO 与 Express 共享同一个 HTTP server、同一个 3000 端口。POST 先持久保存；approved 才发 `message:approved`，pending 不推送。Socket 监听在连接前注册；初始连接、重连和每 30 秒进行快照同步，同步期间缓存事件。

先用完整快照替换 approved 集合，再处理同一 epoch 下高于快照 revision 的事件。首次快照已经包含的并发实时事件也保留一次首次入队机会；ID 的 seen 集合防止重发或重连重复排队，完成首次入场后依然允许历史随机抽取。网络失败保留池和实例，超时/重连后重试；新服务进程的 epoch 隔离旧事件。

预留服务端 `store.hide(id)` 与 `publishRemoved(id)`（应先保存隐藏状态，再广播），事件格式 `message:removed: {epoch,revision,id}`。浏览器移除池和队列中的 ID，所有对应视觉实例约 0.8 秒淡出，若捕获则解除捕获。快照也会清除漏收事件期间不再 approved 的 ID。当前没有公开隐藏/删除管理路由；第四阶段需添加管理员认证后调用这些模块。客户端发送同名事件不会改变数据库或触发广播。

## 验证

```powershell
npm.cmd test
npm.cmd run test:server
npm.cmd run build
node server/display-browser.mjs
```

最后一项使用独立临时 SQLite、3107 API 与 5175 Vite，自动启动和关闭进程，需这两个端口空闲。不会写入真实手机留言；用 Edge / 软件 WebGL 实际验证表单→SQLite→Socket→原文字左入场、服务器停止时动画继续、重启后持久化及补齐/撤下，截图 `test-results/database-live-memory.png`。运行原 Playwright 全套前请先启动新版留言服务器（旧 `/api/health` 可用不代表有第三阶段接口）。

本轮已通过 38 项单元测试、四项服务端集成测试、上述真实浏览器闭环及构建，实际数据库幂等导入已复查。尚未执行本阶段真实手机热点、实际 USB 摄像头和大屏长期验收；不能把浏览器模拟手机表单当成真人手机网络测试。保留原有视觉和人体模块，未进入第四阶段管理员开发或公网部署。
