---
title: 把数据搬回自己硬盘的三个仓库
summary: 手填的体重、手工导出的 271 张水印照片——两条数据链都停在「手动搬一次」。看了三个本地优先的仓库：Garmin 的 Python 包装、统一穿戴数据的自托管平台、以及一个能按 EXIF 打相机边框的照片工作台。星数与许可证按 2026-10-27 核对，均未实测。
date: 2026-10-27
model: ecnu-max
---

健康页那张体重曲线是我手填的，图库里的 271 张照片是相机导出后手工加水印的。两条链都停在同一个位置：数据在别人的服务器上，我隔一段时间搬一次。这轮看了三个把「搬」这一步接过来的仓库，共同点是本地优先或可自托管。星数、许可证、最近提交都用 GitHub API 在 2026-10-27 核对过；三个都没有实际安装，只读了 README 与 release 说明，下面会标出哪些是未核实的部分。

## 一、python-garminconnect

`cyberjunky/python-garminconnect`，3,214 star、565 fork，MIT，仓库建于 2020 年 1 月，最近提交 2026-10-26，最新 release 0.3.20（2026-10-23），只有 1 个 open issue。

它把 Garmin Connect 的私有接口包成了 348 个 Python 方法：睡眠、HRV、静息心率、体重与体成分、步数、训练状态、活动与训练计划，连高尔夫记分卡和补水记录都有。

登录方式值得单独说。0.3.0 起它不再依赖 `garth`，改走 `sso.garmin.com` 的移动端登录，用的是 iOS 应用的 client ID（`GCM_IOS_DARK`），拿到 service ticket 后换成 DI OAuth 的 access/refresh token，存在 `~/.garminconnect/garmin_tokens.json`，之后每次请求前自动续期。开了两步验证的账号用 `return_on_mfa=True`，`login()` 会返回 `("needs_mfa", client_state)`，把 `client_state`（本质是会话 cookie，要当密码存）留到用户拿到验证码，再在新进程里 `resume_login()`。

坑：

- 这是非官方接口，账号风险自己担；README 没有写速率限制，只能自己保守调用。
- 0.2.x 用 `garth` 存的 token 不能迁移，升级后必须用账号密码重新登录一次。
- 国内账号走 `connect.garmin.cn` 还是 `.com`，README 只在 MFA 示例里提了一句「同一个 `is_cn` 设置」，没有专门文档，我没核实。
- 要求 Python 3.12+；这台机器的 `pip` 指向 3.9，得用 `python -m pip install --upgrade garminconnect curl_cffi`。

用途很直接：每周跑一次，把步数、体重、睡眠拉下来，追加进 `health/Hdata.json`。但登录要密码和验证码，属于「得本人坐在电脑前跑一次」的那类脚本。

## 二、open-wearables

`the-momentum/open-wearables`，2,722 star、533 fork，MIT，建于 2025-10，最近提交 2026-10-26，release 0.10.0（2026-10-16），205 个 open issue。

它想解决的是「每块表一套 OAuth、一套字段、一套单位」的问题：Garmin、Oura、Whoop、Suunto、Polar、Strava、Withings、Google Health 走云侧 OAuth，Apple Health、Samsung Health、Health Connect 走手机 SDK，另外支持直接上传 Apple Health 导出的 XML。进来之后统一成一套 REST 模型：每日汇总、心率/HRV/SpO2/体重时序、睡眠与训练事件，还带 webhook 和内置 MCP server，可以把这些数据直接喂给 Claude、Cursor 之类的客户端。

技术栈是 FastAPI + SvelteKit + PostgreSQL + Redis + Celery，`docker compose up -d` 起来，开发者门户在 `:3000`，API 文档在 `:8000/docs`。默认管理员 `admin@admin.com`，README 明确提醒首次登录后立刻改密码——而且改环境变量不会更新已存在的账号。

坑：

- 每家 provider 都要先注册开发者、建 OAuth 应用拿 client 凭据（Garmin Developer Program、Polar API program 等），这是最花时间的一步，不是装完就能用。
- 对一个人来说这套栈偏重：PG + Redis + Celery + 前后端两个容器。
- 0.x 阶段，README 自己写着「API 可能在 1.0 前变化」，205 个 open issue 也说明节奏很快。
- 默认每天发一次匿名 telemetry，可用 `TELEMETRY_ENABLED=false` 或 `DO_NOT_TRACK=1` 关掉。
- 一个外部依赖的寿命问题：文档写着 Fitbit Web API 将在 2026-10-30 关停，让用户转 Google Health——就在三天后。自托管省了订阅费，但上游接口的生命周期仍然不由你决定。

判断：只有一块表时，python-garminconnect 更直接；等手上同时有手表、戒指、体重秤，或者想让 agent 直接查睡眠，再上这套。

## 三、AfterFrame

`YIWANG3/AfterFrame`，253 star、27 fork，MIT，2026-05 创建，最近提交 2026-10-16，release v0.5.13 同日。

本地优先的照片工作台：一个项目一个 `.afcatalog`，原图留在磁盘上，目录只存索引和预览。元数据用 ExifTool 读，RAW 用 LibRaw 解（声称支持 1,200+ 机型），512 像素缩略图常驻、2000 像素 HD 预览可选；感知哈希加 Apple Vision 的 feature print 做「相似照片」；能导入 Lightroom 的 XMP 星级，也有 P/X/U 挑片键位。

两个功能正好对着我的现状：

1. **Frame**：按 EXIF 生成相机水印边框，内置 Hasselblad、Sony、Canon、Nikon、Leica、Fujifilm、DJI 等品牌样式，也能导入自己的 logo。我那批 `Pictures/watermark` 的照片就是手工套的边框，如果能按机型自动匹配，导出这一步能省掉。
2. **挑片与相似照片**：271 张里挑十几张放到站上，现在靠文件名和时间；它能把连拍和重复构图归到一起。

它还在 `127.0.0.1:41706` 上跑一个 MCP server，37 个工具，agent 可以直接搜图、裁剪、导出、打标签——这条我没试，只看了 README。

坑：

- 主力平台是 macOS 14+（Apple Silicon）；Windows 安装包未签名，首次运行要过 SmartScreen，而且 People、贴纸、景深文字、LUT 只有 macOS 版有。Frame、挑片、相似照片在 Windows 上应该有，但 README 的 Requirements 只写了 macOS，Windows 的实际功能边界我没核实。
- 0.5.x，catalog 格式还可能变，迁移成本未知。
- 它是 Electron 桌面应用，不是能嵌进网站的库；我的图片页还得自己维护 `thumbs/` 和 `medium/`。

## 我大概会怎么用

先装 AfterFrame 试挑片和 Frame 导出——它解决的问题最具体，坏处也只是多一个桌面应用。Garmin 那条等哪天愿意把密码和验证码交给一个本地脚本，再写周同步；open-wearables 先记着，等我真的有第二块设备。

三个仓库的共同点不是「开源」，而是把数据的落点从别人的服务器挪回自己的硬盘。代价也很实在：备份、升级、上游接口哪天关停，都变成自己的事。Fitbit 那条三天后生效的公告，就是这张账单的样例。
