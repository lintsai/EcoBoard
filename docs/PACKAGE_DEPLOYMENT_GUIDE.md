# 📦 EcoBoard 打包部署指南

適用於將 EcoBoard 部署到另一台 IIS 伺服器的情況。

---

## 🎯 使用情境

當您需要將 EcoBoard 部署到：
- 另一台實體伺服器
- 虛擬機器
- 沒有開發環境的生產伺服器
- 無法直接存取原始碼的環境

---

## 📋 在開發機器上的準備步驟

### 1️⃣ 確認專案已建置

```powershell
# 確認建置檔案存在
Test-Path dist               # 應該回傳 True
Test-Path client/build       # 應該回傳 True
```

如果回傳 False，請先建置：

```powershell
# 建置後端
npm run build:server

# 建置前端
cd client
npm run build
cd ..
```

### 2️⃣ 執行打包腳本

```powershell
# 基本用法（會建立在 .\deploy-package\ 目錄）
.\package-for-deployment.ps1

# 指定輸出路徑
.\package-for-deployment.ps1 -OutputPath "D:\Deployments"

# 自訂套件名稱
.\package-for-deployment.ps1 -PackageName "EcoBoard-Production-v1.0"

# 組合使用
.\package-for-deployment.ps1 -OutputPath "D:\Deployments" -PackageName "EcoBoard-Prod"
```

### 3️⃣ 打包腳本會自動完成

- ✅ 檢查建置檔案是否存在
- ✅ 建立打包目錄
- ✅ 複製後端建置檔案 (`dist/`)
- ✅ 複製前端建置檔案 (`client/build/`)
- ✅ 複製 Node.js 依賴 (`node_modules/`)
- ✅ 複製 IIS 配置檔 (`web.config`)
- ✅ 複製資料庫遷移檔案
- ✅ 複製部署文件
- ✅ 建立部署腳本 (`deploy.ps1`)
- ✅ 建立遷移腳本 (`migrate.ps1`)
- ✅ 建立部署說明 (`DEPLOY_README.md`)
- ✅ 壓縮成 ZIP 檔案

### 4️⃣ 打包完成

您會得到：

```
deploy-package/
└── EcoBoard-Deploy-20251106-143025/      # 資料夾
    ├── dist/
    ├── client/build/
    ├── node_modules/
    ├── web.config
    ├── deploy.ps1
    ├── migrate.ps1
    ├── DEPLOY_README.md
    └── ... (其他檔案)

EcoBoard-Deploy-20251106-143025.zip        # 壓縮檔 ⭐
```

---

## 🚚 傳送到目標伺服器

### 方式 1: 網路共享

```powershell
# 複製到網路共享位置
Copy-Item ".\deploy-package\*.zip" "\\target-server\share\deployments\"
```

### 方式 2: 遠端桌面

1. 連線到目標伺服器的遠端桌面
2. 在本機電腦和遠端桌面之間複製貼上 ZIP 檔案

### 方式 3: FTP/SFTP

使用 FTP 客戶端（如 FileZilla）上傳 ZIP 檔案

### 方式 4: USB 隨身碟

將 ZIP 檔案複製到 USB 隨身碟，然後插入目標伺服器

---

## 🖥️ 在目標 IIS 伺服器上的部署步驟

### 前置需求檢查

目標伺服器需要安裝以下元件：

| 元件 | 必要性 | 下載連結 |
|------|--------|----------|
| **IIS** | ✅ 必須 | Windows 功能 |
| **Node.js (v18+)** | ✅ 必須 | https://nodejs.org/ |
| **URL Rewrite Module** | ✅ 必須 | https://www.iis.net/downloads/microsoft/url-rewrite |
| **iisnode** | ✅ 必須 | https://github.com/Azure/iisnode/releases |
| **PostgreSQL** | ✅ 必須 | https://www.postgresql.org/download/ |

### 部署步驟

#### 1️⃣ 解壓縮套件

將 ZIP 檔案解壓縮到目標位置，例如：

```powershell
# 建議位置
C:\inetpub\wwwroot\EcoBoard

# 或其他位置
D:\WebApps\EcoBoard
```

**使用 PowerShell 解壓縮：**

```powershell
# 解壓縮
Expand-Archive -Path ".\EcoBoard-Deploy-20251106-143025.zip" -DestinationPath "C:\inetpub\wwwroot\EcoBoard"

# 進入目錄
cd C:\inetpub\wwwroot\EcoBoard
```

#### 2️⃣ 設定環境變數

```powershell
# 複製範例檔案
Copy-Item .env.example .env

# 編輯 .env 檔案
notepad .env
```

**必須修改的設定：**

```env
# 資料庫設定（根據目標伺服器的資料庫設定）
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecoboard
DB_USER=ecoboard_user
DB_PASSWORD=your_secure_password_here

# JWT 密鑰（使用強隨機密鑰）
JWT_SECRET=your_generated_strong_secret_key_here

# LDAP 設定（根據目標伺服器的 LDAP 設定）
LDAP_URL=ldap://ldap.example.com:389
LDAP_BASE_DN=DC=example,DC=com
LDAP_DOMAIN=example.com

# AI 服務設定（如果使用）
VLLM_API_URL=http://ai-api.example.com:8000/v1
VLLM_API_KEY=your_api_key_here

# 環境設定
NODE_ENV=production
PORT=3000
```

**生成安全的 JWT 密鑰：**

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### 3️⃣ 準備資料庫

```powershell
# 連線到 PostgreSQL
psql -U postgres

# 建立資料庫
CREATE DATABASE ecoboard;

# 建立使用者（如果需要）
CREATE USER ecoboard_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE ecoboard TO ecoboard_user;

# 退出
\q
```

#### 4️⃣ 執行資料庫遷移

```powershell
# 以管理員身份執行 PowerShell
# 在解壓縮的目錄中執行
.\migrate.ps1
```

這會自動執行所有資料庫遷移腳本。

#### 5️⃣ 部署到 IIS

```powershell
# 以管理員身份執行 PowerShell
.\deploy.ps1

# 使用自訂參數
.\deploy.ps1 -SiteName "EcoBoard" -Port 80

# 使用不同埠號
.\deploy.ps1 -Port 8080

# 使用主機名稱
.\deploy.ps1 -HostName "ecoboard.company.com"
```

**部署腳本會自動：**

- 檢查 .env 檔案
- 建立 IIS 應用程式集區
- 建立 IIS 網站
- 設定檔案權限
- 重啟 IIS

#### 6️⃣ 驗證部署

```powershell
# 在瀏覽器中開啟
Start-Process "http://localhost"

# 或測試 API
Invoke-WebRequest -Uri http://localhost/api/health -UseBasicParsing
```

---

## 🔍 疑難排解

### ❌ 問題 1: 部署腳本無法執行

**錯誤訊息**: "無法載入，因為這個系統上已停用指令碼執行"

**解決方式**:

```powershell
# 以管理員身份執行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 然後重新執行部署腳本
.\deploy.ps1
```

### ❌ 問題 2: 500 Internal Server Error

**解決方式**:

1. **檢查 iisnode 日誌**:
   ```powershell
   Get-Content .\iisnode\*.log -Tail 50
   ```

2. **確認 Node.js 安裝**:
   ```powershell
   node --version
   ```

3. **確認 iisnode 已安裝**:
   - 開啟 IIS Manager
   - 檢查是否有 iisnode 圖示

4. **檢查 web.config**:
   - 確認 `path="dist/server.js"` 正確

### ❌ 問題 3: 資料庫連線失敗

**解決方式**:

1. **檢查 PostgreSQL 服務**:
   ```powershell
   Get-Service -Name postgresql*
   ```

2. **測試連線**:
   ```powershell
   psql -h localhost -U postgres -d ecoboard
   ```

3. **檢查防火牆**:
   - 確認 PostgreSQL 埠 (5432) 未被封鎖

4. **驗證 .env 設定**:
   - 檢查資料庫密碼是否正確
   - 檢查資料庫名稱是否正確

### ❌ 問題 4: 找不到模組

**錯誤訊息**: "Cannot find module 'xxx'"

**解決方式**:

```powershell
# 重新安裝生產依賴
npm install --omit=dev

# 或完整安裝
npm install
```

### ❌ 問題 5: 靜態檔案 404

**解決方式**:

1. **確認前端建置存在**:
   ```powershell
   Test-Path client\build
   ```

2. **檢查 web.config 重寫規則**:
   - 確認 `<action type="Rewrite" url="client/build{REQUEST_URI}" />` 存在

3. **檢查檔案權限**:
   ```powershell
   icacls "C:\inetpub\wwwroot\EcoBoard\client\build" /grant "IIS_IUSRS:(OI)(CI)R" /T
   ```

---

## 📊 部署後檢查清單

完成部署後，請確認：

- [ ] 網站可以正常訪問
- [ ] 登入功能正常（LDAP 認證）
- [ ] 資料庫連線正常
- [ ] 靜態資源正常載入（CSS、JS、圖片）
- [ ] API 端點正常回應
- [ ] 日誌檔案可以正常寫入
- [ ] 所有核心功能可以正常使用

---

## 🔒 生產環境額外建議

### 1. 啟用 HTTPS

```powershell
# 在 IIS Manager 中：
# 1. 選擇網站
# 2. 右鍵 → Edit Bindings
# 3. Add → https → 選擇憑證
```

### 2. 設定自動備份

```powershell
# 建立備份腳本
$backupScript = @'
# 備份資料庫
$date = Get-Date -Format "yyyyMMdd-HHmmss"
pg_dump -h localhost -U postgres ecoboard > "D:\Backups\ecoboard-$date.sql"

# 保留最近 30 天的備份
Get-ChildItem "D:\Backups\ecoboard-*.sql" | 
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | 
    Remove-Item
'@

# 設定 Windows 排程工作每天執行
```

### 3. 設定監控

- 使用 Windows Performance Monitor 監控 CPU、記憶體
- 設定日誌檔案大小限制
- 設定錯誤告警

### 4. 效能優化

```powershell
# 在 IIS Manager 中：
# 1. 啟用壓縮（Compression）
# 2. 設定快取標頭（HTTP Response Headers）
# 3. 設定輸出快取（Output Caching）
```

---

## 📝 更新部署

當需要更新應用程式時：

1. 在開發機器上重新打包
2. 傳送新的 ZIP 檔案到目標伺服器
3. 停止 IIS 網站
4. 備份舊版本
5. 解壓縮新版本（覆蓋舊檔案）
6. 保留 .env 檔案（不要覆蓋）
7. 執行資料庫遷移（如果有新的遷移）
8. 重啟 IIS

```powershell
# 停止網站
Stop-Website -Name "EcoBoard"

# 備份
Copy-Item "C:\inetpub\wwwroot\EcoBoard" "D:\Backups\EcoBoard-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Recurse

# 更新檔案（保留 .env）
# ... 解壓縮新版本 ...

# 執行遷移
.\migrate.ps1

# 啟動網站
Start-Website -Name "EcoBoard"
```

---

## 📞 需要協助？

套件內包含的文件：

- **DEPLOY_README.md** - 部署套件說明
- **QUICK_DEPLOY_GUIDE.md** - 快速部署指南
- **DEPLOYMENT_CHECKLIST.md** - 詳細檢查清單
- **docs/IIS_DEPLOYMENT.md** - IIS 完整部署文件

---

**祝您部署順利！** 🎉
