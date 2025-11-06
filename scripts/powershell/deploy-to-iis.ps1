# EcoBoard IIS 部署腳本
# 需要管理員權限執行

param(
    [string]$SiteName = "EcoBoard",
    [string]$Port = "80",
    [string]$PhysicalPath = (Join-Path $PSScriptRoot "..\.." | Resolve-Path).Path,
    [string]$HostName = ""
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "EcoBoard IIS 部署腳本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 檢查是否以管理員權限執行
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "❌ 錯誤: 此腳本需要管理員權限" -ForegroundColor Red
    Write-Host "請以管理員身份執行 PowerShell，然後重新執行此腳本" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "按任意鍵退出..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Write-Host "✅ 管理員權限檢查通過" -ForegroundColor Green
Write-Host ""

# 匯入 WebAdministration 模組
Import-Module WebAdministration -ErrorAction SilentlyContinue

if (-not (Get-Module WebAdministration)) {
    Write-Host "❌ 錯誤: 無法載入 WebAdministration 模組" -ForegroundColor Red
    Write-Host "請確認 IIS 已正確安裝" -ForegroundColor Yellow
    exit 1
}

Write-Host "部署設定:" -ForegroundColor Yellow
Write-Host "  網站名稱: $SiteName" -ForegroundColor White
Write-Host "  實體路徑: $PhysicalPath" -ForegroundColor White
Write-Host "  埠號: $Port" -ForegroundColor White
if ($HostName) {
    Write-Host "  主機名稱: $HostName" -ForegroundColor White
}
Write-Host ""

# 檢查建置檔案是否存在
Write-Host "檢查建置檔案..." -ForegroundColor Yellow

$distPath = Join-Path $PhysicalPath "dist"
$clientBuildPath = Join-Path $PhysicalPath "client\build"

if (-not (Test-Path $distPath)) {
    Write-Host "❌ 錯誤: 找不到後端建置檔案 (dist)" -ForegroundColor Red
    Write-Host "請先執行: npm run build:server" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $clientBuildPath)) {
    Write-Host "❌ 錯誤: 找不到前端建置檔案 (client/build)" -ForegroundColor Red
    Write-Host "請先執行: cd client && npm run build" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 建置檔案檢查通過" -ForegroundColor Green
Write-Host ""

# 檢查並刪除現有網站
Write-Host "檢查現有網站..." -ForegroundColor Yellow

$existingSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue

if ($existingSite) {
    Write-Host "⚠️  警告: 網站 '$SiteName' 已存在" -ForegroundColor Yellow
    $confirm = Read-Host "是否要刪除並重新建立? (Y/N)"
    
    if ($confirm -eq 'Y' -or $confirm -eq 'y') {
        Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
        Remove-Website -Name $SiteName
        Write-Host "✅ 已刪除現有網站" -ForegroundColor Green
    } else {
        Write-Host "❌ 部署已取消" -ForegroundColor Red
        exit 0
    }
}

# 檢查並建立應用程式集區
Write-Host "設定應用程式集區..." -ForegroundColor Yellow

$appPoolName = $SiteName
$existingAppPool = Get-Item "IIS:\AppPools\$appPoolName" -ErrorAction SilentlyContinue

if ($existingAppPool) {
    Stop-WebAppPool -Name $appPoolName -ErrorAction SilentlyContinue
    Remove-WebAppPool -Name $appPoolName
}

$appPool = New-WebAppPool -Name $appPoolName
$appPool.managedRuntimeVersion = ""
$appPool.managedPipelineMode = "Integrated"
$appPool | Set-Item

Write-Host "✅ 應用程式集區已建立" -ForegroundColor Green
Write-Host ""

# 建立網站
Write-Host "建立 IIS 網站..." -ForegroundColor Yellow

if ($HostName) {
    New-Website -Name $SiteName -PhysicalPath $PhysicalPath -Port $Port -HostHeader $HostName -ApplicationPool $appPoolName
} else {
    New-Website -Name $SiteName -PhysicalPath $PhysicalPath -Port $Port -ApplicationPool $appPoolName
}

Write-Host "✅ IIS 網站已建立" -ForegroundColor Green
Write-Host ""

# 設定檔案權限
Write-Host "設定檔案權限..." -ForegroundColor Yellow

try {
    icacls $PhysicalPath /grant "IIS_IUSRS:(OI)(CI)R" /T /Q
    
    $nodeModulesPath = Join-Path $PhysicalPath "node_modules"
    if (Test-Path $nodeModulesPath) {
        icacls $nodeModulesPath /grant "IIS_IUSRS:(OI)(CI)RX" /T /Q
    }
    
    Write-Host "✅ 檔案權限已設定" -ForegroundColor Green
} catch {
    Write-Host "⚠️  警告: 設定檔案權限時發生錯誤" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}

Write-Host ""

# 檢查 .env 檔案
Write-Host "檢查環境設定..." -ForegroundColor Yellow

$envPath = Join-Path $PhysicalPath ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "⚠️  警告: 找不到 .env 檔案" -ForegroundColor Yellow
    Write-Host "請建立 .env 檔案並設定必要的環境變數" -ForegroundColor Yellow
    Write-Host "參考 DEPLOYMENT_CHECKLIST.md 中的環境變數範例" -ForegroundColor Yellow
} else {
    Write-Host "✅ .env 檔案存在" -ForegroundColor Green
}

Write-Host ""

# 重啟 IIS
Write-Host "重啟 IIS..." -ForegroundColor Yellow

try {
    iisreset
    Write-Host "✅ IIS 已重啟" -ForegroundColor Green
} catch {
    Write-Host "⚠️  警告: 重啟 IIS 時發生錯誤" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ 部署完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($HostName) {
    Write-Host "網站位址: http://${HostName}:${Port}" -ForegroundColor White
    Write-Host "請確保已在 hosts 檔案或 DNS 中設定 $HostName" -ForegroundColor Yellow
} else {
    Write-Host "網站位址: http://localhost:${Port}" -ForegroundColor White
}

Write-Host ""
Write-Host "後續步驟:" -ForegroundColor Yellow
Write-Host "1. 確認 .env 檔案已正確設定" -ForegroundColor White
Write-Host "2. 執行資料庫遷移: npm run migrate" -ForegroundColor White
Write-Host "3. 在瀏覽器中測試網站" -ForegroundColor White
Write-Host "4. 檢查日誌檔案 (iisnode 資料夾)" -ForegroundColor White
Write-Host ""
Write-Host "如有問題，請參考 DEPLOYMENT_CHECKLIST.md" -ForegroundColor Yellow
Write-Host ""
Write-Host "按任意鍵退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
