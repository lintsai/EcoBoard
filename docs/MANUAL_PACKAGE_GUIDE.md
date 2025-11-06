# 📦 EcoBoard 手動打包步驟指南

因為自動打包腳本遇到一些字元編碼問題，這裡提供手動打包的簡單步驟。

---

## 方式一：使用資料夾複製（推薦）⭐

### 步驟 1: 建立打包目錄

```powershell
$Name = "EcoBoard-Deploy-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$Path = "D:\Deployments\$Name"
New-Item -ItemType Directory -Path $Path -Force
```

### 步驟 2: 複製必要檔案

```powershell
# 後端建置檔案
Copy-Item -Path ".\dist" -Destination $Path -Recurse -Force

# 前端建置檔案
New-Item -ItemType Directory -Path "$Path\client" -Force | Out-Null
Copy-Item -Path ".\client\build" -Destination "$Path\client" -Recurse -Force

# Node.js 依賴（這步驟需要較長時間）
Copy-Item -Path ".\node_modules" -Destination $Path -Recurse -Force

# 配置檔案
Copy-Item -Path ".\package.json" -Destination $Path -Force
Copy-Item -Path ".\web.config" -Destination $Path -Force
Copy-Item -Path ".\.env.example" -Destination $Path -Force

# 資料庫遷移檔案
New-Item -ItemType Directory -Path "$Path\src\server\database" -Recurse -Force | Out-Null
Copy-Item -Path ".\src\server\database\migrations" -Destination "$Path\src\server\database" -Recurse -Force

# 文件
Copy-Item -Path ".\*.md" -Destination $Path -Force
Copy-Item -Path ".\docs" -Destination $Path -Recurse -Force -ErrorAction SilentlyContinue
```

### 步驟 3: 壓縮套件

```powershell
$ZipPath = "$Path.zip"
Compress-Archive -Path "$Path\*" -DestinationPath $ZipPath -Force
Write-Host "打包完成: $ZipPath" -ForegroundColor Green
```

---

## 方式二：使用 Windows 檔案總管（最簡單）👍

### 步驟 1: 建立新資料夾

1. 在 `D:\Deployments\` (或任何位置) 建立新資料夾
2. 命名為 `EcoBoard-Deploy`

### 步驟 2: 複製必要資料夾和檔案

複製以下項目到新資料夾：

**📁 資料夾：**
- `dist\` ✅
- `client\build\` ✅ (複製到新資料夾的 `client\build\`)
- `node_modules\` ✅
- `src\server\database\migrations\` ✅ (保持目錄結構)
- `docs\` ✅

**📄 檔案：**
- `package.json` ✅
- `web.config` ✅
- `.env.example` ✅
- `README.md` ✅
- `PACKAGE_DEPLOYMENT_GUIDE.md` ✅
- `DEPLOYMENT_CHECKLIST.md` ✅
- `QUICK_DEPLOY_GUIDE.md` ✅

### 步驟 3: 壓縮

1. 右鍵點擊 `EcoBoard-Deploy` 資料夾
2. 選擇「傳送到」→「壓縮的 (zipped) 資料夾」
3. 得到 `EcoBoard-Deploy.zip`

---

## 方式三：使用已建立的部署套件 🎯

我已經為您建立了一個部署目錄：

```
D:\source\EcoBoard\deploy-package\EcoBoard-Deploy-20251106-150043\
```

### 完成打包的步驟：

```powershell
# 進入您的專案目錄
cd D:\source\EcoBoard

# 設定路徑變數
$PackagePath = ".\deploy-package\EcoBoard-Deploy-20251106-150043"

# 複製後端
Write-Host "複製後端..." -ForegroundColor Yellow
Copy-Item -Path "dist" -Destination $PackagePath -Recurse -Force

# 複製前端
Write-Host "複製前端..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "$PackagePath\client" -Force | Out-Null
Copy-Item -Path "client\build" -Destination "$PackagePath\client" -Recurse -Force

# 複製 node_modules (需要時間)
Write-Host "複製 node_modules (需要幾分鐘)..." -ForegroundColor Yellow
Copy-Item -Path "node_modules" -Destination $PackagePath -Recurse -Force

# 複製配置
Write-Host "複製配置檔案..." -ForegroundColor Yellow
Copy-Item -Path "package.json","web.config",".env.example" -Destination $PackagePath -Force

# 複製資料庫遷移
Write-Host "複製資料庫遷移..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "$PackagePath\src\server\database" -Recurse -Force | Out-Null
Copy-Item -Path "src\server\database\migrations" -Destination "$PackagePath\src\server\database" -Recurse -Force

# 複製文件
Write-Host "複製文件..." -ForegroundColor Yellow
Copy-Item -Path "*.md" -Destination $PackagePath -Force
Copy-Item -Path "docs" -Destination $PackagePath -Recurse -Force -ErrorAction SilentlyContinue

# 壓縮
Write-Host "壓縮套件..." -ForegroundColor Yellow
Compress-Archive -Path "$PackagePath\*" -DestinationPath "$PackagePath.zip" -Force

Write-Host ""
Write-Host "✅ 完成!" -ForegroundColor Green
Write-Host "套件位置: $PackagePath.zip" -ForegroundColor Cyan
```

---

## 📦 打包完成後的檢查清單

確認套件包含以下內容：

```
EcoBoard-Deploy/
├── dist/                          ✅ 後端建置檔案
├── client/
│   └── build/                     ✅ 前端建置檔案
├── node_modules/                  ✅ Node.js 依賴
├── src/
│   └── server/
│       └── database/
│           └── migrations/        ✅ 資料庫遷移檔案
├── docs/                          ✅ 文件目錄
├── package.json                   ✅
├── web.config                     ✅
├── .env.example                   ✅
├── README.md                      ✅
├── PACKAGE_DEPLOYMENT_GUIDE.md    ✅
├── DEPLOYMENT_CHECKLIST.md        ✅
└── QUICK_DEPLOY_GUIDE.md          ✅
```

---

## 🚀 傳送到目標伺服器

### 方式 1: 網路共享
```powershell
Copy-Item "EcoBoard-Deploy.zip" "\\target-server\share\deployments\"
```

### 方式 2: 遠端桌面
1. 連線到目標伺服器
2. 在本機和遠端之間複製貼上 ZIP 檔案

### 方式 3: USB 隨身碟
將 ZIP 檔案複製到 USB 隨身碟

---

## 📝 在目標伺服器上的部署步驟

### 1. 解壓縮套件
```powershell
# 解壓縮到目標位置
Expand-Archive -Path "EcoBoard-Deploy.zip" -DestinationPath "C:\inetpub\wwwroot\EcoBoard"
```

### 2. 設定環境變數
```powershell
cd C:\inetpub\wwwroot\EcoBoard
Copy-Item .env.example .env
notepad .env
```

修改必要設定：DB_PASSWORD, JWT_SECRET, LDAP 設定等

### 3. 安裝必要元件（如果尚未安裝）

- IIS
- Node.js (v18+)
- URL Rewrite Module
- iisnode
- PostgreSQL

### 4. 建立資料庫
```sql
CREATE DATABASE ecoboard;
```

### 5. 建立 IIS 網站

**使用 IIS Manager：**
1. 開啟 IIS Manager
2. 右鍵點擊 Sites → Add Website
3. 設定：
   - Site name: EcoBoard
   - Physical path: C:\inetpub\wwwroot\EcoBoard
   - Port: 80

**設定應用程式集區：**
- .NET CLR version: No Managed Code
- Managed pipeline mode: Integrated

### 6. 設定權限
```powershell
# 以管理員執行
icacls "C:\inetpub\wwwroot\EcoBoard" /grant "IIS_IUSRS:(OI)(CI)R" /T
icacls "C:\inetpub\wwwroot\EcoBoard\node_modules" /grant "IIS_IUSRS:(OI)(CI)RX" /T
```

### 7. 重啟 IIS
```powershell
iisreset
```

### 8. 驗證
在瀏覽器開啟: http://localhost

---

## ✅ 完成！

套件打包完成後，就可以輕鬆傳送到目標 IIS 伺服器進行部署了。

詳細部署指南請參考：
- `PACKAGE_DEPLOYMENT_GUIDE.md`
- `DEPLOYMENT_CHECKLIST.md`

**祝您部署順利！** 🎉
