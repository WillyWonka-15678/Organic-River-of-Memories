# 手机热点连接测试（第一阶段）

## Windows 启动

1. 手机开启 Wi-Fi 热点，电脑连接该热点，保持热点开启。
2. 在项目根目录打开 PowerShell，首次安装或换电脑时运行 `npm.cmd install`。
3. 运行 `npm.cmd run server`，保持终端开启；按 Ctrl+C 停止。
4. 电脑打开 http://localhost:3000/test 。
5. 手机使用启动日志中对应 Wi-Fi 网卡的地址，例如 `http://192.168.43.120:3000/test`。这个 IP 只是示例，必须换成电脑当前地址。手机上不能填 localhost 或 0.0.0.0。
6. 页面应显示「服务器已连接」。点击「发送测试请求」，看到「连接成功，电脑已收到请求」，电脑终端也应打印收到请求。

## 查找正确 IPv4

```powershell
ipconfig
netsh wlan show interfaces
```

在 ipconfig 的「无线局域网适配器 WLAN / Wi-Fi」下找 IPv4，排除「媒体已断开连接」、蓝牙、VPN、Hyper-V/WSL 等虚拟网卡。用第二条命令确认 Wi-Fi 已连接，SSID 是手机热点名称，并核对网卡名称。手机自身热点网关不是电脑地址。服务日志列出非内部 IPv4 候选，不能自动保证哪一个是热点网卡。

## 端口与原项目

此服务使用 Node.js + Express，监听 `0.0.0.0`，默认 3000。原 Vite 大屏保持 `npm.cmd run dev` 和 http://127.0.0.1:5173/ ，两者可在不同终端同时运行。

修改测试服务端口（只对当前 PowerShell 生效）：

```powershell
$env:PORT='3001'
npm.cmd run server
# 停止服务后如需恢复默认：
Remove-Item Env:PORT
```

修改后手机和电脑 URL 中的端口也要同步更换。

## 排查连接失败

- 先在电脑访问 localhost 测试页。打不开时检查终端报错、端口占用、Node 是否安装以及服务是否仍在运行。`Get-NetTCPConnection -State Listen -LocalPort 3000` 可查看端口监听。
- 本机可用但手机打不开：确认电脑连接的确实是该手机热点，核对当前 Wi-Fi IPv4 与端口，明确输入 `http://`。关闭会改变路由的 VPN 后重试；热点重连可能改变电脑 IP。
- Windows 防火墙可能阻止外部访问。若弹出 Node.js 网络访问提示，按实际可信网络配置允许；必要时由用户在「Windows Defender 防火墙 → 允许应用」检查 Node.js，或手动为所选端口建立限定当前网络的入站规则。无需关闭整个防火墙，本项目不会自动修改任何防火墙设置。
- 部分手机热点有设备隔离或不支持热点宿主访问客户端。检查热点设置；必要时用普通路由器同一 Wi-Fi 交叉验证网络限制。
- 页面能打开但按钮失败：查看页面显示的超时/HTTP/网络错误，检查电脑终端；可直接访问 `/api/health` 判断服务是否仍可用。

## 接口与自动验证

- `GET /api/health`：`{ "ok": true, "service": "memory-river", "status": "running" }`
- `POST /api/test`：返回接收成功信息，不保存留言。
- `/test`：手机竖屏测试页，相对路径调用 API，无固定 IP，无跨域依赖。
- `npm.cmd run test:server`：真实本地 HTTP 测试，验证监听地址、两个接口、页面、404、非法 JSON 与过大请求。使用临时端口，不占用 3000。

第一阶段最初仅提供连接测试；后续第二阶段已增加 /submit 和 SQLite 保存，见 [手机留言说明](PHONE_MESSAGES.md)，服务器使用 Node.js 24。仍没有 WebSocket、大屏接入或公网部署。自动测试不能代替真实手机热点测试；必须按上述步骤在手机上人工验收。

第三阶段更新：现已增加 Socket.IO 与已批准留言的大屏同步，连接测试地址不变，详见 [统一留言池](DATABASE_DISPLAY.md)。仍未部署公网或开发管理员后台。
