@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions
title QQ2005 珊瑚版 - 安装程序
echo.
echo   ==========================================
echo     QQ2005 珊瑚版  ·  安装程序
echo   ==========================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
set "CODE=%ERRORLEVEL%"
echo.
if "%CODE%"=="0" (
  echo   安装完成，正在启动...
) else (
  echo   安装失败，错误码 %CODE%
  pause
)
exit /b %CODE%
