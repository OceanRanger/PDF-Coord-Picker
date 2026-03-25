# PowerShell 启动脚本（无需 Python）
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  PDF 坐标拾取工具 - 启动服务器" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "正在启动服务器..." -ForegroundColor Green
Write-Host "服务器地址: http://localhost:8000" -ForegroundColor Yellow
Write-Host ""
Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 切换到脚本所在目录
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptPath

# 启动简单的 HTTP 服务器
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8000/")
$listener.Start()

Write-Host "服务器已启动，正在运行..." -ForegroundColor Green
Write-Host ""

try {
    while ($true) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # 获取请求的文件路径
        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/") {
            $urlPath = "/index.html"
        }

        # 构建文件路径
        $filePath = Join-Path $ScriptPath $urlPath.TrimStart("/")

        # 检查文件是否存在
        if (Test-Path $filePath) {
            # 读取文件内容
            $content = [System.IO.File]::ReadAllBytes($filePath)

            # 设置内容类型
            $extension = [System.IO.Path]::GetExtension($filePath)
            switch ($extension) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".css" { $response.ContentType = "text/css; charset=utf-8" }
                ".js" { $response.ContentType = "application/javascript; charset=utf-8" }
                default { $response.ContentType = "application/octet-stream" }
            }

            # 发送响应
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
            $response.OutputStream.Close()
        } else {
            # 文件不存在，返回 404
            $response.StatusCode = 404
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    Write-Host ""
    Write-Host "服务器已停止" -ForegroundColor Yellow
}
