@echo off
chcp 65001 >nul
echo ========================================
echo   PDF 坐标拾取工具 - 启动服务器
echo ========================================
echo.
echo 正在启动服务器...
echo 服务器地址: http://localhost:8765
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
echo.

cd /d "%~dp0"
python -m http.server 8765

pause
