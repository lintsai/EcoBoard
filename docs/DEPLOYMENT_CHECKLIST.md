# EcoBoard IIS 部署檢查清單

## ✅ 建置完成

- [x] 前端建置完成 (`client/build`)
- [x] 後端建置完成 (`dist`)
- [x] web.config 已配置

## 📋 部署前準備清單

### 1. IIS 環境檢查

- [ ] IIS 已安裝並啟用
- [ ] URL Rewrite Module 已安裝 ([下載連結](https://www.iis.net/downloads/microsoft/url-rewrite))
- [ ] iisnode 已安裝 ([下載連結](https://github.com/Azure/iisnode/releases))
- [ ] Node.js 已安裝 (建議 v18 或以上)

### 2. 資料庫設定

- [ ] PostgreSQL 已安裝並運行
- [ ] 已建立資料庫 `ecoboard`
- [ ] 已配置資料庫使用者權限
- [ ] 已執行資料庫遷移 (`npm run migrate`)

### 3. 環境變數設定

在專案根目錄建立 `.env` 檔案，包含以下設定：

```env
# 資料庫設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecoboard
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# LDAP 設定
LDAP_URL=ldap://your-ldap-server:389
LDAP_BASE_DN=DC=example,DC=com
LDAP_DOMAIN=example.com

# AI 服務設定
VLLM_API_URL=http://your-vllm-server:8000/v1
VLLM_API_KEY=your_api_key

# JWT 密鑰
JWT_SECRET=your_secret_key_here_change_in_production

# 伺服器設定
PORT=3000
NODE_ENV=production
```

### 4. IIS 網站配置

#### 方式一：使用 IIS Manager (圖形介面)

1. 開啟 IIS Manager
2. 右鍵點擊 "Sites" → "Add Website"
3. 設定：
   - **Site name**: EcoBoard
   - **Physical path**: `D:\source\EcoBoard` (或您的專案路徑)
   - **Binding**: 
     - Type: http
     - IP address: All Unassigned
     - Port: 80 (或其他埠，例如 8080)
     - Host name: (可選，例如 ecoboard.local)

4. 設定應用程式集區：
   - 右鍵點擊新建的網站 → "Manage Website" → "Advanced Settings"
   - 點擊 Application Pool 旁的 "EcoBoard"
   - 在 Application Pool 視窗中，右鍵點擊 "EcoBoard" → "Basic Settings"
   - 設定：
     - **.NET CLR Version**: No Managed Code
     - **Managed Pipeline Mode**: Integrated

#### 方式二：使用 PowerShell (需要管理員權限)

執行 `deploy-to-iis.ps1` 腳本（已為您準備好）

### 5. 檔案權限設定

以管理員權限執行：

```powershell
# 給予 IIS_IUSRS 讀取權限
icacls "D:\source\EcoBoard" /grant "IIS_IUSRS:(OI)(CI)R" /T

# 給予 node_modules 執行權限
icacls "D:\source\EcoBoard\node_modules" /grant "IIS_IUSRS:(OI)(CI)RX" /T
```

### 6. 測試部署

1. 重啟 IIS：
   ```powershell
   iisreset
   ```

2. 瀏覽器訪問：`http://localhost` 或 `http://your-server-ip`

3. 檢查日誌：
   - IIS 日誌: `C:\inetpub\logs\LogFiles`
   - iisnode 日誌: `D:\source\EcoBoard\iisnode`

## 🔧 疑難排解

### 問題 1: 500 Internal Server Error

**可能原因：**
- iisnode 未正確安裝
- web.config 配置錯誤
- Node.js 路徑問題

**解決方式：**
1. 檢查 iisnode 日誌 (`iisnode` 資料夾)
2. 確認 Node.js 在系統 PATH 中
3. 重新安裝 iisnode

### 問題 2: 找不到模組錯誤

**解決方式：**
```powershell
# 確保在專案根目錄
cd D:\source\EcoBoard
npm install --production
```

### 問題 3: 資料庫連線失敗

**解決方式：**
1. 檢查 PostgreSQL 服務是否運行
2. 確認 `.env` 檔案中的資料庫設定
3. 測試資料庫連線：
   ```powershell
   psql -h localhost -U your_db_user -d ecoboard
   ```

### 問題 4: 靜態檔案 404

**解決方式：**
1. 確認前端已建置：`Test-Path client/build`
2. 檢查 web.config 的 rewrite 規則
3. 確認檔案權限

### 問題 5: LDAP 認證失敗

**解決方式：**
1. 確認 LDAP 伺服器可連線
2. 檢查防火牆設定
3. 測試 LDAP 連線

## 📊 監控與維護

### 日誌位置

- **IIS 日誌**: `C:\inetpub\logs\LogFiles\W3SVC*`
- **iisnode 日誌**: `D:\source\EcoBoard\iisnode`
- **應用程式日誌**: Windows Event Viewer → Application

### 效能監控

使用 Windows Performance Monitor 監控：
- CPU 使用率
- 記憶體使用率
- 請求回應時間

### 定期維護

- 定期檢查並清理日誌檔案
- 定期更新 npm 套件
- 定期備份資料庫
- 檢查安全性更新

## 🔒 生產環境安全建議

1. **啟用 HTTPS**
   - 安裝 SSL 憑證
   - 在 IIS 中配置 HTTPS binding
   - 強制 HTTP 重定向到 HTTPS

2. **更新 JWT_SECRET**
   - 使用強密碼產生器生成長密鑰
   - 定期更換密鑰

3. **資料庫安全**
   - 使用強密碼
   - 限制資料庫存取 IP
   - 定期備份

4. **防火牆設定**
   - 只開放必要的埠
   - 限制管理介面存取

5. **更新與修補**
   - 定期更新 Node.js 和 npm 套件
   - 檢查安全性漏洞：`npm audit`

## 📞 支援資源

- [IIS 部署指南](docs/IIS_DEPLOYMENT.md)
- [快速入門指南](docs/QUICKSTART.md)
- [API 文件](docs/API.md)
- [架構文件](docs/ARCHITECTURE.md)
