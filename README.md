# Focalboard 局域网版（v8.0.0 中文定制版）

**English README: [README_EN.md](README_EN.md)**

基于 [Mattermost Focalboard](https://github.com/mattermost/focalboard) v8.0.0 源码定制的**局域网多人看板系统**，面向内网团队协作：双击即用、数据自持、不需要公网账号体系。

除了原版看板能力，定制版增加了**到期提醒（右栏 + 多渠道推送）**、**假勤助手（年假 / 调休）**、**工作日工时属性**、**顶部日期提示栏**、**工作流泳道**、**手机 APP 外壳**等，并提供 Windows 免安装包、Docker 镜像和 Android APK 三种交付形态。

---

## 功能特性

### 看板与视图
- 看板 / 表格 / 画廊 / 日历四种视图，支持筛选、排序、分组
- 13 套内置模板，跟随界面语言自动切换中英文（会议议程、项目任务、销售管道、冲刺规划、路线图、OKR 等）
- **工作流视图**：按某个选择属性把看板拆成多行泳道，可折叠、可改名、可新增工作流，跨工作流禁止拖动
- **紧凑模式**与**卡片隐藏**：小卡片只看标题 + 一个属性；隐藏的卡片可随时恢复

### 到期提醒
- 只读公式属性“**到期状态**”：已逾期 / 今天到期 / 即将到期 / 正常 / 未设置日期，自动识别截止类日期属性
- **右侧提醒栏**：按看板显示逾期（红）/ 临期（橙）/ 待返（紫）三个数字，可拖动调宽，点击卡片跳转定位并闪烁高亮
- **多渠道推送**：飞书、企业微信、钉钉、方糖（Server酱）、自定义 JSON；每个账户独立配置，支持提前天数、推送日、推送时段、间隔/每日定时与“立即推送”
- 推送内容复用右侧提醒栏同一条服务端链路，数字与网页显示完全一致
- **实际完成日期**：卡片状态改为“已完成”自动写当天日期，移出提醒栏

### 假勤与工时
- **假勤助手**：年假 / 调休流水记录，按工龄法定档自动发放年假（≥20 年 15 天、≥10 年 10 天、≥1 年 5 天），支持手动发放
- 清零规则“累积年 + N 年的固定月日”，FIFO 扣减，支持半天，到期作废，余额不足拒绝登记
- 看板日历视图叠加本人假勤与二十四节气；流水可导出 txt
- **工时（工作日）**公式属性：按两个日期属性计算工作日跨度，含首尾、跳过周六日

### 顶栏与体验
- 顶部日期条：公历、星期、干支纪年、农历、假勤徽标；左键弹窗、右键钉住假勤月历
- 提示栏单行滚动语录，语录在 `quotes.txt` 中维护，分 [idle]/[busy] 两节，改完刷新即生效
- 中英文界面、托盘常驻、开机静默自启、防火墙一键放行

### 多用户与数据
- 内置账号登录，**首个注册账号自动成为管理员**；邀请链接注册
- 管理员成员面板：查看在线状态、添加账号、重置密码、移除成员
- SQLite 单文件数据库 + 附件目录，整体复制 `data` 即可备份迁移

---

## 下载与安装

全部成品在 [Releases](https://github.com/iris20130/focalboard/releases/latest) 页面：

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows（免安装） | `Focalboard-Windows-8.0.0-lan-20261026.zip` | 解压后双击 `Focalboard.exe` 即可，无需管理员权限 |
| Linux / Docker | `focalboard-docker-8.0.0-lan-20261026.tar.gz` | 预构建镜像 + compose 配置 + 配置样例 |
| Android | `FocalboardMobile-1.1.0.apk` | 手机 APP 外壳，支持 Android 8.0+ |

### Windows 快速开始
1. 解压 zip，双击 `Focalboard.exe`（托盘出现图标，浏览器自动打开局域网地址）
2. 点“注册”创建第一个账号 —— 该账号自动成为管理员
3. 管理员登录后点左下角用户名 →“邀请使用者”，把注册链接发给同事
4. 同事打不开时：右键托盘 →“允许局域网访问（防火墙）”

> 默认已开启开机静默自启；右键托盘 →“开机自动启动（登录后静默运行）”可关闭。
> 端口固定 8088，配置文件 `config.json`（支持 `//` 注释）。

详细说明：[Windows 使用说明](docs/delivery/使用说明.txt) ｜ [User Guide (EN)](docs/delivery/UserGuide_EN.txt)

### Docker 快速开始
```bash
docker load -i focalboard-docker-8.0.0-lan-20261026.tar.gz
docker compose up -d          # 使用包内 compose 与配置
```
浏览器打开 `http://服务器IP:8088/`，注册第一个账号即可。

详细说明：[Docker 部署手册](docs/delivery/镜像使用说明.md) ｜ [Docker Guide (EN)](docs/delivery/DockerGuide_EN.md)

### 手机 APP
1. 安装 `FocalboardMobile-1.1.0.apk`
2. 首次打开填写服务器地址，如 `http://192.168.1.100:8088`
3. 底栏三个标签：**看板**、**日历 / 假勤**、**提醒设置**；长按 3 秒后拖动可调整标签顺序
4. 更换服务器：进入设置页清除数据后重新填写

详细说明：[手机 APP 使用说明](docs/delivery/手机APP使用说明.md)

---

## 截图

> 截图尚未上传。维护者把图片放到 `docs/screenshots/` 后，本节会替换为实际图片（文件名见表格）。

| 需要的截图 | 建议文件名 |
|---|---|
| 看板主界面 + 右侧提醒栏（含顶部日期条） | `docs/screenshots/board.png` |
| 假勤月历弹窗 / 钉住面板（含节气与流水） | `docs/screenshots/leave-calendar.png` |
| 提醒设置齿轮面板（推送 + 按看板属性） | `docs/screenshots/reminder-settings.png` |
| 手机 APP：看板 / 日历假勤 / 提醒设置三页拼图 | `docs/screenshots/mobile.png` |

---

## 仓库结构

```
.
├── server/              # Go 服务端（含定制：提醒推送、假勤、顶栏、农历/节气）
├── webapp/              # React + TypeScript 前端（含定制组件：dueLayout、leaveCalendar…）
├── mattermost-plugin/   # Mattermost 集成插件（上游）
├── launcher/            # Windows 托盘启动器源码（C#）
├── mobile/              # Android APP 源码（Kotlin WebView 外壳）
├── docs/delivery/       # 交付文档：Windows / Docker / APP 使用说明（中英文）
├── docker/              # Docker 构建文件（上游）
└── Makefile             # 构建入口
```

## 从源码构建

**依赖**：Go 1.21+、Node.js 18+（推荐 20）、npm。

```bash
# 1. 前端
cd webapp && npm install && npm run pack        # 产物在 webapp/pack

# 2. 服务端（Windows 示例）
cd ../server
go build -ldflags "-X github.com/mattermost/focalboard/server/model.Edition=dev" \
  -o ../bin/focalboard-server.exe ./main

# 3. 组织运行目录
#    把 focalboard-server.exe、config.json、quotes.txt、webapp/pack/ 放到同一目录
#    （Windows 成品还需要 launcher/ 编译出的 Focalboard.exe 托盘程序）
```

- 模板归档：`make templates-archive`（英文）/ `make templates-archive-zh`（中文）
- 托盘启动器：见 [launcher/README.md](launcher/README.md)
- 手机 APP：见 [mobile/README.md](mobile/README.md)

## 配置要点

`config.json` 在打包成品中已带中文注释，常用项：

| 配置 | 说明 |
|---|---|
| `port` | 监听端口，默认 `8088` |
| `authMode` | `native`（内置账号登录） |
| `topBarEnabled` | 顶部日期提示栏开关 |
| `dueReminderEnabled` | 到期提醒服务端开关 |
| `dueReminderCheckInterval` | 提醒扫描间隔（分钟） |

推送 Webhook / 签名密钥在网页里按账户配置（右栏齿轮 → 推送设置），不写进 `config.json` 时使用系统默认值。

## 安全提示

- 默认使用 HTTP 明文传输，**仅建议在可信局域网内使用**；公网访问请在前面加 HTTPS 反向代理（Nginx / Caddy）
- Webhook 地址与签名密钥等同于机器人权限，请勿外发 `config.json`
- 定期备份 `data` 目录（先退出程序再复制）

## 许可与致谢

本项目基于 [Mattermost Focalboard](https://github.com/mattermost/focalboard)（v8.0.0，MIT / AGPL 混合许可，详见 [LICENSE.txt](LICENSE.txt)）修改，保留原项目版权声明；定制部分同样遵循原项目许可。
Focalboard 是 Mattermost, Inc. 的商标，本项目与 Mattermost 官方无隶属关系。
