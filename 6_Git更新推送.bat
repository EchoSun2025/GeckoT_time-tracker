@echo off
chcp 65001 >nul
echo ========================================
echo   Git 更新并推送到 GitHub
echo ========================================
echo.

cd /d "%~dp0"

echo [1/3] 添加所有更改...
git add .

echo.
echo [2/3] 创建提交...
git commit -m "v1.2.0: 提醒系统优化 - 自定义间隔/骚话，智能定时，语音过滤emoji"

echo.
echo [3/3] 推送到 GitHub...
git push origin main

echo.
echo ========================================
if %ERRORLEVEL% EQU 0 (
    echo   ✓ 成功！代码已推送到 GitHub
) else (
    echo   ✗ 推送失败，请检查网络或登录状态
)
echo ========================================
echo.
echo 仓库地址: https://github.com/EchoSun2020/GeckoT_time-tracker
echo.
pause
