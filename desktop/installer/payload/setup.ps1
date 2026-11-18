$ErrorActionPreference = 'Stop'

$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $env:LOCALAPPDATA 'QQ2005Chat'
$exeName = 'QQ2005Chat.exe'
$appName = 'QQ2005 珊瑚版'

Write-Host "  正在安装到: $dest"

# 覆盖安装：结束正在运行的旧版本，清空目录
Get-Process -Name 'QQ2005Chat' -ErrorAction SilentlyContinue | Stop-Process -Force
if (Test-Path $dest) {
  Write-Host '  检测到旧版本，正在清理...'
  Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $dest -Force | Out-Null

Write-Host '  正在解压文件（约 290MB，请稍候）...'
& "$env:SystemRoot\System32\tar.exe" -xf (Join-Path $src 'QQ2005Chat.zip') -C $dest
if ($LASTEXITCODE -ne 0) {
  throw '解压失败'
}

# 把 electron.exe 改名，任务管理器里显示的就是应用名
$electron = Join-Path $dest 'electron.exe'
$exe = Join-Path $dest $exeName
if (Test-Path $electron) {
  Move-Item -LiteralPath $electron -Destination $exe -Force
}

$icon = Join-Path $dest 'resources\app\icon.ico'
$shell = New-Object -ComObject WScript.Shell
$shortcutPaths = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) "$appName.lnk"),
  (Join-Path ([Environment]::GetFolderPath('Programs')) "$appName.lnk")
)
foreach ($lnk in $shortcutPaths) {
  $shortcut = $shell.CreateShortcut($lnk)
  $shortcut.TargetPath = $exe
  $shortcut.WorkingDirectory = $dest
  $shortcut.IconLocation = $icon
  $shortcut.Description = $appName
  $shortcut.Save()
}

# 卸载脚本：结束程序、删除快捷方式，最后自我清理目录
$uninstallPath = Join-Path $dest '卸载.cmd'
$uninstallBody = @"
@echo off
chcp 65001 >nul 2>nul
title 卸载 $appName
echo   正在卸载 $appName ...
taskkill /f /im $exeName >nul 2>nul
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\QQ2005Chat" /f >nul 2>nul
del "%USERPROFILE%\Desktop\$appName.lnk" >nul 2>nul
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\$appName.lnk" >nul 2>nul
start "" /min cmd /c "timeout /t 2 >nul & rmdir /s /q ""$dest"""
echo   卸载完成，2 秒后关闭窗口。
timeout /t 2 >nul
"@
Set-Content -LiteralPath $uninstallPath -Value $uninstallBody -Encoding UTF8

$uninstallLnk = Join-Path ([Environment]::GetFolderPath('Programs')) "卸载 $appName.lnk"
$shortcut = $shell.CreateShortcut($uninstallLnk)
$shortcut.TargetPath = $uninstallPath
$shortcut.WorkingDirectory = $dest
$shortcut.IconLocation = $icon
$shortcut.Save()

# 注册到「应用和功能」，可以正常卸载
$regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\QQ2005Chat'
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name 'DisplayName' -Value $appName
Set-ItemProperty -Path $regPath -Name 'DisplayVersion' -Value '1.0.0'
Set-ItemProperty -Path $regPath -Name 'Publisher' -Value 'retro desk'
Set-ItemProperty -Path $regPath -Name 'DisplayIcon' -Value $exe
Set-ItemProperty -Path $regPath -Name 'InstallLocation' -Value $dest
Set-ItemProperty -Path $regPath -Name 'UninstallString' -Value "`"$uninstallPath`""
Set-ItemProperty -Path $regPath -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $regPath -Name 'NoRepair' -Value 1 -Type DWord
$sizeKb = [int]((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1KB)
Set-ItemProperty -Path $regPath -Name 'EstimatedSize' -Value $sizeKb -Type DWord

Write-Host '  创建快捷方式完成。'
Start-Process -FilePath $exe -WorkingDirectory $dest
exit 0
