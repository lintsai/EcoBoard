# EcoBoard 文件目錄

本目錄包含 EcoBoard 專案的所有文件。

## 📁 目錄結構

```
docs/
├── README.md                      # 本文件
├── QUICKSTART.md                  # 快速開始指南
├── ARCHITECTURE.md                # 系統架構說明
├── API.md                         # API 文件
├── IIS_DEPLOYMENT.md             # IIS 部署指南
├── ROADMAP.md                     # 專案路線圖
├── TEST_GUIDE.md                  # 測試指南（完整版）
├── QUICK_TEST_GUIDE.md           # 測試指南（快速版）
├── TESTING.md                     # 測試說明
├── DEPLOYMENT_CHECKLIST.md       # 部署檢查清單
├── DEPLOYMENT_READY.md           # 部署準備文件
├── PACKAGE_DEPLOYMENT_GUIDE.md   # 套件部署指南
├── QUICK_DEPLOY_GUIDE.md         # 快速部署指南
├── MANUAL_PACKAGE_GUIDE.md       # 手動打包指南
├── WORKITEMS_FIX_GUIDE.md        # 工作項目修復指南
└── reports/                       # 測試與完成報告
    ├── COMPLETION_REPORT.md       # 完成報告
    ├── FIXES_SUMMARY.md           # 修復總結
    ├── FRONTEND_FIXES_COMPLETED.md # 前端修復完成報告
    ├── IMPROVEMENTS_REPORT.md     # 改進報告
    ├── TEST_EXECUTION_SUMMARY.md  # 測試執行總結
    └── TEST_REPORT_20251105.md    # 測試報告

```

## 📖 文件分類

### 入門文件
- **[QUICKSTART.md](./QUICKSTART.md)** - 快速開始指南，適合第一次使用
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - 系統架構與技術棧說明

### 開發文件
- **[API.md](./API.md)** - 完整的 API 端點文件
- **[ROADMAP.md](./ROADMAP.md)** - 專案開發路線圖

### 測試文件
- **[QUICK_TEST_GUIDE.md](./QUICK_TEST_GUIDE.md)** - 快速測試指南（推薦）
- **[TEST_GUIDE.md](./TEST_GUIDE.md)** - 完整測試指南
- **[TESTING.md](./TESTING.md)** - 測試說明與架構

### 部署文件
- **[QUICK_DEPLOY_GUIDE.md](./QUICK_DEPLOY_GUIDE.md)** - 快速部署指南（推薦）
- **[PACKAGE_DEPLOYMENT_GUIDE.md](./PACKAGE_DEPLOYMENT_GUIDE.md)** - 套件部署指南
- **[MANUAL_PACKAGE_GUIDE.md](./MANUAL_PACKAGE_GUIDE.md)** - 手動打包指南
- **[IIS_DEPLOYMENT.md](./IIS_DEPLOYMENT.md)** - IIS 部署指南
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - 部署前檢查清單
- **[DEPLOYMENT_READY.md](./DEPLOYMENT_READY.md)** - 部署準備狀態

### 維護文件
- **[WORKITEMS_FIX_GUIDE.md](./WORKITEMS_FIX_GUIDE.md)** - 工作項目問題修復指南

### 報告文件
位於 `reports/` 子目錄：
- **測試報告** - 系統測試結果與分析
- **完成報告** - 各階段完成狀態
- **改進報告** - 系統改進與優化記錄

## 🎯 推薦閱讀順序

### 新手入門
1. [QUICKSTART.md](./QUICKSTART.md) - 快速開始
2. [ARCHITECTURE.md](./ARCHITECTURE.md) - 了解系統架構
3. [API.md](./API.md) - API 端點參考

### 測試與驗證
1. [QUICK_TEST_GUIDE.md](./QUICK_TEST_GUIDE.md) - 執行快速測試
2. [TEST_GUIDE.md](./TEST_GUIDE.md) - 深入測試指南

### 部署上線
1. [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) - 部署前檢查
2. [QUICK_DEPLOY_GUIDE.md](./QUICK_DEPLOY_GUIDE.md) - 執行部署
3. [IIS_DEPLOYMENT.md](./IIS_DEPLOYMENT.md) - IIS 特定部署步驟

## 🔧 相關資源

- **PowerShell 腳本**: `../scripts/powershell/`
  - `deploy-to-iis.ps1` - IIS 自動部署腳本
  - `test-api.ps1` - API 測試腳本（互動式）
  - `test-api-safe.ps1` - API 測試腳本（安全版）
  - `run-full-test.ps1` - 完整測試腳本（預設帳號）

- **TypeScript 腳本**: `../scripts/`
  - 各種資料庫遷移和管理腳本

## 📝 文件貢獻

如需更新文件，請確保：
1. 使用清晰的標題和結構
2. 提供實際可用的範例
3. 敏感資訊（IP、帳號密碼）使用範例值
4. 保持文件的同步更新

## 🔒 安全注意事項

本文件庫中的所有範例使用：
- 範例 IP: `db.example.com`, `ldap.example.com`, `ai-api.example.com`
- 範例帳號: `testuser`, `ecoboard_user`
- 範例密碼: `testpassword`, `your_secure_password_here`
- 範例網域: `example.com`

**請勿在文件中提交真實的生產環境資訊！**
