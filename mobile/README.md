# Focalboard Mobile (LAN) / 局域网版手机 APP

Android 外壳（Kotlin，单 Activity + 3 个 WebView 页面），用于在手机上访问局域网内的 Focalboard 服务端。
An Android WebView shell (Kotlin, single activity, 3 swiped pages) for the LAN edition server.

- 页面 / Pages：看板（裁剪后的看板页）、日历/假勤（自动打开假勤弹窗）、提醒设置（自动展开右栏齿轮）
- 底栏 / Bottom bar：三个标签，长按 3 秒后拖动换位
- 版本 / Version：1.1.0（versionCode 2），minSdk 26，targetSdk 34

## 构建 / Build

需要 JDK 17 + Android SDK（compileSdk 34）。

```bash
cd mobile
cp keystore.properties.example keystore.properties   # 填入自己的签名信息；不填则输出未签名包
gradle assembleRelease
```

产物：`app/build/outputs/apk/release/app-release.apk`（已签名时）。

## 配置 / Configuration

首次打开输入服务器地址（例如 `http://192.168.1.100:8088`），可长按底栏「设置」页更换服务器或清除数据。

## 说明 / Docs

完整使用与维护说明见 [docs/delivery/手机APP使用说明.md](../docs/delivery/手机APP使用说明.md)。

APP 只是网页外壳，所有数据仍在服务端；网页升级导致 CSS 类名变化时需同步调整 `app/src/main/java/com/focalboard/mobile/InjectionJs.kt`。
