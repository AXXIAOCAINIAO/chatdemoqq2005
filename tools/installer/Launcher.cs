using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace QQ2005Chat.Setup
{
    /// <summary>
    /// 自解压安装器：交付的 exe = 本程序 + zip 负载 + 尾部索引（magic + 长度）。
    /// 不申请管理员权限，全部装到 %LOCALAPPDATA%，并注册卸载信息。
    /// </summary>
    internal static class Program
    {
        private const string AppName = "QQ2005 珊瑚版";
        private const string ExeName = "QQ2005Chat.exe";
        private const int FooterSize = 10 + 8;

        private static byte[] Magic
        {
            get { return Encoding.ASCII.GetBytes("QQ2005SFX1"); }
        }

        private static string InstallDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "QQ2005Chat");
            }
        }

        [STAThread]
        private static int Main(string[] args)
        {
            bool verify = Array.IndexOf(args, "--verify") >= 0;
            try
            {
                byte[] payload = ReadPayload();
                if (verify)
                {
                    string dir = null;
                    int at = Array.IndexOf(args, "--verify");
                    if (at >= 0 && args.Length > at + 1)
                    {
                        dir = args[at + 1];
                    }
                    return Verify(payload, dir);
                }
                Run(payload);
                return 0;
            }
            catch (Exception error)
            {
                if (verify)
                {
                    File.AppendAllText("verify.log", error.ToString(), Encoding.UTF8);
                    return 3;
                }
                MessageBox.Show(
                    "安装失败：" + error.Message,
                    AppName,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 1;
            }
        }

        /// <summary>从自身文件尾部取出 zip 负载</summary>
        private static byte[] ReadPayload()
        {
            string self = Assembly.GetExecutingAssembly().Location;
            using (FileStream stream = new FileStream(self, FileMode.Open, FileAccess.Read))
            {
                long length = stream.Length;
                if (length <= FooterSize)
                {
                    throw new InvalidOperationException("安装包不完整");
                }
                stream.Seek(length - FooterSize, SeekOrigin.Begin);
                byte[] footer = new byte[FooterSize];
                ReadExactly(stream, footer);
                for (int i = 0; i < Magic.Length; i++)
                {
                    if (footer[i] != Magic[i])
                    {
                        throw new InvalidOperationException("安装包数据区损坏，请重新下载");
                    }
                }
                long size = BitConverter.ToInt64(footer, Magic.Length);
                long start = length - FooterSize - size;
                if (size <= 0 || start < 0)
                {
                    throw new InvalidOperationException("安装包长度异常");
                }
                stream.Seek(start, SeekOrigin.Begin);
                byte[] payload = new byte[size];
                ReadExactly(stream, payload);
                return payload;
            }
        }

        private static void ReadExactly(Stream stream, byte[] buffer)
        {
            int offset = 0;
            while (offset < buffer.Length)
            {
                int read = stream.Read(buffer, offset, buffer.Length - offset);
                if (read <= 0)
                {
                    throw new EndOfStreamException();
                }
                offset += read;
            }
        }

        private static int Verify(byte[] payload, string target)
        {
            if (string.IsNullOrEmpty(target))
            {
                target = Path.Combine(Path.GetTempPath(), "qq2005-verify");
            }
            if (Directory.Exists(target))
            {
                Directory.Delete(target, true);
            }
            Directory.CreateDirectory(target);
            using (ZipArchive archive = new ZipArchive(new MemoryStream(payload), ZipArchiveMode.Read))
            {
                ExtractAll(archive, target, delegate(double progress) { });
                int files = 0;
                long bytes = 0;
                foreach (string file in Directory.GetFiles(target, "*", SearchOption.AllDirectories))
                {
                    files++;
                    bytes += new FileInfo(file).Length;
                }
                bool hasExe = File.Exists(Path.Combine(target, "electron.exe"));
                bool hasIndex = File.Exists(Path.Combine(target, @"resources\app\dist\index.html"));
                bool hasMain = File.Exists(Path.Combine(target, @"resources\app\main.js"));
                File.AppendAllText(
                    "verify.log",
                    string.Format(
                        "files={0} bytes={1} electron={2} index={3} main={4}{5}",
                        files,
                        bytes,
                        hasExe,
                        hasIndex,
                        hasMain,
                        Environment.NewLine),
                    Encoding.UTF8);
                Directory.Delete(target, true);
                return hasExe && hasIndex && hasMain ? 0 : 2;
            }
        }

        private static void Run(byte[] payload)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (InstallForm form = new InstallForm(payload, InstallDir))
            {
                Application.Run(form);
                if (form.LaunchPath != null)
                {
                    Process.Start(form.LaunchPath);
                }
            }
        }

        private static void ExtractAll(ZipArchive archive, string target, Action<double> onProgress)
        {
            long total = 0;
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                total += entry.Length;
            }
            long done = 0;
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                string destination = Path.Combine(target, relative);
                if (entry.Name.Length == 0)
                {
                    Directory.CreateDirectory(destination);
                    continue;
                }
                string folder = Path.GetDirectoryName(destination);
                if (!string.IsNullOrEmpty(folder) && !Directory.Exists(folder))
                {
                    Directory.CreateDirectory(folder);
                }
                using (Stream source = entry.Open())
                using (FileStream output = new FileStream(destination, FileMode.Create, FileAccess.Write))
                {
                    byte[] buffer = new byte[81920];
                    int read;
                    while ((read = source.Read(buffer, 0, buffer.Length)) > 0)
                    {
                        output.Write(buffer, 0, read);
                        done += read;
                        if (total > 0)
                        {
                            onProgress(Math.Min(1.0, (double)done / total));
                        }
                    }
                }
            }
        }

        /// <summary>安装界面：进度条 + 状态文字，完成后自动启动程序</summary>
        private sealed class InstallForm : Form
        {
            private readonly byte[] payload;
            private readonly string target;
            private readonly Label status;
            private readonly ProgressBar bar;
            private Thread worker;

            public string LaunchPath { get; private set; }

            public InstallForm(byte[] payload, string target)
            {
                this.payload = payload;
                this.target = target;

                Text = AppName + " 安装程序";
                FormBorderStyle = FormBorderStyle.FixedDialog;
                StartPosition = FormStartPosition.CenterScreen;
                MaximizeBox = false;
                MinimizeBox = false;
                ClientSize = new Size(430, 148);
                BackColor = Color.FromArgb(212, 208, 200);
                Font = new Font("SimSun", 9f);

                Label title = new Label();
                title.Text = "正在安装 " + AppName;
                title.Font = new Font("SimSun", 10f, FontStyle.Bold);
                title.SetBounds(18, 16, 380, 22);
                Controls.Add(title);

                Label hint = new Label();
                hint.Text = "目标目录：" + target;
                hint.SetBounds(18, 42, 400, 18);
                hint.ForeColor = Color.FromArgb(70, 70, 70);
                Controls.Add(hint);

                bar = new ProgressBar();
                bar.SetBounds(18, 68, 394, 18);
                bar.Minimum = 0;
                bar.Maximum = 100;
                Controls.Add(bar);

                status = new Label();
                status.Text = "正在准备...";
                status.SetBounds(18, 94, 394, 18);
                status.ForeColor = Color.FromArgb(70, 70, 70);
                Controls.Add(status);

                Shown += delegate { StartWorker(); };
            }

            private void StartWorker()
            {
                worker = new Thread(Work);
                worker.IsBackground = true;
                worker.Start();
            }

            private void Work()
            {
                try
                {
                    Report(0, "正在准备目录...");
                    foreach (Process process in Process.GetProcessesByName("QQ2005Chat"))
                    {
                        try
                        {
                            process.Kill();
                            process.WaitForExit(3000);
                        }
                        catch (Exception)
                        {
                        }
                    }
                    if (Directory.Exists(target))
                    {
                        Directory.Delete(target, true);
                    }
                    Directory.CreateDirectory(target);

                    Report(1, "正在解压文件（约 290MB，请稍候）...");
                    using (ZipArchive archive = new ZipArchive(new MemoryStream(payload), ZipArchiveMode.Read))
                    {
                        ExtractAll(
                            archive,
                            target,
                            delegate(double progress)
                            {
                                int percent = (int)(1 + progress * 88);
                                Report(percent, string.Format("正在解压文件... {0}%", (int)(progress * 100)));
                            });
                    }

                    Report(92, "正在完成安装...");
                    string electron = Path.Combine(target, "electron.exe");
                    string exe = Path.Combine(target, ExeName);
                    if (File.Exists(electron))
                    {
                        if (File.Exists(exe))
                        {
                            File.Delete(exe);
                        }
                        File.Move(electron, exe);
                    }
                    string icon = Path.Combine(target, @"resources\app\icon.ico");

                    Report(95, "正在创建快捷方式...");
                    CreateShortcut(Path.Combine(DesktopDirectory, AppName + ".lnk"), exe, target, icon);
                    CreateShortcut(Path.Combine(ProgramsDirectory, AppName + ".lnk"), exe, target, icon);
                    string uninstall = WriteUninstaller();
                    CreateShortcut(Path.Combine(ProgramsDirectory, "卸载 " + AppName + ".lnk"), uninstall, target, icon);
                    RegisterUninstall(exe, uninstall);

                    Report(100, "安装完成，正在启动...");
                    Thread.Sleep(400);
                    LaunchPath = exe;
                    BeginInvoke(new Action(Close));
                }
                catch (Exception error)
                {
                    BeginInvoke(
                        new Action(
                            delegate
                            {
                                MessageBox.Show(
                                    "安装失败：" + error.Message,
                                    AppName,
                                    MessageBoxButtons.OK,
                                    MessageBoxIcon.Error);
                                Close();
                            }));
                }
            }

            private void Report(int percent, string text)
            {
                BeginInvoke(
                    new Action(
                        delegate
                        {
                            bar.Value = Math.Max(0, Math.Min(100, percent));
                            status.Text = text;
                        }));
            }
        }

        private static string DesktopDirectory
        {
            get { return Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory); }
        }

        private static string ProgramsDirectory
        {
            get { return Environment.GetFolderPath(Environment.SpecialFolder.Programs); }
        }

        private static void CreateShortcut(string linkPath, string targetPath, string workingDirectory, string icon)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            try
            {
                object shortcut = shellType.InvokeMember(
                    "CreateShortcut",
                    BindingFlags.InvokeMethod,
                    null,
                    shell,
                    new object[] { linkPath });
                Type shortcutType = shortcut.GetType();
                shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
                shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
                if (File.Exists(icon))
                {
                    shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { icon });
                }
                shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
            }
            finally
            {
                if (shell != null && System.Runtime.InteropServices.Marshal.IsComObject(shell))
                {
                    System.Runtime.InteropServices.Marshal.ReleaseComObject(shell);
                }
            }
        }

        private static string WriteUninstaller()
        {
            string path = Path.Combine(InstallDir, "卸载.cmd");
            StringBuilder text = new StringBuilder();
            text.AppendLine("@echo off");
            text.AppendLine("chcp 65001 >nul 2>nul");
            text.AppendLine("title 卸载 " + AppName);
            text.AppendLine("echo   正在卸载 " + AppName + " ...");
            text.AppendLine("taskkill /f /im " + ExeName + " >nul 2>nul");
            text.AppendLine("reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QQ2005Chat\" /f >nul 2>nul");
            text.AppendLine("del \"%USERPROFILE%\\Desktop\\" + AppName + ".lnk\" >nul 2>nul");
            text.AppendLine("del \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\" + AppName + ".lnk\" >nul 2>nul");
            text.AppendLine("del \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\卸载 " + AppName + ".lnk\" >nul 2>nul");
            text.AppendLine("start \"\" /min cmd /c \"timeout /t 2 >nul & rmdir /s /q \\\"" + InstallDir + "\\\"\"");
            text.AppendLine("echo   卸载完成。");
            text.AppendLine("timeout /t 2 >nul");
            File.WriteAllText(path, text.ToString(), new UTF8Encoding(false));
            return path;
        }

        private static void RegisterUninstall(string exe, string uninstall)
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\QQ2005Chat"))
            {
                if (key == null)
                {
                    return;
                }
                key.SetValue("DisplayName", AppName);
                key.SetValue("DisplayVersion", "1.0.0");
                key.SetValue("Publisher", "retro desk");
                key.SetValue("DisplayIcon", exe);
                key.SetValue("InstallLocation", InstallDir);
                key.SetValue("UninstallString", "\"" + uninstall + "\"");
                key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                key.SetValue("EstimatedSize", DirectorySizeKb(InstallDir), RegistryValueKind.DWord);
            }
        }

        private static int DirectorySizeKb(string path)
        {
            long bytes = 0;
            foreach (string file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
            {
                bytes += new FileInfo(file).Length;
            }
            return (int)Math.Min(int.MaxValue, bytes / 1024);
        }
    }
}
