# Windows 托盘启动器 / Windows tray launcher

`FocalboardLauncher.cs` 是 Windows 版 `Focalboard.exe` 的源码（C# WinForms，单文件）。
负责：启动/停止服务端子进程、托盘菜单、开机自启、防火墙放行、打开浏览器与日志、读取 `config.json` 端口。

源码为单文件，无外部依赖，仅使用 .NET Framework 自带的 `System.Windows.Forms`。

## 构建 / Build

使用 Windows 自带的 C# 编译器（.NET Framework 4.x，`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`）：

```bat
csc /target:winexe /optimize+ /out:Focalboard.exe /win32icon:focalboard.ico FocalboardLauncher.cs
```

生成的 `Focalboard.exe` 需与 `focalboard-server.exe`、`config.json`、`quotes.txt`、`pack\` 放在同一目录。

## 运行时文件 / Runtime layout

```
Focalboard.exe            托盘启动器
focalboard-server.exe     服务端
config.json               端口/功能开关（支持 // 注释）
quotes.txt                顶部提示栏语录
pack\                     前端静态资源
data\                     数据库、附件、日志
```

使用说明见 [docs/delivery/使用说明.txt](../docs/delivery/使用说明.txt) / [UserGuide_EN.txt](../docs/delivery/UserGuide_EN.txt)。

图标 `focalboard.ico` 取自 Focalboard 官方素材，遵循项目 LICENSE。
