using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Program
{
    private static string appDir;
    private static string dataDir;
    private static string logPath;
    private static int port = 8088;
    private static Process serverProcess;
    private static bool startedByUs;
    private static bool exiting;
    private static bool silent;
    private static NotifyIcon tray;
    private static Mutex mutex;
    private static StreamWriter logWriter;
    private static readonly object logLock = new object();

    [STAThread]
    private static void Main(string[] args)
    {
        silent = args.Length > 0 && Array.IndexOf(args, "--silent") >= 0;

        appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        dataDir = Path.Combine(appDir, "data");
        logPath = Path.Combine(dataDir, "focalboard.log");
        port = ReadPort();

        if (args.Length > 0 && Array.IndexOf(args, "--quit") >= 0)
        {
            try
            {
                EventWaitHandle quitSignal = EventWaitHandle.OpenExisting("Local\\FocalboardLAN-Quit-" + port);
                quitSignal.Set();
            }
            catch { }
            Thread.Sleep(600);
            KillStaleServers();
            WaitForPortClosed(port, 5000);
            return;
        }

        bool createdNew;
        mutex = new Mutex(true, "Local\\FocalboardLAN-" + port, out createdNew);
        if (!createdNew)
        {
            if (!silent)
            {
                OpenBrowser();
            }
            return;
        }

        try
        {
            Directory.CreateDirectory(dataDir);
            Directory.CreateDirectory(Path.Combine(dataDir, "files"));
            logWriter = new StreamWriter(logPath, true, Encoding.UTF8);
            logWriter.AutoFlush = true;
        }
        catch (Exception ex)
        {
            if (!silent)
            {
                MessageBox.Show("无法创建数据目录：\n" + ex.Message, "Focalboard", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs e) { Log("UI ERROR: " + e.Exception); };
        AppDomain.CurrentDomain.UnhandledException += delegate(object sender, UnhandledExceptionEventArgs e) { Log("FATAL: " + e.ExceptionObject); };

        bool autostartEnabled = ReadAutostartSetting();
        if (!File.Exists(SettingsPath))
        {
            WriteAutostartSetting(autostartEnabled);
        }
        if (autostartEnabled)
        {
            WriteAutostartRegistry();
        }

        CreateTray(autostartEnabled);

        bool alreadyRunning = IsFocalboardUp();
        if (!alreadyRunning)
        {
            startedByUs = StartServer();
            if (!startedByUs)
            {
                tray.Visible = false;
                tray.Dispose();
                if (!silent)
                {
                    MessageBox.Show(
                        "Focalboard 服务端启动失败。\n\n最近日志：\n" + ReadLogTail(15) +
                        "\n\n如果日志提示端口被占用，请关闭占用 " + port + " 的程序后重试。",
                        "Focalboard",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
                return;
            }
        }

        if (!silent)
        {
            OpenBrowser();

            string lan = FirstLanUrl();
            ShowBalloon(
                alreadyRunning ? "Focalboard 已在运行" : "Focalboard 已启动",
                "本机：http://localhost:" + port + "/\n" +
                (lan == null ? "未检测到局域网地址" : "局域网：" + lan) +
                "\n如同事打不开，请右键托盘图标放行防火墙。");
        }
        else
        {
            Log("silent start, server ready");
        }

        EventWaitHandle stopSignal = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\FocalboardLAN-Quit-" + port);
        System.Windows.Forms.Timer stopTimer = new System.Windows.Forms.Timer();
        stopTimer.Interval = 500;
        stopTimer.Tick += delegate
        {
            if (stopSignal.WaitOne(0))
            {
                stopTimer.Stop();
                ExitApp();
            }
        };
        stopTimer.Start();

        Application.Run();

        try { mutex.ReleaseMutex(); } catch { }
    }

    private static string SettingsPath
    {
        get { return Path.Combine(dataDir, "launcher.ini"); }
    }

    private static int ReadPort()
    {
        try
        {
            string path = Path.Combine(appDir, "config.json");
            if (File.Exists(path))
            {
                Match m = Regex.Match(File.ReadAllText(path), "\"port\"\\s*:\\s*(\\d+)");
                int p;
                if (m.Success && int.TryParse(m.Groups[1].Value, out p) && p > 0 && p < 65536)
                {
                    return p;
                }
            }
        }
        catch (Exception ex)
        {
            Log("read config failed: " + ex.Message);
        }
        return 8088;
    }

    private static bool ReadAutostartSetting()
    {
        try
        {
            if (File.Exists(SettingsPath))
            {
                Match m = Regex.Match(File.ReadAllText(SettingsPath), @"autostart\s*=\s*(\d)");
                if (m.Success)
                {
                    return m.Groups[1].Value == "1";
                }
            }
        }
        catch (Exception ex)
        {
            Log("read autostart setting failed: " + ex.Message);
        }
        return true;
    }

    private static void WriteAutostartSetting(bool enabled)
    {
        try
        {
            File.WriteAllText(SettingsPath, "autostart=" + (enabled ? "1" : "0") + Environment.NewLine);
        }
        catch (Exception ex)
        {
            Log("write autostart setting failed: " + ex.Message);
        }
    }

    private static void WriteAutostartRegistry()
    {
        try
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
            {
                if (key == null) return;
                key.SetValue("FocalboardLAN", "\"" + Application.ExecutablePath + "\" --silent", RegistryValueKind.String);
            }
        }
        catch (Exception ex)
        {
            Log("write autostart registry failed: " + ex.Message);
        }
    }

    private static void RemoveAutostartRegistry()
    {
        try
        {
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
            {
                if (key != null)
                {
                    key.DeleteValue("FocalboardLAN", false);
                }
            }
        }
        catch (Exception ex)
        {
            Log("remove autostart registry failed: " + ex.Message);
        }
    }

    private static void CreateTray(bool autostartEnabled)
    {
        tray = new NotifyIcon();
        tray.Icon = LoadAppIcon();
        tray.Text = "Focalboard 局域网版";
        tray.Visible = true;
        tray.DoubleClick += delegate { OpenBrowser(); };

        ContextMenuStrip menu = new ContextMenuStrip();
        menu.Items.Add("打开 Focalboard", null, delegate { OpenBrowser(); });

        ToolStripMenuItem lanMenu = new ToolStripMenuItem("局域网地址（点击复制）");
        lanMenu.DropDownOpening += delegate
        {
            lanMenu.DropDownItems.Clear();
            List<string> urls = GetLanUrls();
            if (urls.Count == 0)
            {
                ToolStripMenuItem none = new ToolStripMenuItem("未检测到局域网地址");
                none.Enabled = false;
                lanMenu.DropDownItems.Add(none);
                return;
            }
            foreach (string url in urls)
            {
                string target = url;
                lanMenu.DropDownItems.Add(target, null, delegate
                {
                    try
                    {
                        Clipboard.SetText(target);
                        ShowBalloon("已复制", target);
                    }
                    catch (Exception ex)
                    {
                        Log("clipboard failed: " + ex.Message);
                    }
                });
            }
        };
        menu.Items.Add(lanMenu);

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("允许局域网访问（防火墙）", null, delegate { AddFirewallRule(); });

        ToolStripMenuItem autostartItem = new ToolStripMenuItem("开机自动启动（登录后静默运行）");
        autostartItem.Checked = autostartEnabled;
        autostartItem.Click += delegate
        {
            bool enable = !autostartItem.Checked;
            autostartItem.Checked = enable;
            WriteAutostartSetting(enable);
            if (enable)
            {
                WriteAutostartRegistry();
                ShowBalloon("开机自动启动", "已开启。登录 Windows 后会静默启动，不弹出浏览器。");
            }
            else
            {
                RemoveAutostartRegistry();
                ShowBalloon("开机自动启动", "已关闭。");
            }
        };
        menu.Items.Add(autostartItem);

        menu.Items.Add("打开数据目录", null, delegate
        {
            try { Process.Start("explorer.exe", "\"" + dataDir + "\""); } catch (Exception ex) { Log("open data dir failed: " + ex.Message); }
        });
        menu.Items.Add("查看日志", null, delegate
        {
            try
            {
                if (File.Exists(logPath))
                {
                    Process.Start("notepad.exe", "\"" + logPath + "\"");
                }
            }
            catch (Exception ex) { Log("open log failed: " + ex.Message); }
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出", null, delegate { ExitApp(); });

        tray.ContextMenuStrip = menu;
    }

    private static Icon LoadAppIcon()
    {
        try
        {
            Icon icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            if (icon != null)
            {
                return icon;
            }
        }
        catch { }
        return SystemIcons.Application;
    }

    private static bool StartServer()
    {
        string exe = Path.Combine(appDir, "focalboard-server.exe");
        string config = Path.Combine(appDir, "config.json");
        if (!File.Exists(exe))
        {
            Log("missing server exe: " + exe);
            return false;
        }
        if (!File.Exists(config))
        {
            Log("missing config: " + config);
            return false;
        }

        if (IsPortListening(port))
        {
            Log("port " + port + " is in use, checking for a stale server");
            KillStaleServers();
            if (!WaitForPortClosed(port, 5000))
            {
                Log("port " + port + " is still in use");
                return false;
            }
        }

        try
        {
            if (logWriter != null && new FileInfo(logPath).Length > 10 * 1024 * 1024)
            {
                logWriter.Close();
                File.Delete(logPath);
                logWriter = new StreamWriter(logPath, true, Encoding.UTF8);
                logWriter.AutoFlush = true;
            }
        }
        catch { }

        Log("=== starting server, port " + port + (silent ? ", silent" : "") + " ===");

        ProcessStartInfo psi = new ProcessStartInfo(exe, "--config \"" + config + "\"");
        psi.WorkingDirectory = appDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.StandardOutputEncoding = Encoding.UTF8;
        psi.StandardErrorEncoding = Encoding.UTF8;

        serverProcess = new Process();
        serverProcess.StartInfo = psi;
        serverProcess.EnableRaisingEvents = true;
        serverProcess.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) Log("srv " + e.Data);
        };
        serverProcess.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
        {
            if (e.Data != null) Log("srv! " + e.Data);
        };
        serverProcess.Exited += delegate
        {
            if (exiting) return;
            Log("server exited, code " + SafeExitCode());
            if (!silent)
            {
                ShowBalloon("Focalboard 已停止", "服务端已退出，请右键托盘图标选择“退出”后重新启动。");
            }
        };

        try
        {
            serverProcess.Start();
        }
        catch (Exception ex)
        {
            Log("start failed: " + ex.Message);
            return false;
        }

        serverProcess.BeginOutputReadLine();
        serverProcess.BeginErrorReadLine();

        DateTime deadline = DateTime.UtcNow.AddSeconds(45);
        while (DateTime.UtcNow < deadline)
        {
            if (serverProcess.HasExited)
            {
                Log("server exited during startup, code " + SafeExitCode());
                return false;
            }
            if (IsFocalboardUp())
            {
                Log("server ready");
                return true;
            }
            Thread.Sleep(300);
        }

        Log("server startup timeout");
        return false;
    }

    private static string SafeExitCode()
    {
        try { return serverProcess == null ? "?" : serverProcess.ExitCode.ToString(); }
        catch { return "?"; }
    }

    private static bool IsPortListening(int p)
    {
        try
        {
            using (TcpClient client = new TcpClient())
            {
                IAsyncResult ar = client.BeginConnect(IPAddress.Loopback, p, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(300))
                {
                    return false;
                }
                client.EndConnect(ar);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool WaitForPortClosed(int p, int timeoutMs)
    {
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            if (!IsPortListening(p))
            {
                return true;
            }
            Thread.Sleep(200);
        }
        return !IsPortListening(p);
    }

    private static void KillStaleServers()
    {
        string expected = Path.GetFullPath(Path.Combine(appDir, "focalboard-server.exe"));
        try
        {
            foreach (Process p in Process.GetProcessesByName("focalboard-server"))
            {
                try
                {
                    string path = Path.GetFullPath(p.MainModule.FileName);
                    if (!string.Equals(path, expected, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }
                    Log("killing stale server pid " + p.Id);
                    try { p.Kill(); } catch { }
                    if (!p.WaitForExit(3000))
                    {
                        Process.Start(new ProcessStartInfo("taskkill", "/PID " + p.Id + " /T /F")
                        {
                            UseShellExecute = false,
                            CreateNoWindow = true,
                        });
                        p.WaitForExit(3000);
                    }
                }
                catch (Exception ex)
                {
                    Log("kill stale server failed: " + ex.Message);
                }
            }
        }
        catch (Exception ex)
        {
            Log("enumerate server processes failed: " + ex.Message);
        }
    }

    private static string ReadLogTail(int lines)
    {
        try
        {
            if (!File.Exists(logPath))
            {
                return "(无日志)";
            }
            string[] all = File.ReadAllLines(logPath);
            int start = Math.Max(0, all.Length - lines);
            return string.Join(Environment.NewLine, all, start, all.Length - start);
        }
        catch (Exception ex)
        {
            return "(读取日志失败: " + ex.Message + ")";
        }
    }

    private static bool IsFocalboardUp()
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/");
            req.Timeout = 1500;
            req.ReadWriteTimeout = 1500;
            req.Proxy = null;
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader reader = new StreamReader(resp.GetResponseStream()))
            {
                char[] buffer = new char[512];
                int n = reader.Read(buffer, 0, buffer.Length);
                string html = new string(buffer, 0, n);
                return html.IndexOf("focalboard", StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch
        {
            return false;
        }
    }

    private static void OpenBrowser()
    {
        string url = FirstLanUrl();
        if (url == null)
        {
            url = "http://localhost:" + port + "/";
        }
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Log("open browser failed: " + ex.Message);
        }
    }

    private static string FirstLanUrl()
    {
        List<string> urls = GetLanUrls();
        return urls.Count > 0 ? urls[0] : null;
    }

    private static List<string> GetLanUrls()
    {
        List<string> result = new List<string>();
        try
        {
            foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                foreach (UnicastIPAddressInformation ua in ni.GetIPProperties().UnicastAddresses)
                {
                    if (ua.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    string ip = ua.Address.ToString();
                    if (ip.StartsWith("127.") || ip.StartsWith("169.254.")) continue;
                    string url = "http://" + ip + ":" + port + "/";
                    if (!result.Contains(url)) result.Add(url);
                }
            }
        }
        catch (Exception ex)
        {
            Log("enumerate network failed: " + ex.Message);
        }

        result.Sort(delegate(string a, string b) { return RankLanUrl(a).CompareTo(RankLanUrl(b)); });
        return result;
    }

    private static int RankLanUrl(string url)
    {
        try
        {
            int start = url.IndexOf("//") + 2;
            int end = url.IndexOf(':', start);
            IPAddress ip = IPAddress.Parse(url.Substring(start, end - start));
            byte[] b = ip.GetAddressBytes();
            if (b[0] == 192 && b[1] == 168) return 0;
            if (b[0] == 10) return 1;
            if (b[0] == 172 && b[1] >= 16 && b[1] <= 31) return 2;
        }
        catch { }
        return 3;
    }

    private static bool FirewallRuleExists(string ruleName)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo("netsh", "advfirewall firewall show rule name=\"" + ruleName + "\"");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            using (Process p = Process.Start(psi))
            {
                string output = p.StandardOutput.ReadToEnd();
                p.WaitForExit(5000);
                return output.IndexOf(ruleName, StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch
        {
            return false;
        }
    }

    private static void AddFirewallRule()
    {
        string ruleName = "Focalboard " + port;
        if (FirewallRuleExists(ruleName))
        {
            MessageBox.Show(
                "防火墙已放行 TCP " + port + " 端口。\n\n如果同事仍无法访问，请确认双方在同一局域网，并且当前网络类型不是“公用网络”。",
                "Focalboard",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        try
        {
            string args = "advfirewall firewall add rule name=\"" + ruleName +
                          "\" dir=in action=allow protocol=TCP localport=" + port + " profile=any";
            ProcessStartInfo psi = new ProcessStartInfo("netsh", args);
            psi.UseShellExecute = true;
            psi.Verb = "runas";
            psi.WindowStyle = ProcessWindowStyle.Hidden;
            Process p = Process.Start(psi);
            if (p != null)
            {
                p.WaitForExit(60000);
                if (p.ExitCode == 0)
                {
                    MessageBox.Show(
                        "已放行 TCP " + port + " 端口。\n\n同事访问地址：\n" + (FirstLanUrl() ?? "未检测到局域网地址"),
                        "Focalboard",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }
                else
                {
                    MessageBox.Show("添加防火墙规则失败，netsh 退出码：" + p.ExitCode, "Focalboard", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                }
            }
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            if (ex.NativeErrorCode == 1223)
            {
                MessageBox.Show("已取消管理员授权，未修改防火墙。", "Focalboard", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            else
            {
                MessageBox.Show("无法添加防火墙规则：\n" + ex.Message, "Focalboard", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            Log("firewall failed: " + ex);
            MessageBox.Show("无法添加防火墙规则：\n" + ex.Message, "Focalboard", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    private static void ExitApp()
    {
        exiting = true;
        try
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                Log("stopping server");
                try { serverProcess.Kill(); } catch { }
                if (!serverProcess.WaitForExit(3000))
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo("taskkill", "/PID " + serverProcess.Id + " /T /F")
                        {
                            UseShellExecute = false,
                            CreateNoWindow = true,
                        });
                        serverProcess.WaitForExit(3000);
                    }
                    catch { }
                }
            }
        }
        catch (Exception ex)
        {
            Log("stop server failed: " + ex.Message);
        }

        // Also clean up a server process left behind by an earlier crash or by a
        // tray instance that did not start the server itself.
        KillStaleServers();
        if (!WaitForPortClosed(port, 5000))
        {
            Log("port " + port + " is still in use after exit");
        }

        if (tray != null)
        {
            tray.Visible = false;
            tray.Dispose();
            tray = null;
        }
        if (logWriter != null)
        {
            try { logWriter.Close(); } catch { }
            logWriter = null;
        }
        Application.Exit();
    }

    private static void ShowBalloon(string title, string text)
    {
        if (tray == null) return;
        try
        {
            tray.BalloonTipTitle = title;
            tray.BalloonTipText = text;
            tray.ShowBalloonTip(5000);
        }
        catch { }
    }

    private static void Log(string message)
    {
        lock (logLock)
        {
            try
            {
                if (logWriter != null)
                {
                    logWriter.WriteLine(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + message);
                }
            }
            catch { }
        }
    }
}
