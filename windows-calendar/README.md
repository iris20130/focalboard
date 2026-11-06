# Focalboard 任务栏假勤日历（Windows）

Windows 托盘小工具：点击任务栏托盘图标（或双击托盘图标），立即弹出 Focalboard 的**假勤助手**月历，
直接对接远程 Focalboard 服务器，内嵌网页登录并记住会话；断网时显示上次同步的本地记录，联网后自动同步。

## 功能

- 托盘常驻，点击图标弹出无边框置顶窗口，失去焦点自动收起
- 弹窗内容就是 Focalboard 顶栏点击后的**假勤助手**（年假 / 调休余额、月历、节气、流水）
- 首次使用在弹窗内登录，令牌保存在 WebView2 用户数据目录，后续免登录
- 可设置服务器地址（如 `https://your-server:5443` 或 `http://192.168.1.100:8088`）
- **离线可用**：缓存假勤汇总、月历、农历/节气与当前用户信息到
  `%LOCALAPPDATA%\FocalboardCalendar\cache\<服务器>\`，断网时渲染本地月历
- **自动恢复**：每 15 秒探测一次服务器，恢复后自动回到在线页面并同步
- 可选“置顶”模式：窗口不随失焦隐藏，适合常驻查看

## 运行

1. 安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win10/11 一般已内置）
2. 运行 `runtime\FocalboardCalendar.exe`
3. 托盘图标右键 → “设置服务器地址”，填写 Focalboard 地址
4. 在弹出的网页里登录，之后点击托盘图标即可看假勤月历

配置文件：`%APPDATA%\FocalboardCalendar\config.ini`
日志：`%LOCALAPPDATA%\FocalboardCalendar\app.log`

## 从源码构建

无需 Visual Studio，使用 .NET Framework 4.8 自带的 `csc.exe` 编译：

```bat
build.bat
```

要求 `lib\` 下存在 WebView2 SDK 的三个程序集（`Microsoft.Web.WebView2.Core.dll`、
`Microsoft.Web.WebView2.WinForms.dll`、`WebView2Loader.dll`），仓库内的 `runtime\` 目录已包含。

## 说明

- 本程序不保存账号密码，登录态由 WebView2 的站点数据维护
- 不修改服务器数据；同步仅为读取假勤 / 用户 / 农历接口做离线展示
- 自签名 HTTPS 证书会被接受（内网部署常见），请仅在自己信任的服务器上使用

---

## English

A Windows tray companion for Focalboard. Click the tray icon to pop up the Focalboard
**leave assistant** (annual leave / compensatory leave balances, month calendar, solar terms, ledger),
connecting directly to a remote Focalboard server with in-app web login and remembered sessions.

- Offline: the last synced summary, calendar, lunar data and profile are cached under
  `%LOCALAPPDATA%\FocalboardCalendar\cache\<server>\` and rendered as a local month view.
- Auto-recovery: the server is probed every 15 seconds; when it is reachable the online page
  reloads and data is synced again.
- Build: `build.bat` (uses the .NET Framework 4.8 `csc.exe`, no Visual Studio required).
- Config: `%APPDATA%\FocalboardCalendar\config.ini`; log: `%LOCALAPPDATA%\FocalboardCalendar\app.log`.
