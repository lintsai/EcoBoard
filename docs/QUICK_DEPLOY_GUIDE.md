# 🚀 EcoBoard 快速部署指南

## 當前狀態

✅ **建置完成** - 專案已成功建置，準備部署！

- 後端建置檔案: `dist/` 
- 前端建置檔案: `client/build/`
- IIS 配置檔案: `web.config`

## 快速部署步驟

### 選項 A: 使用自動化腳本（推薦）⚡

```powershell
# 1. 以管理員身份開啟 PowerShell
# 2. 導航到專案目錄
cd D:\source\EcoBoard

# 3. 執行部署腳本
.\deploy-to-iis.ps1

# 可選參數:
# -SiteName "自訂網站名稱"
# -Port "8080"
# -HostName "ecoboard.local"
```

### 選項 B: 手動部署 🔧

#### 1️⃣ 安裝 IIS 必要元件

如果尚未安裝，請下載並安裝：

- **URL Rewrite Module**: https://www.iis.net/downloads/microsoft/url-rewrite
- **iisnode**: https://github.com/Azure/iisnode/releases

#### 2️⃣ 建立 .env 檔案

```powershell
# 複製範例檔案
Copy-Item .env.example .env

# 使用記事本編輯 .env
notepad .env
```

**必須修改的設定：**
- `DB_PASSWORD`: 資料庫密碼
- `JWT_SECRET`: 使用強密鑰（可使用下方命令生成）
- `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_DOMAIN`: 根據您的 LDAP 伺服器設定

生成安全的 JWT_SECRET：
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### 3️⃣ 在 IIS Manager 中建立網站

1. 開啟 **IIS Manager**
2. 展開伺服器節點
3. 右鍵點擊 **Sites** → **Add Website**
4. 填寫：
   - Site name: `EcoBoard`
   - Physical path: `D:\source\EcoBoard`
   - Port: `80` (或其他可用埠)
5. 點擊 **OK**

#### 4️⃣ 設定應用程式集區

1. 在 IIS Manager 中點擊 **Application Pools**
2. 找到 **EcoBoard** 應用程式集區
3. 右鍵點擊 → **Basic Settings**
4. 設定：
   - .NET CLR version: **No Managed Code**
   - Managed pipeline mode: **Integrated**
5. 點擊 **OK**

#### 5️⃣ 設定檔案權限

以管理員身份執行：

```powershell
# 給予 IIS_IUSRS 讀取權限
icacls "D:\source\EcoBoard" /grant "IIS_IUSRS:(OI)(CI)R" /T

# 給予 node_modules 執行權限
icacls "D:\source\EcoBoard\node_modules" /grant "IIS_IUSRS:(OI)(CI)RX" /T
```

#### 6️⃣ 執行資料庫遷移

```powershell
npm run migrate
```

#### 7️⃣ 重啟 IIS

```powershell
iisreset
```

## 測試部署

### 1. 檢查網站狀態

在瀏覽器中開啟：`http://localhost` (或您設定的埠號)

您應該會看到 EcoBoard 登入頁面。

### 2. 檢查後端 API

```powershell
# 測試健康檢查端點
Invoke-WebRequest -Uri http://localhost/api/health -UseBasicParsing
```

### 3. 查看日誌

如果遇到問題，檢查日誌檔案：

- **iisnode 日誌**: `D:\source\EcoBoard\iisnode\`
- **IIS 日誌**: `C:\inetpub\logs\LogFiles\`

```powershell
# 即時監看 iisnode 日誌
Get-Content .\iisnode\*.log -Wait -Tail 50
```

## 常見問題排除 🔍

### ❌ 問題: 500 Internal Server Error

**原因**: iisnode 未正確配置

**解決方式**:
1. 確認 iisnode 已安裝
2. 檢查 Node.js 是否在系統 PATH 中
3. 查看 iisnode 日誌檔案

### ❌ 問題: 找不到模組

**解決方式**:
```powershell
npm install --production
```

### ❌ 問題: 資料庫連線失敗

**解決方式**:
1. 檢查 PostgreSQL 是否運行:
   ```powershell
   Get-Service -Name postgresql*
   ```
2. 確認 .env 中的資料庫設定
3. 測試連線:
   ```powershell
   psql -h localhost -U postgres -d ecoboard
   ```

### ❌ 問題: 靜態檔案 404

**解決方式**:
1. 確認前端已建置: `Test-Path client/build`
2. 檢查 web.config 的 rewrite 規則
3. 重新建置前端: `cd client && npm run build`

### ❌ 問題: LDAP 認證失敗

**解決方式**:
1. 檢查 LDAP 伺服器是否可連線
2. 確認防火牆允許 LDAP 連線 (port 389)
3. 驗證 LDAP 設定參數

## 進階設定 ⚙️

### 啟用 HTTPS

1. 在 IIS Manager 中，選擇您的網站
2. 右鍵點擊 → **Edit Bindings**
3. 點擊 **Add**
4. 選擇 Type: **https**
5. 選擇您的 SSL 憑證
6. 點擊 **OK**

### 效能優化

在 IIS Manager 中：

1. **啟用壓縮**:
   - 伺服器 → Compression
   - 勾選 "Enable dynamic content compression"

2. **設定快取**:
   - 網站 → HTTP Response Headers
   - 新增 Cache-Control header

### 監控設定

```powershell
# 啟用詳細日誌
# 在 .env 中設定
VERBOSE_LOGGING=true
```

## 生產環境檢查清單 ✅

部署到生產環境前，請確認：

- [ ] 使用強 JWT_SECRET
- [ ] 資料庫密碼安全
- [ ] 啟用 HTTPS
- [ ] 設定防火牆規則
- [ ] 設定定期資料庫備份
- [ ] 設定監控和告警
- [ ] 更新所有依賴套件: `npm update`
- [ ] 執行安全性檢查: `npm audit`
- [ ] 測試所有核心功能
- [ ] 準備災難復原計畫

## 維護與更新 🔄

### 更新應用程式

```powershell
# 1. 拉取最新程式碼
git pull

# 2. 安裝依賴
npm install

# 3. 重新建置
npm run build

# 4. 執行遷移（如有）
npm run migrate

# 5. 重啟 IIS
iisreset
```

### 備份

```powershell
# 備份資料庫
pg_dump -h localhost -U postgres ecoboard > backup_$(Get-Date -Format "yyyyMMdd_HHmmss").sql

# 備份應用程式
Compress-Archive -Path D:\source\EcoBoard -DestinationPath D:\backups\EcoBoard_$(Get-Date -Format "yyyyMMdd_HHmmss").zip
```

## 需要協助？ 📚

- 詳細部署指南: [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- IIS 部署文件: [docs/IIS_DEPLOYMENT.md](docs/IIS_DEPLOYMENT.md)
- API 文件: [docs/API.md](docs/API.md)
- 快速入門: [docs/QUICKSTART.md](docs/QUICKSTART.md)

---

**祝您部署順利！** 🎉
