# 一键重新打包：生产构建 -> Electron 资源 -> 自解压安装器
param(
  [string]$Node
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) {
  $csc = 'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
}

if (-not $Node) {
  $found = Get-Command node -ErrorAction SilentlyContinue
  if ($found) { $Node = $found.Source }
}
if (-not $Node) {
  throw '找不到 Node，请先安装 Node 22+，或用 -Node 指定 node.exe 路径'
}

function Step($text) { Write-Host "==> $text" -ForegroundColor Cyan }

# 1. 生产构建
Step '生产构建 dist/'
$env:NODE_ENV = 'production'
& $Node 'node_modules\@rspack\cli\bin\rspack.js' build -c rspack.config.ts
if ($LASTEXITCODE -ne 0) { throw '构建失败' }

# 2. 同步应用文件到 Electron 资源目录
Step '同步应用文件'
$appDir = 'desktop\runtime\resources\app'
if (-not (Test-Path 'desktop\runtime\electron.exe')) {
  throw '缺少 desktop\runtime，请先解压 Electron win32-x64 运行时到该目录'
}
New-Item -ItemType Directory -Path $appDir -Force | Out-Null
Copy-Item 'desktop\app\package.json', 'desktop\app\main.js', 'desktop\app\icon.ico', 'desktop\app\icon.png' -Destination $appDir -Force
if (Test-Path (Join-Path $appDir 'dist')) { Remove-Item (Join-Path $appDir 'dist') -Recurse -Force }
Copy-Item 'dist' -Destination (Join-Path $appDir 'dist') -Recurse -Force

# 3. 重新压缩负载
Step '压缩负载 QQ2005Chat.zip'
$zip = 'desktop\installer\payload\QQ2005Chat.zip'
New-Item -ItemType Directory -Path (Split-Path -Parent $zip) -Force | Out-Null
Remove-Item $zip -Force -ErrorAction SilentlyContinue
& "$env:SystemRoot\System32\tar.exe" -a -c -f $zip -C 'desktop\runtime' .
if ($LASTEXITCODE -ne 0) { throw '压缩失败' }

# 4. 编译安装器
Step '编译安装器 Launcher.exe'
& $csc /nologo /target:winexe /out:'dist-installer\Launcher.exe' /win32icon:'desktop\app\icon.ico' `
  /reference:System.dll /reference:System.Core.dll /reference:System.Windows.Forms.dll `
  /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll `
  'tools\installer\Launcher.cs'
if ($LASTEXITCODE -ne 0) { throw '编译安装器失败' }

# 5. 拼装：安装器 + zip + 尾部索引
Step '拼装 QQ2005Chat-Setup.exe'
$out = 'dist-installer\QQ2005Chat-Setup.exe'
Remove-Item $out -Force -ErrorAction SilentlyContinue
Copy-Item 'dist-installer\Launcher.exe' $out
$zipLength = (Get-Item $zip).Length
$stream = [System.IO.File]::Open($out, 'Append')
$source = [System.IO.File]::OpenRead($zip)
try {
  $source.CopyTo($stream)
  $footer = [System.Text.Encoding]::ASCII.GetBytes('QQ2005SFX1') + [BitConverter]::GetBytes([int64]$zipLength)
  $stream.Write($footer, 0, $footer.Length)
}
finally {
  $stream.Close()
  $source.Close()
}

$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "完成：$out ($sizeMb MB)" -ForegroundColor Green
