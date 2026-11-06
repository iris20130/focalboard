using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using Microsoft.Win32;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Timer = System.Windows.Forms.Timer;

namespace FocalboardCalendar
{
    internal static class Program
    {
        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        [STAThread]
        private static void Main(string[] args)
        {
            bool created = false;
            using (Mutex mutex = new Mutex(true, "FocalboardCalendar.SingleInstance", out created))
            {
                if (!created)
                {
                    return;
                }

                bool showOnStart = false;
                string serverOverride = null;
                if (args != null)
                {
                    foreach (string arg in args)
                    {
                        if (string.Equals(arg, "--show", StringComparison.OrdinalIgnoreCase))
                        {
                            showOnStart = true;
                        }
                        else if (arg.StartsWith("--server=", StringComparison.OrdinalIgnoreCase))
                        {
                            serverOverride = arg.Substring("--server=".Length).Trim().TrimEnd('/');
                        }
                    }
                }

                try { SetProcessDPIAware(); } catch { }
                ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls11 | SecurityProtocolType.Tls;
                ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrayApp(showOnStart, serverOverride));
            }
        }
    }

    internal sealed class AppConfig
    {
        public string ServerUrl = "";
        public bool Pinned = false;

        private static string Dir
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "FocalboardCalendar"); }
        }

        private static string FilePath
        {
            get { return Path.Combine(Dir, "config.ini"); }
        }

        public static AppConfig Load()
        {
            AppConfig cfg = new AppConfig();
            try
            {
                if (File.Exists(FilePath))
                {
                    string[] lines = File.ReadAllLines(FilePath, Encoding.UTF8);
                    foreach (string raw in lines)
                    {
                        string line = raw.Trim();
                        if (line.Length == 0 || line.StartsWith("#") || line.StartsWith(";"))
                        {
                            continue;
                        }
                        int eq = line.IndexOf('=');
                        if (eq <= 0)
                        {
                            continue;
                        }
                        string key = line.Substring(0, eq).Trim().ToLowerInvariant();
                        string value = line.Substring(eq + 1).Trim();
                        if (key == "server")
                        {
                            cfg.ServerUrl = value;
                        }
                        else if (key == "pin")
                        {
                            cfg.Pinned = value == "1";
                        }
                    }
                }
            }
            catch { }
            return cfg;
        }

        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Dir);
                StringBuilder sb = new StringBuilder();
                sb.AppendLine("# Focalboard Calendar");
                sb.AppendLine("server=" + ServerUrl);
                sb.AppendLine("pin=" + (Pinned ? "1" : "0"));
                File.WriteAllText(FilePath, sb.ToString(), new UTF8Encoding(false));
            }
            catch { }
        }
    }

    internal sealed class TrayApp : ApplicationContext
    {
        private readonly NotifyIcon _tray;
        private readonly ContextMenuStrip _menu;
        private readonly ToolStripMenuItem _autoStartItem;
        private readonly ToolStripMenuItem _pinItem;
        private readonly AppConfig _config;
        private PopupForm _popup;
        private Icon _icon;

        public TrayApp(bool showOnStart, string serverOverride)
        {
            _config = AppConfig.Load();
            if (!string.IsNullOrEmpty(serverOverride))
            {
                _config.ServerUrl = serverOverride;
            }

            _icon = LoadIcon();
            _menu = new ContextMenuStrip();
            _menu.Items.Add("打开日历", null, OnOpenCalendar);
            _menu.Items.Add("打开完整界面（浏览器）", null, OnOpenBrowser);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add("服务器设置…", null, OnSettings);
            _autoStartItem = new ToolStripMenuItem("开机自动启动");
            _autoStartItem.CheckOnClick = false;
            _autoStartItem.Click += OnToggleAutoStart;
            _menu.Items.Add(_autoStartItem);
            _pinItem = new ToolStripMenuItem("弹窗固定（不自动隐藏）");
            _pinItem.Checked = _config.Pinned;
            _pinItem.Click += OnTogglePin;
            _menu.Items.Add(_pinItem);
            _menu.Items.Add("清除登录状态", null, OnClearLogin);
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add("退出", null, OnExit);

            _tray = new NotifyIcon();
            _tray.Icon = _icon;
            _tray.Text = "Focalboard 日历 — 单击打开";
            _tray.ContextMenuStrip = _menu;
            _tray.Visible = true;
            _tray.MouseClick += OnTrayClick;
            _tray.DoubleClick += OnOpenCalendar;

            RefreshAutoStartState();

            if (string.IsNullOrEmpty(_config.ServerUrl))
            {
                Timer firstRun = new Timer();
                firstRun.Interval = 400;
                firstRun.Tick += delegate
                {
                    firstRun.Stop();
                    firstRun.Dispose();
                    if (!ShowSettings(true))
                    {
                        _tray.Text = "Focalboard 日历 — 尚未设置服务器，右键 → 服务器设置";
                    }
                };
                firstRun.Start();
            }
            else if (showOnStart)
            {
                Timer starter = new Timer();
                starter.Interval = 500;
                starter.Tick += delegate
                {
                    starter.Stop();
                    starter.Dispose();
                    ShowPopup();
                };
                starter.Start();
            }
        }

        private void OnTogglePin(object sender, EventArgs e)
        {
            _config.Pinned = !_config.Pinned;
            _config.Save();
            _pinItem.Checked = _config.Pinned;
            if (_popup != null && !_popup.IsDisposed)
            {
                _popup.Pinned = _config.Pinned;
            }
        }

        private static Icon LoadIcon()
        {
            try
            {
                string path = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "focalboard.ico");
                if (File.Exists(path))
                {
                    return new Icon(path);
                }
            }
            catch { }
            return SystemIcons.Application;
        }

        private void OnTrayClick(object sender, MouseEventArgs e)
        {
            if (e.Button != MouseButtons.Left)
            {
                return;
            }
            TogglePopup();
        }

        private void TogglePopup()
        {
            if (_popup != null && _popup.Visible)
            {
                _popup.HidePopup();
                return;
            }
            // 点击托盘会先触发弹窗失焦隐藏，这里避免“关不掉/又弹回”的抖动
            if (_popup != null && (DateTime.UtcNow - _popup.HiddenAt).TotalMilliseconds < 300)
            {
                return;
            }
            ShowPopup();
        }

        private PopupForm EnsurePopup()
        {
            if (_popup == null || _popup.IsDisposed)
            {
                _popup = new PopupForm();
                _popup.SettingsRequested += delegate { ShowSettings(false); };
            }
            return _popup;
        }

        private void ShowPopup()
        {
            if (string.IsNullOrEmpty(_config.ServerUrl))
            {
                if (!ShowSettings(true))
                {
                    return;
                }
            }
            PopupForm popup = EnsurePopup();
            popup.Pinned = _config.Pinned;
            popup.ShowAtTray(_config.ServerUrl);
        }

        private void OnOpenCalendar(object sender, EventArgs e)
        {
            ShowPopup();
        }

        private void OnOpenBrowser(object sender, EventArgs e)
        {
            if (string.IsNullOrEmpty(_config.ServerUrl))
            {
                ShowSettings(true);
                return;
            }
            try { Process.Start(_config.ServerUrl); }
            catch (Exception ex) { MessageBox.Show("无法打开浏览器：" + ex.Message, "Focalboard 日历", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
        }

        private bool ShowSettings(bool allowCancel)
        {
            using (SettingsForm form = new SettingsForm(_config.ServerUrl, allowCancel))
            {
                if (form.ShowDialog() != DialogResult.OK)
                {
                    return false;
                }
                _config.ServerUrl = form.ServerUrl;
                _config.Save();
                if (_popup != null && !_popup.IsDisposed)
                {
                    _popup.SetServer(_config.ServerUrl);
                }
                return true;
            }
        }

        private void OnSettings(object sender, EventArgs e)
        {
            ShowSettings(false);
        }

        private void RefreshAutoStartState()
        {
            _autoStartItem.Checked = AutoStart.IsEnabled();
        }

        private void OnToggleAutoStart(object sender, EventArgs e)
        {
            try
            {
                AutoStart.SetEnabled(!AutoStart.IsEnabled());
            }
            catch (Exception ex)
            {
                MessageBox.Show("设置开机启动失败：" + ex.Message, "Focalboard 日历", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            RefreshAutoStartState();
        }

        private void OnClearLogin(object sender, EventArgs e)
        {
            if (MessageBox.Show("清除本机保存的登录状态和网页缓存？下次打开需要重新登录。\n（离线缓存会保留，清除后断网仍可查看上次同步的假勤记录。）", "Focalboard 日历",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
            {
                return;
            }
            if (_popup != null && !_popup.IsDisposed)
            {
                _popup.Close();
                _popup.Dispose();
                _popup = null;
            }
            WebViewStore.Clear();
            MessageBox.Show("已清除登录状态。", "Focalboard 日历", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void OnExit(object sender, EventArgs e)
        {
            if (_popup != null && !_popup.IsDisposed)
            {
                _popup.Close();
                _popup.Dispose();
                _popup = null;
            }
            _tray.Visible = false;
            _tray.Dispose();
            ExitThread();
        }
    }

    internal static class WebViewStore
    {
        public static string UserDataFolder
        {
            get
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FocalboardCalendar", "WebView2");
            }
        }

        public static void Clear()
        {
            try
            {
                if (Directory.Exists(UserDataFolder))
                {
                    Directory.Delete(UserDataFolder, true);
                }
            }
            catch
            {
                try
                {
                    foreach (string dir in Directory.GetDirectories(UserDataFolder))
                    {
                        try { Directory.Delete(dir, true); } catch { }
                    }
                }
                catch { }
            }
        }
    }

    internal static class AutoStart
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "FocalboardCalendar";

        public static bool IsEnabled()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RunKey, false))
                {
                    return key != null && key.GetValue(ValueName) != null;
                }
            }
            catch { return false; }
        }

        public static void SetEnabled(bool enabled)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (key == null)
                {
                    return;
                }
                if (enabled)
                {
                    key.SetValue(ValueName, "\"" + Application.ExecutablePath + "\" --tray");
                }
                else
                {
                    key.DeleteValue(ValueName, false);
                }
            }
        }
    }

    // 离线缓存：按服务器分目录，保存接口原始 JSON，断网时由本地页面直接渲染。
    internal static class LeaveCache
    {
        private static string Root
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FocalboardCalendar", "cache"); }
        }

        public static string DirFor(string server)
        {
            StringBuilder sb = new StringBuilder();
            foreach (char c in server)
            {
                if (char.IsLetterOrDigit(c) || c == '-' || c == '.')
                {
                    sb.Append(c);
                }
                else
                {
                    sb.Append('_');
                }
            }
            return Path.Combine(Root, sb.ToString());
        }

        public static string Read(string dir, string file, string fallback)
        {
            try
            {
                string path = Path.Combine(dir, file);
                if (File.Exists(path))
                {
                    return File.ReadAllText(path, Encoding.UTF8);
                }
            }
            catch { }
            return fallback;
        }

        public static void Write(string dir, string file, string content)
        {
            Directory.CreateDirectory(dir);
            File.WriteAllText(Path.Combine(dir, file), content, new UTF8Encoding(false));
        }

        public static bool HasData(string server)
        {
            return File.Exists(Path.Combine(DirFor(server), "summary.json"));
        }
    }

    internal static class LeaveSync
    {
        public static bool Probe(string url)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
                request.Method = "GET";
                request.Timeout = 6000;
                request.ReadWriteTimeout = 6000;
                request.KeepAlive = false;
                request.UserAgent = "FocalboardCalendar/1.0";
                request.Headers["X-Requested-With"] = "XMLHttpRequest";
                try
                {
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        return response.StatusCode == HttpStatusCode.OK;
                    }
                }
                catch (WebException ex)
                {
                    return ex.Response != null;
                }
            }
            catch
            {
                return false;
            }
        }

        public static bool Save(string server, Dictionary<string, string> data)
        {
            string summary;
            if (!data.TryGetValue("summary", out summary) || string.IsNullOrEmpty(summary))
            {
                return false;
            }
            string dir = LeaveCache.DirFor(server);
            LeaveCache.Write(dir, "summary.json", summary);

            string calendar;
            if (data.TryGetValue("calendar", out calendar) && !string.IsNullOrEmpty(calendar))
            {
                LeaveCache.Write(dir, "calendar.json", calendar);
            }
            string me;
            if (data.TryGetValue("me", out me) && !string.IsNullOrEmpty(me))
            {
                LeaveCache.Write(dir, "me.json", me);
            }
            int year = DateTime.Now.Year;
            for (int y = year - 1; y <= year + 1; y++)
            {
                string lunar;
                if (data.TryGetValue("lunar" + y, out lunar) && !string.IsNullOrEmpty(lunar))
                {
                    LeaveCache.Write(dir, "lunar-" + y + ".json", lunar);
                }
            }
            LeaveCache.Write(dir, "meta.ini",
                "syncedAt=" + DateTime.Now.ToString("yyyy-MM-dd HH:mm") + Environment.NewLine +
                "server=" + server + Environment.NewLine);
            return true;
        }
    }

    internal static class OfflinePage
    {
        public static string Build(string server, string error)
        {
            string dir = LeaveCache.DirFor(server);
            string summary = LeaveCache.Read(dir, "summary.json", "null");
            string calendar = LeaveCache.Read(dir, "calendar.json", "{\"days\":[]}");
            string me = LeaveCache.Read(dir, "me.json", "null");
            string meta = LeaveCache.Read(dir, "meta.ini", "");
            string syncedAt = "";
            foreach (string line in meta.Split('\n'))
            {
                string trimmed = line.Trim();
                if (trimmed.StartsWith("syncedAt="))
                {
                    syncedAt = trimmed.Substring(9);
                }
            }

            StringBuilder lunar = new StringBuilder("{");
            int year = DateTime.Now.Year;
            bool first = true;
            for (int y = year - 2; y <= year + 2; y++)
            {
                string path = Path.Combine(dir, "lunar-" + y + ".json");
                if (!File.Exists(path))
                {
                    continue;
                }
                string raw;
                try { raw = File.ReadAllText(path, Encoding.UTF8); }
                catch { continue; }
                if (!first)
                {
                    lunar.Append(',');
                }
                first = false;
                lunar.Append('"').Append(y).Append("\":").Append(SafeJson(raw));
            }
            lunar.Append('}');

            string template = Template;
            template = template.Replace("__SERVER__", Escape(server));
            template = template.Replace("__ERROR__", Escape(error == null ? "" : error));
            template = template.Replace("__SYNCED__", Escape(syncedAt.Length == 0 ? "从未同步" : syncedAt));
            template = template.Replace("__SUMMARY__", SafeJson(summary));
            template = template.Replace("__CALENDAR__", SafeJson(calendar));
            template = template.Replace("__ME__", SafeJson(me));
            template = template.Replace("__LUNAR__", lunar.ToString());
            return template;
        }

        private static string Escape(string text)
        {
            if (text == null)
            {
                return "";
            }
            return text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");
        }

        private static string SafeJson(string raw)
        {
            if (string.IsNullOrEmpty(raw))
            {
                return "null";
            }
            return raw.Replace("</", "<\\/").Replace("\u2028", "\\u2028").Replace("\u2029", "\\u2029");
        }

        private const string Template = @"<!doctype html>
<html lang='zh-CN'>
<head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width, initial-scale=1'>
<title>Focalboard 日历（离线）</title>
<style>
:root{--bg:#ffffff;--fg:#1b1d22;--muted:#7a8089;--line:rgba(0,0,0,.12);--soft:rgba(0,0,0,.05);--accent:#1e325c;}
*{box-sizing:border-box;}
html,body{margin:0;height:100%;}
body{background:var(--bg);color:var(--fg);font:13px/1.5 'Microsoft YaHei UI','Segoe UI',sans-serif;overflow-x:hidden;user-select:none;}
.wrap{padding:10px 10px 26px;}
.offlineBar{display:flex;align-items:center;gap:8px;background:#fff4e6;border:1px solid #ffd8a8;color:#8a4b08;border-radius:6px;padding:6px 8px;margin-bottom:8px;font-size:12px;}
.offlineBar b{font-weight:600;}
.offlineBar .spacer{flex:1 1 auto;}
.offlineBar button,.tiny{border:1px solid var(--line);background:#fff;color:var(--fg);border-radius:5px;padding:2px 8px;cursor:pointer;font-size:12px;}
.head{display:flex;align-items:center;gap:4px;margin-bottom:4px;}
.head button{border:none;background:transparent;color:var(--fg);cursor:pointer;font-size:14px;padding:3px 6px;border-radius:4px;}
.head button:hover{background:var(--soft);}
.title{flex:1 1 auto;text-align:center;font-weight:600;font-size:15px;}
.balances{display:flex;flex-wrap:wrap;gap:4px 14px;padding:2px 0 8px;font-size:12px;color:var(--fg);}
.balances b{font-size:13px;}
.balances .hint{font-size:11px;color:var(--muted);}
.balances .voided{color:var(--muted);text-decoration:line-through;}
.week{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;color:var(--muted);font-size:11px;padding:4px 0;}
.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:6px;overflow:hidden;}
.cell{background:var(--bg);min-height:56px;padding:3px 3px 2px;position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;}
.cell.out{background:#fafafa;color:#b0b4ba;}
.cell.weekend:not(.rest):not(.work){color:#c92a2a;}
.cell.today{box-shadow:inset 0 0 0 2px var(--accent);}
.cell.rest{background:#fff0f0;}
.cell.work{background:#eef7ff;}
.num{font-size:13px;font-weight:600;line-height:1.2;}
.lunar{font-size:10px;color:var(--muted);line-height:1.2;min-height:12px;}
.lunar.term{color:#868e96;font-weight:600;}
.badge{position:absolute;right:2px;top:2px;font-size:9px;padding:0 2px;border-radius:3px;}
.badge.off{background:#ffc9c9;color:#a61e1e;}
.badge.on{background:#b9e4ff;color:#0b5c8a;}
.mark{font-size:9px;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ledger{margin-top:10px;border-top:1px solid var(--line);padding-top:8px;}
.ledger h3{margin:0 0 6px;font-size:13px;font-weight:600;}
.ledger .row{display:flex;align-items:baseline;gap:8px;padding:4px 2px;border-bottom:1px dashed var(--soft);font-size:12px;}
.ledger .row .date{color:var(--muted);width:74px;flex:none;}
.ledger .row .label{flex:none;}
.ledger .row .days{margin-left:auto;font-weight:600;}
.ledger .row .note{color:var(--muted);max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ledger .row.voided{color:var(--muted);text-decoration:line-through;}
.ledger .empty{color:var(--muted);padding:6px 2px;}
details.all{margin-top:8px;}
details.all summary{cursor:pointer;color:var(--muted);font-size:12px;padding:4px 0;}
.foot{margin-top:12px;color:var(--muted);font-size:11px;line-height:1.6;}
</style>
</head>
<body>
<div class='wrap'>
  <div class='offlineBar'>
    <b>离线模式</b>
    <span id='status'>显示本机缓存，联网后自动同步</span>
    <span class='spacer'></span>
    <button onclick='retry()'>重试连接</button>
  </div>
  <div class='head'>
    <button onclick='step(-1,0)' title='上一年'>«</button>
    <button onclick='step(0,-1)' title='上一月'>‹</button>
    <span class='title' id='monthTitle'></span>
    <button onclick='step(0,1)' title='下一月'>›</button>
    <button onclick='step(1,0)' title='下一年'>»</button>
    <button onclick='goToday()' class='tiny'>今天</button>
  </div>
  <div class='balances' id='balances'></div>
  <div class='week' id='week'></div>
  <div class='grid' id='grid'></div>
  <div class='ledger'>
    <h3 id='ledgerTitle'>本月流水</h3>
    <div id='ledger'></div>
    <details class='all'><summary>全部流水</summary><div id='ledgerAll'></div></details>
  </div>
  <div class='foot'>
    服务器：__SERVER__<br>
    缓存用户：<span id='who'>-</span> · 最后同步：__SYNCED__<br>
    离线只读，记一笔 / 删除 / 设置请在联网后回到在线界面操作。
  </div>
</div>
<script>
var SUMMARY = __SUMMARY__;
var CALENDAR = __CALENDAR__;
var ME = __ME__;
var LUNAR = __LUNAR__;
var WEEK = ['一','二','三','四','五','六','日'];
var today = new Date();
var viewYear = today.getFullYear();
var viewMonth = today.getMonth() + 1;

function pad(n){ return (n < 10 ? '0' : '') + n; }
function key(y,m,d){ return y + '-' + pad(m) + '-' + pad(d); }
function daysInMonth(y,m){ return new Date(y, m, 0).getDate(); }
function firstOffset(y,m){ return (new Date(y, m - 1, 1).getDay() + 6) % 7; }
function colors(){ return (SUMMARY && SUMMARY.settings && SUMMARY.settings.colors) || {}; }
function color(k){ var d = {overtime:'#d9480f',compLeave:'#2f9e44',annualLeave:'#1971c2',term:'#868e96'}; return colors()[k] || d[k] || '#666'; }
function balance(kind){ if(!SUMMARY || !SUMMARY.balances){ return null; } for(var i=0;i<SUMMARY.balances.length;i++){ if(SUMMARY.balances[i].kind===kind){ return SUMMARY.balances[i]; } } return null; }
function marks(){ var map = {}; if(!SUMMARY || !SUMMARY.records){ return map; } SUMMARY.records.forEach(function(r){ if(r.action==='void'){ return; } (map[r.date] = map[r.date] || []).push(r); }); return map; }
function label(r){
  var half = (r.days % 1 !== 0) ? '½' : '';
  if(r.kind==='comp' && r.action==='add'){ return {text:'加班'+half, color:'overtime'}; }
  if(r.kind==='comp' && r.action==='use'){ return {text:'调休假'+half, color:'compLeave'}; }
  if(r.kind==='annual' && r.action==='use'){ return {text:'年假'+half, color:'annualLeave'}; }
  if(r.kind==='annual' && r.action==='grant'){ return {text:'年假+'+r.days, color:'annualLeave'}; }
  return {text:'', color:'term'};
}
function holidayMap(){
  var map = {};
  if(CALENDAR && CALENDAR.days){ CALENDAR.days.forEach(function(d){ map[d.date] = d; }); }
  return map;
}
function lunarMap(){
  var list = (LUNAR[String(viewYear)] || {}).days || [];
  var map = {};
  list.forEach(function(d){ map[d.date] = d; });
  return map;
}
function actionText(a){
  return {grant:'年假发放', add:'加班 +', use:'消耗 -', 'void':'到期作废'}[a] || a;
}
function renderBalances(){
  var a = balance('annual'), c = balance('comp');
  var html = '';
  html += '<span>年假 剩 <b style=\'color:' + color('annualLeave') + '\'>' + (a ? a.available : '-') + '</b> 天';
  if(a && a.expireWorkdays !== undefined){ html += '<span class=\'hint\'>（距清零 ' + a.expireWorkdays + ' 个工作日）</span>'; }
  html += '</span>';
  html += '<span>调休 剩 <b style=\'color:' + color('overtime') + '\'>' + (c ? c.available : '-') + '</b> 天';
  if(c && c.expireWorkdays !== undefined){ html += '<span class=\'hint\'>（距清零 ' + c.expireWorkdays + ' 个工作日）</span>'; }
  html += '</span>';
  if(a && a.expired){ html += '<span class=\'voided\'>年假作废 ' + a.expired + '</span>'; }
  if(c && c.expired){ html += '<span class=\'voided\'>调休作废 ' + c.expired + '</span>'; }
  if(!SUMMARY){ html = '<span>本机还没有缓存过假勤数据，请联网登录一次。</span>'; }
  document.getElementById('balances').innerHTML = html;
}
function renderGrid(){
  document.getElementById('monthTitle').textContent = viewYear + ' 年 ' + viewMonth + ' 月';
  var m = marks(), hol = holidayMap(), lun = lunarMap();
  var offset = firstOffset(viewYear, viewMonth);
  var total = daysInMonth(viewYear, viewMonth);
  var prevTotal = daysInMonth(viewYear, viewMonth === 1 ? 12 : viewMonth - 1);
  var cells = [];
  for(var i = offset - 1; i >= 0; i--){
    var pm = viewMonth === 1 ? 12 : viewMonth - 1;
    var py = viewMonth === 1 ? viewYear - 1 : viewYear;
    cells.push({y:py,m:pm,d:prevTotal - i,out:true});
  }
  for(var d = 1; d <= total; d++){ cells.push({y:viewYear,m:viewMonth,d:d,out:false}); }
  while(cells.length % 7 !== 0 || cells.length < 42){
    var last = cells[cells.length - 1];
    var ny = last.y, nm = last.m, nd = last.d + 1;
    if(nd > daysInMonth(ny,nm)){ nd = 1; nm += 1; if(nm > 12){ nm = 1; ny += 1; } }
    cells.push({y:ny,m:nm,d:nd,out:last.out});
  }
  var html = '';
  cells.forEach(function(c){
    var k = key(c.y,c.m,c.d);
    var info = lun[k], h = hol[k], ds = m[k] || [];
    var wd = (new Date(c.y, c.m - 1, c.d).getDay() + 6) % 7;
    var cls = 'cell' + (c.out ? ' out' : '');
    if(c.y === today.getFullYear() && c.m === today.getMonth() + 1 && c.d === today.getDate()){ cls += ' today'; }
    if(h){ cls += h.offDay ? ' rest' : ' work'; }
    else if(wd >= 5){ cls += ' weekend'; }
    html += '<div class=\'' + cls + '\' title=\'' + (h ? (h.name + (h.offDay ? ' 休' : ' 班')) : '') + '\'>';
    html += '<span class=\'num\'>' + c.d + '</span>';
    var lunarText = info ? (info.term || info.lunar) : '';
    html += '<span class=\'lunar' + (info && info.term ? ' term' : '') + '\'>' + lunarText + '</span>';
    if(h){ html += '<span class=\'badge ' + (h.offDay ? 'off' : 'on') + '\'>' + (h.offDay ? '休' : '班') + '</span>'; }
    ds.forEach(function(r){
      var l = label(r);
      if(l.text){ html += '<span class=\'mark\' style=\'color:' + color(l.color) + '\' title=\'' + (r.note || '') + '\'>' + l.text + '</span>'; }
    });
    html += '</div>';
  });
  document.getElementById('grid').innerHTML = html;
}
function renderLedger(){
  if(!SUMMARY || !SUMMARY.records){ document.getElementById('ledger').innerHTML = '<div class=\'empty\'>暂无记录</div>'; document.getElementById('ledgerAll').innerHTML = ''; return; }
  var prefix = viewYear + '-' + pad(viewMonth);
  function rows(list){
    if(!list.length){ return '<div class=\'empty\'>暂无记录</div>'; }
    var html = '';
    list.slice().sort(function(a,b){ return a.date < b.date ? 1 : -1; }).forEach(function(r){
      var cls = 'row' + (r.action === 'void' ? ' voided' : '');
      html += '<div class=\'' + cls + '\'>';
      html += '<span class=\'date\'>' + r.date + '</span>';
      html += '<span class=\'label\'>' + actionText(r.action) + (r.action === 'use' ? (r.kind === 'annual' ? '（年假）' : '（调休）') : '') + '</span>';
      html += '<span class=\'days\'>' + (r.action === 'use' || r.action === 'void' ? '-' : '+') + r.days + '</span>';
      if(r.expires && r.action !== 'use'){ html += '<span class=\'note\'>至 ' + r.expires + '</span>'; }
      if(r.note){ html += '<span class=\'note\'>' + r.note + '</span>'; }
      html += '</div>';
    });
    return html;
  }
  var monthRecords = SUMMARY.records.filter(function(r){ return (r.date || '').indexOf(prefix) === 0; });
  document.getElementById('ledgerTitle').textContent = viewYear + ' 年 ' + viewMonth + ' 月流水';
  document.getElementById('ledger').innerHTML = rows(monthRecords);
  document.getElementById('ledgerAll').innerHTML = rows(SUMMARY.records);
}
function render(){
  renderBalances();
  renderGrid();
  renderLedger();
}
function step(dy, dm){
  viewYear += dy;
  viewMonth += dm;
  if(viewMonth > 12){ viewMonth = 1; viewYear += 1; }
  if(viewMonth < 1){ viewMonth = 12; viewYear -= 1; }
  render();
}
function goToday(){
  viewYear = today.getFullYear();
  viewMonth = today.getMonth() + 1;
  render();
}
function retry(){
  document.getElementById('status').textContent = '正在尝试连接服务器…';
  try { window.chrome.webview.postMessage('retry'); } catch(e) { document.getElementById('status').textContent = '无法连接服务器'; }
}
window.__offlineStatus = function(text){ document.getElementById('status').textContent = text; };
document.getElementById('week').innerHTML = WEEK.map(function(w){ return '<span>' + w + '</span>'; }).join('');
if(ME){ document.getElementById('who').textContent = ME.username || ME.email || '-'; }
render();
</script>
</body>
</html>";
    }

    internal sealed class SettingsForm : Form
    {
        private readonly TextBox _serverBox;

        public string ServerUrl;

        public SettingsForm(string current, bool allowCancel)
        {
            Text = "服务器设置";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowInTaskbar = true;
            ClientSize = new Size(430, 150);
            Font = new Font("Microsoft YaHei UI", 9f);

            Label label = new Label();
            label.Text = "Focalboard 服务器地址（含端口）";
            label.SetBounds(16, 14, 380, 20);
            Controls.Add(label);

            _serverBox = new TextBox();
            _serverBox.Text = current == null ? "" : current;
            _serverBox.SetBounds(16, 38, 398, 24);
            Controls.Add(_serverBox);

            Label hint = new Label();
            hint.Text = "例如 http://192.168.1.100:8088  或  http://127.0.0.1:8088\n登录在弹窗内完成，本程序不保存账号密码；联网后自动缓存假勤数据供离线查看。";
            hint.ForeColor = Color.Gray;
            hint.SetBounds(16, 66, 398, 42);
            Controls.Add(hint);

            Button ok = new Button();
            ok.Text = "保存";
            ok.SetBounds(246, 112, 80, 26);
            ok.Click += OnOk;
            Controls.Add(ok);

            Button cancel = new Button();
            cancel.Text = allowCancel ? "取消" : "关闭";
            cancel.SetBounds(334, 112, 80, 26);
            cancel.DialogResult = allowCancel ? DialogResult.Cancel : DialogResult.Abort;
            Controls.Add(cancel);

            if (!allowCancel)
            {
                CancelButton = null;
            }
            else
            {
                CancelButton = cancel;
            }
            AcceptButton = ok;
        }

        private void OnOk(object sender, EventArgs e)
        {
            string text = (_serverBox.Text == null ? "" : _serverBox.Text).Trim();
            if (text.Length == 0)
            {
                MessageBox.Show("请填写服务器地址。", "服务器设置", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (!text.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !text.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                text = "http://" + text;
            }
            Uri uri;
            if (!Uri.TryCreate(text, UriKind.Absolute, out uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                MessageBox.Show("地址格式不正确，请填写类似 http://192.168.1.100:8088 的地址。", "服务器设置", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            ServerUrl = text.TrimEnd('/');
            DialogResult = DialogResult.OK;
            Close();
        }
    }

    internal sealed class PopupForm : Form
    {
        private const int HeaderHeight = 36;
        private const int CornerRadius = 10;

        private enum Mode
        {
            Loading,
            Online,
            Offline
        }

        private readonly WebView2 _web;
        private readonly Panel _header;
        private readonly Panel _border;
        private readonly Label _title;
        private readonly Button _refresh;
        private readonly Button _settings;
        private readonly Button _close;
        private readonly Timer _timer;
        private string _server;
        private bool _initialized;
        private bool _webAvailable;
        private Mode _mode = Mode.Loading;
        private DateTime _lastLoad = DateTime.MinValue;
        private DateTime _lastSync = DateTime.MinValue;
        private DateTime _lastProbe = DateTime.MinValue;
        private DateTime _hiddenAt = DateTime.MinValue;
        private bool _suppressHide;
        private bool _syncing;
        private bool _probePending;

        public event EventHandler SettingsRequested;

        public bool Pinned;

        public DateTime HiddenAt { get { return _hiddenAt; } }

        public PopupForm()
        {
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            StartPosition = FormStartPosition.Manual;
            BackColor = Color.FromArgb(30, 50, 92);
            AutoScaleMode = AutoScaleMode.None;
            KeyPreview = true;
            DoubleBuffered = true;
            Padding = new Padding(1);

            Size size = ScaledSize(380, 680);
            Size = size;
            MinimumSize = size;

            Panel header = new Panel();
            _header = header;
            header.Dock = DockStyle.None;
            header.Height = HeaderHeight;
            header.BackColor = Color.FromArgb(30, 50, 92);

            _title = new Label();
            _title.Text = "Focalboard 日历";
            _title.ForeColor = Color.White;
            _title.Font = new Font("Microsoft YaHei UI", 9.5f, FontStyle.Bold);
            _title.AutoSize = false;
            _title.TextAlign = ContentAlignment.MiddleLeft;
            _title.SetBounds(12, 0, 230, HeaderHeight);
            header.Controls.Add(_title);

            _refresh = MakeHeaderButton("⟳", "刷新");
            _refresh.Click += delegate { Reload(); };
            header.Controls.Add(_refresh);

            _settings = MakeHeaderButton("⚙", "服务器设置");
            _settings.Click += delegate
            {
                EventHandler handler = SettingsRequested;
                if (handler != null)
                {
                    HidePopup();
                    handler(this, EventArgs.Empty);
                }
            };
            header.Controls.Add(_settings);

            _close = MakeHeaderButton("✕", "关闭");
            _close.Click += delegate { HidePopup(); };
            header.Controls.Add(_close);

            header.Resize += delegate
            {
                _refresh.Left = header.Width - 108;
                _settings.Left = header.Width - 74;
                _close.Left = header.Width - 40;
            };

            Panel border = new Panel();
            _border = border;
            border.Dock = DockStyle.None;
            border.BackColor = Color.FromArgb(214, 220, 232);
            border.Padding = new Padding(1);
            Controls.Add(border);

            _web = new WebView2();
            _web.Dock = DockStyle.Fill;
            _web.DefaultBackgroundColor = Color.White;
            border.Controls.Add(_web);

            Controls.Add(header);
            LayoutContent();

            _timer = new Timer();
            _timer.Interval = 15000;
            _timer.Tick += OnTimerTick;

            KeyDown += delegate(object sender, KeyEventArgs e)
            {
                if (e.KeyCode == Keys.Escape)
                {
                    HidePopup();
                }
            };
        }

        private Button MakeHeaderButton(string glyph, string tooltip)
        {
            Button button = new Button();
            button.Text = glyph;
            button.Font = new Font("Segoe UI Symbol", 11f);
            button.FlatStyle = FlatStyle.Flat;
            button.FlatAppearance.BorderSize = 0;
            button.ForeColor = Color.White;
            button.BackColor = Color.Transparent;
            button.TabStop = false;
            button.Cursor = Cursors.Hand;
            ToolTip tip = new ToolTip();
            tip.SetToolTip(button, tooltip);
            return button;
        }

        private static Size ScaledSize(int width, int height)
        {
            using (Graphics g = Graphics.FromHwnd(IntPtr.Zero))
            {
                float scale = g.DpiX / 96f;
                if (scale < 1f)
                {
                    scale = 1f;
                }
                return new Size((int)(width * scale), (int)(height * scale));
            }
        }

        private void LayoutContent()
        {
            if (_header == null || _border == null)
            {
                return;
            }
            int width = Math.Max(0, ClientSize.Width - 2);
            _header.SetBounds(1, 1, width, HeaderHeight);
            _border.SetBounds(1, 1 + HeaderHeight, width, Math.Max(0, ClientSize.Height - HeaderHeight - 2));
        }

        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            LayoutContent();
            try
            {
                using (GraphicsPath path = RoundedRect(new Rectangle(0, 0, Width, Height), CornerRadius))
                {
                    Region = new Region(path);
                }
            }
            catch { }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using (Pen pen = new Pen(Color.FromArgb(30, 50, 92), 1))
            {
                e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
            }
        }

        private static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int d = radius * 2;
            GraphicsPath path = new GraphicsPath();
            if (d <= 0)
            {
                path.AddRectangle(bounds);
                return path;
            }
            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        public void SetServer(string server)
        {
            _server = server;
            if (_initialized)
            {
                _mode = Mode.Loading;
                Navigate();
            }
        }

        public void ShowAtTray(string server)
        {
            _server = server;
            PositionAtTray();
            if (!Visible)
            {
                _suppressHide = true;
                Show();
                _suppressHide = false;
            }
            Activate();
            if (!_initialized)
            {
                InitializeWebView();
            }
            else
            {
                try { _web.ExecuteScriptAsync("window.__fbCalOpened=false"); } catch { }
                if (_mode == Mode.Offline)
                {
                    ProbeAsync(true);
                }
                else if ((DateTime.UtcNow - _lastLoad).TotalMinutes >= 2)
                {
                    Reload();
                }
            }
            _timer.Start();
            _web.Focus();
        }

        public void HidePopup()
        {
            if (Visible)
            {
                Hide();
            }
        }

        private void PositionAtTray()
        {
            Rectangle area;
            try
            {
                area = Screen.FromPoint(Cursor.Position).WorkingArea;
            }
            catch
            {
                area = Screen.PrimaryScreen.WorkingArea;
            }
            if (Height > area.Height)
            {
                Height = area.Height;
            }
            if (Width > area.Width)
            {
                Width = area.Width;
            }
            int margin = 8;
            Left = Math.Max(area.Left, area.Right - Width - margin);
            Top = Math.Max(area.Top, area.Bottom - Height - margin);
            Log("position area=" + area + " size=" + Size + " at=" + Left + "," + Top);
        }

        private async void InitializeWebView()
        {
            try
            {
                Log("init start");
                Cursor previous = Cursor;
                Cursor = Cursors.WaitCursor;
                Directory.CreateDirectory(WebViewStore.UserDataFolder);
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, WebViewStore.UserDataFolder, null);
                Log("env ok");
                await _web.EnsureCoreWebView2Async(env);
                Log("core ok");
                CoreWebView2 core = _web.CoreWebView2;

                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsZoomControlEnabled = true;
                core.Settings.IsPasswordAutosaveEnabled = true;
                core.Settings.IsGeneralAutofillEnabled = true;

                await core.AddScriptToExecuteOnDocumentCreatedAsync(CalendarScript);
                core.NavigationCompleted += OnNavigationCompleted;
                core.NewWindowRequested += OnNewWindowRequested;
                core.WebMessageReceived += OnWebMessageReceived;
                core.ProcessFailed += delegate(object s, CoreWebView2ProcessFailedEventArgs e)
                {
                    if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited)
                    {
                        BeginInvoke((MethodInvoker)delegate
                        {
                            _initialized = false;
                            _webAvailable = false;
                            InitializeWebView();
                        });
                    }
                };

                _webAvailable = true;
                _initialized = true;
                Cursor = previous;
                Navigate();
            }
            catch (Exception ex)
            {
                Cursor = Cursors.Default;
                _webAvailable = false;
                Log("init failed " + ex);
                MessageBox.Show(
                    "无法启动内嵌浏览器（WebView2）。\r\n请先安装 Microsoft Edge WebView2 Runtime 后重试。\r\n\r\n" + ex.Message,
                    "Focalboard 日历",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private static void Log(string message)
        {
            try
            {
                string dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FocalboardCalendar");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "app.log"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + message + Environment.NewLine, Encoding.UTF8);
            }
            catch { }
        }

        private void Navigate()
        {
            if (!_initialized || string.IsNullOrEmpty(_server))
            {
                return;
            }
            try
            {
                _mode = Mode.Loading;
                Log("navigate " + _server);
                _web.Source = new Uri(_server);
                _lastLoad = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                Log("navigate failed " + ex.Message);
            }
        }

        private void Reload()
        {
            if (!_initialized)
            {
                InitializeWebView();
                return;
            }
            try
            {
                if (_mode == Mode.Offline)
                {
                    ProbeAsync(true);
                    return;
                }
                _lastLoad = DateTime.UtcNow;
                _web.CoreWebView2.Reload();
            }
            catch { }
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (_mode == Mode.Offline)
            {
                return;
            }
            if (!e.IsSuccess)
            {
                Log("nav failed: " + e.WebErrorStatus);
                GoOffline("无法连接服务器");
                return;
            }
            Log("nav ok " + e.NavigationId);
            _mode = Mode.Online;
            _title.Text = "Focalboard 日历";
            try { _web.ExecuteScriptAsync(CalendarScript); } catch { }
            ScheduleSync(1200);
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            try { Process.Start(e.Uri); } catch { }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string message;
            try { message = e.TryGetWebMessageAsString(); }
            catch { return; }
            if (message == "retry")
            {
                ProbeAsync(true);
            }
        }

        private void OnTimerTick(object sender, EventArgs e)
        {
            if (!Visible || !_webAvailable)
            {
                return;
            }
            if (_mode == Mode.Offline)
            {
                if ((DateTime.UtcNow - _lastProbe).TotalSeconds >= 15)
                {
                    ProbeAsync(false);
                }
                return;
            }
            if (_mode == Mode.Online && (DateTime.UtcNow - _lastSync).TotalMinutes >= 5)
            {
                ScheduleSync(0);
            }
        }

        private async Task<Dictionary<string, string>> FetchBundleAsync()
        {
            string baseUrl = "\"" + _server.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
            string script =
                "(function(){" +
                "window.__fbSyncResult=null;" +
                "(async function(){" +
                "var h={'X-Requested-With':'XMLHttpRequest'};" +
                "var t=localStorage.getItem('focalboardSessionId');" +
                "if(t){h['Authorization']='Bearer '+t;}" +
                "var base=" + baseUrl + ";" +
                "var out={};" +
                "var list={summary:'/api/v2/leaves/summary',calendar:'/api/v2/top-bar/calendar',me:'/api/v2/users/me'};" +
                "var y=new Date().getFullYear();" +
                "for(var i=-1;i<=1;i++){list['lunar'+(y+i)]='/api/v2/top-bar/lunar?year='+(y+i);}" +
                "for(var k in list){" +
                " try{var r=await fetch(base+list[k],{headers:h,credentials:'include'});" +
                "  if(r.ok){out[k]=await r.text();}else if(k==='summary'){out.__status=String(r.status);}}" +
                " catch(e){if(k==='summary'){out.__error=String(e);}}" +
                "}" +
                "window.__fbSyncResult=out;" +
                "})().catch(function(e){window.__fbSyncResult={__error:String(e)};});" +
                "return 'started';" +
                "})()";
            try
            {
                await _web.ExecuteScriptAsync(script);
                string raw = null;
                for (int i = 0; i < 40; i++)
                {
                    await Task.Delay(250);
                    string value = await _web.ExecuteScriptAsync("window.__fbSyncResult?JSON.stringify(window.__fbSyncResult):''");
                    if (string.IsNullOrEmpty(value) || value == "\"\"")
                    {
                        continue;
                    }
                    JavaScriptSerializer serializer = new JavaScriptSerializer();
                    raw = serializer.Deserialize<string>(value);
                    if (!string.IsNullOrEmpty(raw))
                    {
                        break;
                    }
                }
                if (string.IsNullOrEmpty(raw))
                {
                    Log("fetch timeout");
                    return null;
                }
                JavaScriptSerializer deserializer = new JavaScriptSerializer();
                Dictionary<string, object> data = deserializer.Deserialize<Dictionary<string, object>>(raw);
                Dictionary<string, string> result = new Dictionary<string, string>();
                if (data != null)
                {
                    foreach (KeyValuePair<string, object> pair in data)
                    {
                        if (pair.Value != null)
                        {
                            result[pair.Key] = Convert.ToString(pair.Value);
                        }
                    }
                }
                return result;
            }
            catch (Exception ex)
            {
                Log("fetch failed " + ex.Message);
                return null;
            }
        }

        private void ScheduleSync(int delayMs)
        {
            if (delayMs <= 0)
            {
                SyncNowAsync();
                return;
            }
            Timer delay = new Timer();
            delay.Interval = delayMs;
            delay.Tick += delegate
            {
                delay.Stop();
                delay.Dispose();
                SyncNowAsync();
            };
            delay.Start();
        }

        private async void SyncNowAsync()
        {
            if (_syncing || !_webAvailable || _mode != Mode.Online)
            {
                return;
            }
            _syncing = true;
            try
            {
                Dictionary<string, string> data = await FetchBundleAsync();
                if (data == null)
                {
                    return;
                }
                string status, error;
                if (data.TryGetValue("__status", out status))
                {
                    Log("sync not logged in status=" + status);
                    return;
                }
                if (data.TryGetValue("__error", out error))
                {
                    Log("sync error " + error);
                    return;
                }
                bool saved = LeaveSync.Save(_server, data);
                if (saved)
                {
                    _lastSync = DateTime.UtcNow;
                }
                Log("sync saved=" + saved);
            }
            finally
            {
                _syncing = false;
            }
        }

        private async void ProbeAsync(bool fromUser)
        {
            if (_probePending || !_webAvailable)
            {
                return;
            }
            string server = _server;
            _probePending = true;
            if (fromUser)
            {
                UpdateOfflineStatus("正在尝试连接服务器…");
            }
            bool online = await Task.Run(delegate
            {
                return LeaveSync.Probe(server + "/api/v2/leaves/summary");
            });
            _probePending = false;
            _lastProbe = DateTime.UtcNow;
            if (online)
            {
                _mode = Mode.Loading;
                _title.Text = "Focalboard 日历";
                Navigate();
                ScheduleSync(1500);
            }
            else
            {
                if (_mode != Mode.Offline)
                {
                    GoOffline("无法连接服务器");
                }
                else if (fromUser)
                {
                    UpdateOfflineStatus("仍未连接：服务器无响应");
                }
            }
        }

        private void UpdateOfflineStatus(string text)
        {
            if (_mode != Mode.Offline)
            {
                return;
            }
            try
            {
                string encoded = text.Replace("\\", "\\\\").Replace("'", "\\'");
                _web.ExecuteScriptAsync("window.__offlineStatus && window.__offlineStatus('" + encoded + "')");
            }
            catch { }
        }

        private void GoOffline(string reason)
        {
            if (!_webAvailable)
            {
                return;
            }
            _mode = Mode.Offline;
            _lastProbe = DateTime.UtcNow;
            _title.Text = "Focalboard 日历 · 离线";
            string html;
            try
            {
                html = OfflinePage.Build(_server, reason);
            }
            catch (Exception ex)
            {
                html = "<html><body style='font-family:Microsoft YaHei UI;padding:20px'>离线缓存读取失败：" + ex.Message + "</body></html>";
            }
            try { _web.NavigateToString(html); }
            catch { }
        }

        protected override void OnDeactivate(EventArgs e)
        {
            base.OnDeactivate(e);
            _hiddenAt = DateTime.UtcNow;
            if (!_suppressHide && !Pinned)
            {
                Hide();
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                HidePopup();
                return;
            }
            base.OnFormClosing(e);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _timer.Stop();
                _timer.Dispose();
            }
            base.Dispose(disposing);
        }

        // 在线时：隐藏侧栏与看板主体，自动点开顶栏日期条的假勤日历（钉住模式）。
        private const string CalendarScript = @"
(function(){
  if (window.__fbCalInstalled) { try { window.__fbCalTick(); } catch(e) {} return; }
  window.__fbCalInstalled = true;

  window.__fbCalStyle = function(){
    var el = document.getElementById('fb-cal-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'fb-cal-style';
      var root = document.head || document.documentElement;
      if (root) { root.appendChild(el); }
    }
    return el;
  };
  var CSS = 'html,body{overflow-x:hidden!important;margin:0!important;height:100%!important;' +
    'background:rgb(var(--center-channel-bg-rgb))!important;}' +
    '.App,.app{background:rgb(var(--center-channel-bg-rgb))!important;}' +
    '.Sidebar,.Sidebar.octo-sidebar,.Sidebar.hidden{display:none!important;}' +
    '.Workspace>.mainFrame>*:not(.DueLayout){display:none!important;}' +
    '.DueLayout{background:rgb(var(--center-channel-bg-rgb))!important;}' +
    '.DueLayout__content{display:none!important;}' +
    '.DueLayout__divider{display:none!important;}' +
    '.DueSidebar{display:none!important;}' +
    '.DueTopBar{display:none!important;}' +
    '.LeaveCalendar{position:fixed!important;left:50%!important;top:6px!important;' +
    'transform:translateX(-50%)!important;z-index:6000!important;' +
    'border:0!important;border-radius:0!important;box-shadow:none!important;' +
    'background:rgb(var(--center-channel-bg-rgb))!important;}' +
    '.LeaveCalendar__close{font-size:16px!important;}' +
    '.LeaveCalendar__tabs button{padding:7px 0!important;font-size:12.5px!important;}' +
    '.LeaveCalendar__panel{font-size:12.5px!important;}' +
    '.LeaveCalendar__panel input,.LeaveCalendar__panel select{font-size:12.5px!important;}';

  window.__fbCalApply = function(){
    var el = window.__fbCalStyle();
    if (!el) { return; }
    if (document.querySelector('.LoginPage') || !document.querySelector('.DueLayout')) {
      if (el.textContent) { el.textContent = ''; }
      return;
    }
    if (el.textContent !== CSS) { el.textContent = CSS; }
  };

  window.__fbCalTick = function(){
    try { window.__fbCalApply(); } catch(e) {}
    if (document.querySelector('.LoginPage')) { return; }
    if (!document.querySelector('.DueLayout')) { return; }
    var cal = document.querySelector('.LeaveCalendar');
    if (cal) { window.__fbCalOpened = true; return; }
    if (window.__fbCalOpened) { return; }
    var strip = document.querySelector('.DueTopBar__calendar');
    if (!strip) { return; }
    var now = Date.now();
    if (!window.__fbCalTryAt) { window.__fbCalTryAt = now; }
    if (now - window.__fbCalTryAt > 2500) {
      try { strip.click(); } catch(e) {}
      window.__fbCalTryAt = now;
      return;
    }
    try {
      strip.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, view: window}));
    } catch(e) {}
  };

  window.__fbCalTimer = setInterval(function(){ try { window.__fbCalTick(); } catch(e) {} }, 1200);
  try { window.__fbCalTick(); } catch(e) {}
  setTimeout(function(){ try { window.__fbCalTick(); } catch(e) {} }, 700);
  setTimeout(function(){ try { window.__fbCalTick(); } catch(e) {} }, 2000);
})();
";
    }
}
