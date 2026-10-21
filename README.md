# 《时光弹幕河》· 第一阶段

Windows 浏览器本地交互艺术原型。Three.js + WebGL2 Shader + MediaPipe Image Segmenter，无数据库、登录和网络交互服务。

## 启动

环境：Node.js 22.12+（已在 Node 24 上验证）、Windows Edge 或 Chrome、开启硬件加速的 WebGL2 显卡。

在此项目目录打开 PowerShell：

```powershell
npm.cmd ci
npm.cmd run assets
npm.cmd run dev
```

打开终端显示的本机地址，通常是 <http://127.0.0.1:5173> 。本次交付已完成依赖安装和资源下载，当前电脑可直接执行 `npm.cmd run dev`。首次 `assets` 会从 Google 官方地址下载约 250 KB 的人体分割模型，并复制 npm.cmd 包中的 WASM；随后浏览器运行不依赖 CDN。换电脑时须重新执行前两步，或复制完整构建产物。

点击“开启摄像头”并允许权限。USB 摄像头使用 Windows/浏览器默认的视频输入设备；有多个摄像头时，请在浏览器站点摄像头设置中选择 USB 摄像头后重新开启。摄像头画面仅在本机处理，不上传、不录制。

- `F`：进入/退出全屏；也可使用浏览器 `F11`。
- `D`：显示/隐藏实时调试。
- `H`：隐藏/恢复全部界面，适合大屏展示。
- 首次打开为纯粹的向右波浪流动。调试面板开启“演示人体排斥”可预览上下分流；开启摄像头后自动使用真实人体。
- “显示轮廓调试”展示分割轮廓与金色头胸估计区域。默认镜像开启，人体左右移动应与屏幕同向。

展示用生产构建：

```powershell
npm.cmd run build
npm.cmd run preview
```

打开 <http://127.0.0.1:4173> 。不要双击 `dist/index.html`：摄像头与 Worker 需要 localhost/HTTPS 服务。完整 `dist/` 可通过本地静态服务器部署；当前资源路径按网站根目录配置。`assets` 必须先运行，避免构建时缺少模型/WASM。

## 功能与实现

- 默认 65,536 个发光粒子，面板可调整至 262,144。位置与平滑速度保存在浮点纹理中，由 GPU ping-pong fragment shader 更新，CPU 不逐个计算粒子。
- 粒子沿 48 个清晰的流动层以固定速度向右运动，以缓慢的长波控制上下起伏。每个粒子保留自己的原始层，经过人体后回到原来的流动层；没有随机旋转、横向倒流和上下边缘传送。双缓冲纹理保留并按时间衰减拖尾。
- MediaPipe landscape selfie 人体分割在经典 Worker 中运行 CPU/WASM 推理，避免阻塞渲染线程或与渲染争用 GPU。最多一个推理帧在途，默认目标 20 FPS，只提交新视频帧。
- 人体分割轮廓经连通区域和上半身比例估计头胸范围，构建平滑的纵向偏移场：上侧流动层向上，下侧向下，经过人体后重新汇合。GPU 只改变纵向位置，横向速度保持恒定；没有根据遮罩删除粒子。192×108 距离场保留用于轮廓调试。
- 头胸位置属于轮廓比例估计，没有使用解剖关键点模型。近距离、截断身体、侧身或多人重叠时需要现场确认金色调试区域；分割连在一起的多人可能被当作同一交互区域。
- 轮廓快速响应、缓慢释放。识别结果过期会淡出旧场；摄像头断开/推理失败会释放资源并提示重试，河流继续运行。
- 流速、波浪起伏、波浪长度、变化速度、上下避让强度、头胸避让余量、颜色、拖尾、粒子数量均可实时调整。推荐先保持默认波浪起伏 0.024、波浪长度 1.35；想更平直可将波浪起伏调至 0.01。数量变更会重建 GPU 缓冲并清除旧拖尾。

## 模块结构

```text
src/
  main.ts                         启动、调试面板、主循环
  config.ts                       参数及类型
  render/River.ts                 GPU 计算与拖尾合成
  render/shaders.ts               流场、排斥、粒子和全屏 Shader
  interaction/BodyInput.ts        摄像头、帧背压、轮廓映射与故障恢复
  interaction/segmentation.worker.ts  MediaPipe 推理
  interaction/field.ts            有符号距离变换、时间平滑
  interaction/upperBody.ts        头胸区域估计、顺序保持的纵向偏移场
  integrations/events.ts          人体存在和未来文字消息的事件契约
scripts/                          本地模型/WASM准备、经典 Worker 打包
tests/                            数学测试与浏览器集成测试
```

后续毕业生文字渲染可独立订阅 `riverEvents` 的 `text` 事件；手机 WebSocket、数据库适配器应放在 `integrations/`，向同一事件总线投递消息，不进入 GPU 或摄像头模块。当前仅预留契约，没有启动 WebSocket 或数据库连接。

## 测试

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

生产构建回归（先执行 `npm.cmd run build`）：

```powershell
$env:RIVER_TEST_PRODUCTION='1'
npm.cmd run test:browser
Remove-Item Env:RIVER_TEST_PRODUCTION
```

本次验证结果：TypeScript 与生产构建通过；6 项单元测试通过；开发服务及生产构建各 3 项浏览器测试全部通过。尚未验证真实 USB 摄像头识别质量及目标大屏的硬件帧率。

单元测试验证距离场正负、内部方向、空/满轮廓边界和与帧率独立的平滑恢复。Playwright 使用本机 Edge 的模拟摄像头及 SwiftShader 软件 WebGL，检查 1080p 实际像素输出、无 Shader 错误、调试面板、粒子数量切换、窗口缩放、拒绝摄像头以及真实 MediaPipe Worker 连续推理。模拟视频不是人体识别准确率测试，软件渲染 FPS 也不是现场显卡性能。截图输出在 `test-results/river-1080p.png`。

## 真实摄像头和大屏验收

1. Windows 输出设为 1920×1080 / 60 Hz，浏览器缩放 100%，移到目标屏幕后全屏。确认 GPU 硬件加速启用；先以 65,536 粒子运行 10–20 分钟，观察 FPS、是否发热降频或卡顿。目标为稳定接近 60 FPS；吃紧时先降至 32,768 粒子及 15 FPS 分割。
2. 开启轮廓调试，检查 USB 摄像头镜像、上下方向、视场与站位。摄像头使用居中 cover 裁切至 16:9；不同画幅会裁掉边缘，非 16:9 窗口会拉伸交互映射，正式展示请用 16:9。摄像头和屏幕不是投影标定系统，需要根据实际安装位置调整朝向、距离。
3. 分别测试正面、侧身、抬手、快速移动、两人交叠、深浅衣物、逆光和空背景。该模型面向自拍/视频人物，远距离全身、细手指及多人遮挡需要现场验证；必要时调整摄像头站位和照明，不能承诺任意距离稳定识别。
4. 静止人体时观察头胸区域的上下分流，移动时观察金色估计区域跟随；人离开后应在数秒内恢复，旧拖尾自然淡出。调试时可暂时关掉演示轮廓，避免将它误认为残留人体。
5. 测试拒绝权限、关闭/重开、拔掉 USB 和重新接入。确认提示、重试可用、旧轮廓释放；重新连接后点击开启摄像头。
6. 调整大屏亮度、粒子尺寸和拖尾，检查暗部层次、光点是否过亮、边缘是否堆积。长拖尾会保留运动历史，恢复速度与拖尾衰减是两项独立参数。

## 参考

推理 API 和 Worker 方案参照 [MediaPipe 官方 Web 文档](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js)；GPU 浮点纹理计算使用 [Three.js GPUComputationRenderer](https://threejs.org/docs/pages/GPUComputationRenderer.html)。

