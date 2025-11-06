# EcoBoard 部署準備完成報告

**建立日期**: 2025-11-06  
**專案路徑**: D:\source\EcoBoard  
**狀態**: ✅ 已完成建置，準備部署

---

## 📦 建置狀態

| 項目 | 狀態 | 位置 |
|------|------|------|
| 後端建置 | ✅ 完成 | `dist/` |
| 前端建置 | ✅ 完成 | `client/build/` |
| IIS 配置 | ✅ 就緒 | `web.config` |
| 生產依賴 | ✅ 已安裝 | `node_modules/` |

---

## 📚 部署文件

已為您準備以下部署文件：

### 1. **QUICK_DEPLOY_GUIDE.md** - 快速部署指南 ⚡
- 最快速的部署步驟
- 自動化腳本使用說明
- 常見問題即時排除

### 2. **DEPLOYMENT_CHECKLIST.md** - 完整檢查清單 📋
- 詳細的部署前準備清單
- 環境設定說明
- IIS 配置指南
- 疑難排解手冊

### 3. **deploy-to-iis.ps1** - 自動部署腳本 🤖
- 一鍵部署到 IIS
- 自動設定應用程式集區
- 自動設定檔案權限
- 需要管理員權限執行

### 4. **docs/IIS_DEPLOYMENT.md** - IIS 部署詳細文件 📖
- IIS 完整安裝指南
- 詳細配置說明
- 生產環境建議

---

## 🚀 立即開始部署

### 選項 A: 使用自動化腳本 (推薦) ⚡

這是最快速且最簡單的方式：

```powershell
# 1. 以管理員身份開啟 PowerShell
# 右鍵點擊 PowerShell 圖示 → "以系統管理員身分執行"

# 2. 導航到專案目錄
cd D:\source\EcoBoard

# 3. 執行部署腳本
.\deploy-to-iis.ps1

# 腳本會自動：
# - 檢查建置檔案
# - 建立 IIS 網站
# - 設定應用程式集區
# - 設定檔案權限
# - 重啟 IIS
```

**可選參數**：
```powershell
# 自訂網站名稱
.\deploy-to-iis.ps1 -SiteName "MyEcoBoard"

# 自訂埠號
.\deploy-to-iis.ps1 -Port 8080

# 自訂主機名稱
.\deploy-to-iis.ps1 -HostName "ecoboard.local"

# 組合使用
.\deploy-to-iis.ps1 -SiteName "EcoBoard" -Port 8080 -HostName "ecoboard.mycompany.com"
```

### 選項 B: 手動部署 🔧

如果您想要完全控制部署過程：

1. 📖 開啟 `QUICK_DEPLOY_GUIDE.md`
2. 📝 按照「選項 B: 手動部署」章節執行
3. ✅ 逐步完成每個檢查項目

---

## ⚠️ 部署前必須完成的準備工作

### 1. 安裝 IIS 必要元件

如果還沒安裝，請下載並安裝：

| 元件 | 用途 | 下載連結 |
|------|------|----------|
| **URL Rewrite Module** | URL 重寫規則 | https://www.iis.net/downloads/microsoft/url-rewrite |
| **iisnode** | 在 IIS 上運行 Node.js | https://github.com/Azure/iisnode/releases |

### 2. 建立並設定 .env 檔案

```powershell
# 複製範例檔案
Copy-Item .env.example .env

# 編輯 .env 檔案
notepad .env
```

**必須修改的設定：**

```env
# 資料庫設定
DB_PASSWORD=your_actual_password

# JWT 密鑰（使用強隨機密鑰！）
JWT_SECRET=your_generated_secret_key

# LDAP 設定
LDAP_URL=ldap://your-ldap-server:389
LDAP_BASE_DN=DC=your,DC=domain
LDAP_DOMAIN=your.domain

# AI 服務設定（如果使用）
VLLM_API_URL=http://your-vllm-server:8000/v1
VLLM_API_KEY=your_api_key
```

**生成安全的 JWT 密鑰：**
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. 準備 PostgreSQL 資料庫

```powershell
# 確認 PostgreSQL 服務運行中
Get-Service -Name postgresql*

# 建立資料庫（如果還沒建立）
# 使用 psql 或 pgAdmin 執行：
CREATE DATABASE ecoboard;
```

### 4. 執行資料庫遷移

```powershell
npm run migrate
```

---

## ✅ 部署後驗證

完成部署後，請進行以下驗證：

### 1. 檢查網站是否可訪問

```powershell
# 在瀏覽器中開啟
Start-Process "http://localhost"

# 或測試 API
Invoke-WebRequest -Uri http://localhost/api/health -UseBasicParsing
```

### 2. 檢查日誌

```powershell
# 查看 iisnode 日誌
Get-ChildItem .\iisnode\*.log | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content

# 即時監看日誌
Get-Content .\iisnode\*.log -Wait -Tail 50
```

### 3. 測試核心功能

- [ ] 登入功能 (LDAP 認證)
- [ ] 顯示儀表板
- [ ] 打卡功能
- [ ] 工作項目管理
- [ ] 團隊管理

---

## 🔍 常見問題快速參考

### ❌ 500 Internal Server Error
- **檢查**: iisnode 是否已安裝
- **查看**: `iisnode` 資料夾中的日誌
- **確認**: Node.js 在系統 PATH 中

### ❌ 資料庫連線失敗
- **檢查**: PostgreSQL 服務狀態
- **驗證**: .env 中的資料庫設定
- **測試**: `psql -h localhost -U postgres -d ecoboard`

### ❌ 靜態檔案 404
- **確認**: 前端建置存在 `Test-Path client/build`
- **檢查**: web.config 重寫規則
- **重建**: `cd client && npm run build`

### ❌ LDAP 認證失敗
- **檢查**: LDAP 伺服器可連線性
- **驗證**: LDAP 設定參數
- **測試**: 防火牆是否允許連線

---

## 📞 獲取更多協助

如果遇到問題，請參考：

- 📘 **QUICK_DEPLOY_GUIDE.md** - 快速部署步驟和疑難排解
- 📗 **DEPLOYMENT_CHECKLIST.md** - 完整部署檢查清單
- 📙 **docs/IIS_DEPLOYMENT.md** - IIS 詳細配置文件
- 📕 **docs/API.md** - API 端點文件
- 📔 **docs/QUICKSTART.md** - 快速入門指南

---

## 🎯 下一步行動

1. ✅ **確認已完成所有準備工作**
   - IIS 元件已安裝
   - .env 檔案已設定
   - 資料庫已準備

2. 🚀 **選擇部署方式**
   - 推薦：執行 `.\deploy-to-iis.ps1`
   - 或按照 QUICK_DEPLOY_GUIDE.md 手動部署

3. ✅ **部署後驗證**
   - 測試網站訪問
   - 檢查日誌
   - 測試核心功能

4. 📊 **生產環境準備**
   - 啟用 HTTPS
   - 設定監控
   - 建立備份策略

---

**準備好了嗎？讓我們開始部署！** 🚀

選擇您偏好的部署方式，並祝您部署順利！
