# 《时光弹幕河》· Organic River of Memories

Windows 浏览器本地交互艺术原型。Three.js + WebGL2 Shader + MediaPipe Image Segmenter，无数据库、登录和网络交互服务。

项目概念、功能、开发历程与后续变更持续记录在 [开发日志](开发日志.md)。

## 启动项目

### 本机启动

在项目文件夹打开 PowerShell，运行：

```powershell
npm.cmd run dev
```

更新到人体星座版本后，若尚未准备新姿态模型，先执行一次 `npm.cmd run assets`。本次工作已在当前电脑准备好该模型。

打开终端显示的本机网址，通常是 <http://127.0.0.1:5173/>。若 5173 端口已被占用，Vite 会自动换一个端口，请以终端显示的网址为准。PowerShell 中使用 `npm.cmd` 可避开系统禁止运行 `npm.ps1` 脚本的限制。

### 换一台电脑运行

将整个项目文件夹复制到新电脑，并安装 Node.js 22.12 或更新版本。然后在项目目录打开 PowerShell，依次运行：

```powershell
npm.cmd ci
npm.cmd run assets
npm.cmd run dev
```

首次运行 `npm.cmd run assets` 需要联网下载人体分割模型、单人 Pose Landmarker Lite 模型并准备 MediaPipe 文件。之后无需重复下载，执行 `npm.cmd run dev` 即可启动。浏览器打开终端显示的网址。

需要 Windows Edge 或 Chrome，并开启硬件加速及 WebGL2。

项目打开后会自动请求摄像头权限；首次使用时请在浏览器提示中选择“允许”。USB 摄像头使用 Windows/浏览器默认的视频输入设备；有多个摄像头时，请在浏览器站点摄像头设置中选择 USB 摄像头后刷新页面。若拒绝权限，可点击“开启摄像头”重试。摄像头画面仅在本机处理，不上传、不录制。

- `F`：进入/退出全屏；也可使用浏览器 `F11`。
- `D`：显示/隐藏实时调试。
- `H`：隐藏/恢复全部界面，适合大屏展示。
- 默认打开完整艺术版本：流束、丝绸、光尘和少量模拟寄语，技术面板隐藏。调试面板的“创作阶段”可独立查看四个阶段；也可使用 `/?stage=1` 至 `/?stage=4`。
- 调试面板的“演示人体排斥”使用明确标识的合成轮廓，仅供无摄像头预览。真实摄像头开启后始终使用实际人体 Mask。
- “显示轮廓调试”展示实际驱动交互的分割轮廓。默认镜像开启，人体左右移动应与屏幕同向。

展示用生产构建：

```powershell
npm.cmd run build
npm.cmd run preview
```

打开 <http://127.0.0.1:4173> 。不要双击 `dist/index.html`：摄像头与 Worker 需要 localhost/HTTPS 服务。完整 `dist/` 可通过本地静态服务器部署；当前资源路径按网站根目录配置。`assets` 必须先运行，避免构建时缺少模型/WASM。

## 功能与实现

- **三种视觉配色**：默认 B · Teal & Violet，以青绿为主、次级流束与尾涡呈现更浓郁的紫罗兰；A · Original 可切回原有青绿与香槟金；C · Iridescent 提供克制的青绿、蓝紫、淡粉与金色珠光。打开「参数 → 视觉配色」即时比较，可调辅助色比例、饱和度、变化速度、交互色彩强度与 Bloom。配色只改变渲染颜色，不改变运动规则。用法与同状态截图见 [色彩系统说明](docs/COLOR_SYSTEM.md)。

- 新增 **Body Wake 人体尾涡**：躯干横移向河流注入最多 3 个有界旋转速度源，实际河流粒子与连续光丝共同卷动，停下后停止生成，已有尾涡继续沿局部河流漂移并消散。打开「参数 → 人体尾涡 / Body Wake」可选择关闭、仅尾涡、河流合成，以及鼠标轨迹测试。详细参数、算法分析和阶段截图见 [人体尾涡说明](docs/BODY_WAKE.md)。

- 默认 65,536 个发光粒子，面板可调整至 262,144。位置与平滑速度保存在浮点纹理中，由 GPU ping-pong fragment shader 更新，CPU 不逐个计算粒子。
- 四条独立流束采用加权概率、截断高斯横截面和可变宽度播种，替代原来的 48 条等距流动层。宽窄、折叠、流速和聚散各不相同；稀疏光尘及少量发光碎片构成远近层次。
- GPU 速度以低频流束为骨架，叠加小尺度扰动、缓慢移动的局部涡旋与惯性。粒子具有不同寿命和淡入淡出，不会被逐帧拉回固定水平线。
- MediaPipe landscape selfie 人体分割在经典 Worker 中运行 CPU/WASM 推理，避免阻塞渲染线程或与渲染争用 GPU。最多一个推理帧在途，默认目标 20 FPS，只提交新视频帧。
- 交互直接使用 192×108 的实际 Mask 有符号距离、梯度和运动变化，不再使用固定头胸几何区域。镜像、居中裁切和画幅映射统一；距离变换按实际屏幕宽高比计算。
- 进入时约一秒逐渐感知，局部流束开始柔和绕流；躯干横移生成随流漂移的尾涡速度场，停留时轮廓附近保留聚光，离开后缓慢释放。人体绕流与手腕作用受统一速度预算限制；粒子不会被 Mask 直接删除或隐藏。
- 半透明丝绸网格与细粒子采用同一套流束函数。半浮点 HDR 拖尾、阈值提取的低分辨率局部柔光和最终 sRGB 转换提供克制的明暗层次；没有全屏泛光背景图。
- 三条模拟记忆在 36 秒循环中逐粒聚合成寄语和姓名/年份/专业，再分解回流束。字形通过 Canvas 字体采样成为 WebGL 粒子，受人体场影响；单独合成以保持近景可读性。
- `D` 面板保留流速、流束舒展、局部流动、轮廓绕流、感知范围、记忆消退、丝绸层次、颜色和光感等参数。数量变更会重建 GPU 缓冲并清除旧拖尾。
- 单人“人体星座”使用 Pose Landmarker Lite 的全部 33 个关键点与 3 个辅助点，和分割任务共用裁切、镜像后的 640×360 输入帧。共 36 个浅青/冷白发光节点和 44 条细弯连接，面部、手部节点更小更淡；少量暖金节点与河流呼应。运动渐显、静止时保留约 30% 的星座显示并释放沿河流漂移的光尘，手腕在 GPU 流场中产生局部吸引与旋涡。Mask 绕流继续运行。
- `D` 面板的“人体星座”文件夹可调节点大小、节点亮度、连接线透明度、运动平滑度、星光拖尾和手腕吸引强度。低置信度、画外和异常跳变的关节会淡出，不绘制推测出的长距离连接。姿态模型不可用时仍保留 Mask 交互。
- 人体现在还包含覆盖真实轮廓的星尘、不规则三角细网和薄雾光晕，浅青色为主、少量暖金亮星点缀。三层材质由 GPU 读取同一人体 Mask，保留手臂与躯干间的空隙；运动时凝聚，静止时保留淡淡的节点、连接与星尘。新增“身体星尘密度”“身体细网”“轮廓光雾”三项调节。细网是二维艺术纹理，不是额外识别出的关节或三维人体扫描。

## 模块结构

```text
src/
  main.ts                         启动、调试面板、主循环
  config.ts                       参数及类型
  render/River.ts                 GPU 计算与拖尾合成
  render/organicShaders.ts        共享流束函数、GPU 运动、光学 Shader
  render/SilkLayers.ts            可变宽度与褶皱的丝绸层
  render/HumanConstellation.ts    星点、柔软曲线、关节拖尾与消散光尘
  render/HumanStarField.ts        Mask 内星尘、三角细网与轮廓薄雾（GPU）
  interaction/BodyInput.ts        摄像头、帧背压、轮廓映射与故障恢复
  interaction/segmentation.worker.ts  MediaPipe 推理
  interaction/field.ts            有符号距离变换、时间平滑
  interaction/PresenceField.ts    实际轮廓、感知渐变、运动余波
  interaction/PoseTrack.ts        单人关键点映射、置信度、平滑与动静状态
  interaction/demoSilhouette.ts   明确标识的调试轮廓
  memories/MemoryRecord.ts        姓名、年份、专业、寄语契约与模拟数据
  memories/MemoryLayer.ts         字形采样、聚合、漂流与消散
  integrations/events.ts          人体存在与文字/记忆事件
scripts/                          本地模型/WASM准备、经典 Worker 打包
tests/                            数学测试与浏览器集成测试
```

后续 WebSocket 或数据库适配器可放在 `integrations/`，通过 `publish('memory', record)` 投递完整 `MemoryRecord`；旧的 `text` 事件仍支持 `{ id, text }`。`MemoryLayer.setRecords()` 可替换模拟记录，目前仅在本地内存中保留最多六条，不负责持久化。

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

验证覆盖六项距离场/渐变单元测试，以及四阶段渲染、模拟轮廓移动和恢复、模拟摄像头连续推理、拒绝权限、粒子重建和窗口缩放。阶段检查与截图见 [艺术设计与视觉验证](docs/ART_DIRECTION.md)。

人体星座另增加五项关键点跟踪单元测试及一个浏览器姿态场景，覆盖镜像/上下方向、派生关节对齐、静止消散、遮挡、离群点与 Mask 共存。使用方法和真实摄像头验收见 [人体星座说明](docs/HUMAN_CONSTELLATION.md)。

Playwright 使用本机 Edge 的模拟摄像头及 SwiftShader 软件 WebGL。截图输出在 `test-results/art-stage-*.png`；这些是实际浏览器渲染，不是概念图。开发 QA 模式的轮廓注入和时间定位在生产版中禁用，对应两项测试会跳过；生产版仍执行基础流场、丝绸与摄像头回归。截图和自动检查不能代替艺术方向的主观评价，模拟视频也不能证明真实摄像头识别质量。

## 真实摄像头和大屏验收

1. Windows 输出设为 1920×1080 / 60 Hz，浏览器缩放 100%，移到目标屏幕后全屏。确认 GPU 硬件加速启用；先以 65,536 粒子运行 10–20 分钟，观察 FPS、是否发热降频或卡顿。目标为稳定接近 60 FPS；吃紧时先降至 32,768 粒子及 15 FPS 分割。
2. 开启轮廓调试，检查 USB 摄像头镜像、上下方向、视场与站位。摄像头居中裁切至当前窗口画幅，再映射到交互纹理；边缘可能被裁掉。摄像头和屏幕不是投影标定系统，需要根据实际安装位置调整朝向、距离。
3. 分别测试正面、侧身、抬手、快速移动、两人交叠、深浅衣物、逆光和空背景。该模型面向自拍/视频人物，远距离全身、细手指及多人遮挡需要现场验证；必要时调整摄像头站位和照明，不能承诺任意距离稳定识别。
4. 先无摄像头观看至少一分钟，判断负空间、金色比例和波动节奏。开启摄像头后静止 10 秒，观察轮廓聚光；横移、抬手，检查真实轮廓与局部扰动；离开后应在数秒内恢复。调试时可关闭合成轮廓，避免误认成真人残留。
5. 测试拒绝权限、关闭/重开、拔掉 USB 和重新接入。确认提示、重试可用、旧轮廓释放；重新连接后点击开启摄像头。
6. 调整大屏亮度、粒子尺寸和拖尾，检查暗部层次、光点是否过亮、边缘是否堆积。长拖尾会保留运动历史，恢复速度与拖尾衰减是两项独立参数。

## 参考

推理 API 和 Worker 方案参照 [MediaPipe 官方 Web 文档](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js)；GPU 浮点纹理计算使用 [Three.js GPUComputationRenderer](https://threejs.org/docs/pages/GPUComputationRenderer.html)。

