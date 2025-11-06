# EcoBoard - 團隊工作管理系統

## 📝 系統功能
- LDAP 帳號登錄
- 團隊選擇與管理
- 每日工作打卡
- AI 對談式工作項目填寫
- 工作項目智能分析與分配
- 每日站立會議 Review
- 工作進度更新與回報
- PostgreSQL 資料庫
- vLLM API 串接

## 🛠️ 技術棧
- **後端**: Node.js + Express + TypeScript
- **前端**: React + TypeScript + Vite
- **資料庫**: PostgreSQL
- **認證**: LDAP
- **AI**: vLLM API
- **部署**: IIS / Node.js

## 📁 專案結構
```
EcoBoard/
├── client/                 # 前端專案
│   ├── src/               # React 原始碼
│   └── build/             # 前端建置輸出
├── src/                   # 後端原始碼
│   └── server/            # Express 伺服器
├── dist/                  # 後端建置輸出
├── scripts/               # 自動化腳本
│   ├── powershell/        # PowerShell 腳本（部署、測試）
│   └── *.ts               # TypeScript 工具腳本
├── docs/                  # 完整文件
│   ├── README.md          # 文件索引
│   ├── reports/           # 測試與完成報告
│   ├── QUICKSTART.md      # 快速開始
│   ├── API.md             # API 文件
│   ├── TEST_GUIDE.md      # 測試指南
│   └── *.md               # 其他指南
└── deploy-package/        # 部署套件輸出
```

## 🚀 快速開始

### 安裝依賴
```bash
# 安裝後端依賴
npm install

# 安裝前端依賴
cd client
npm install
cd ..
```

### 設定環境變數
```bash
# 複製範例環境變數檔案
cp .env.example .env

# 編輯 .env 檔案，設定以下必要變數：
# - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
# - JWT_SECRET
# - LDAP_URL, LDAP_BASE_DN, LDAP_DOMAIN
# - VLLM_API_URL (選用)
```

### 執行資料庫遷移
```bash
npm run migrate
```

### 啟動開發伺服器
```bash
# 方法 1: 同時啟動前後端
npm run dev

# 方法 2: 分別啟動
npm run dev:server  # 後端: http://localhost:3000
npm run dev:client  # 前端: http://localhost:3001
```

## 📦 建置與部署

### 建置專案
```bash
# 建置前後端
npm run build:all

# 或分別建置
npm run build:server  # 建置後端到 dist/
npm run build:client  # 建置前端到 client/build/
```

### 部署到 IIS
```powershell
# 1. 建置專案
npm run build:all

# 2. 執行部署腳本
.\scripts\powershell\deploy-to-iis.ps1

# 3. 執行資料庫遷移
npm run migrate
```

詳細部署說明請參考：
- **快速部署**: [docs/QUICK_DEPLOY_GUIDE.md](docs/QUICK_DEPLOY_GUIDE.md)
- **IIS 部署**: [docs/IIS_DEPLOYMENT.md](docs/IIS_DEPLOYMENT.md)
- **套件部署**: [docs/PACKAGE_DEPLOYMENT_GUIDE.md](docs/PACKAGE_DEPLOYMENT_GUIDE.md)

## 🧪 測試

### 執行 API 測試
```powershell
# 互動式測試（需要輸入帳號密碼）
.\scripts\powershell\test-api.ps1

# 完整自動化測試（使用預設測試帳號）
.\scripts\powershell\run-full-test.ps1

# 安全版本（輸出到日誌）
.\scripts\powershell\test-api-safe.ps1
```

詳細測試說明請參考：
- **快速測試**: [docs/QUICK_TEST_GUIDE.md](docs/QUICK_TEST_GUIDE.md)
- **完整測試**: [docs/TEST_GUIDE.md](docs/TEST_GUIDE.md)

## 📚 文件

完整文件位於 `docs/` 目錄：

### 入門文件
- [快速開始](docs/QUICKSTART.md) - 新手入門指南
- [系統架構](docs/ARCHITECTURE.md) - 技術架構與設計
- [API 文件](docs/API.md) - 完整 API 端點說明

### 開發與測試
- [快速測試指南](docs/QUICK_TEST_GUIDE.md) - 快速執行測試
- [完整測試指南](docs/TEST_GUIDE.md) - 深入測試說明
- [測試說明](docs/TESTING.md) - 測試架構與策略

### 部署與維護
- [快速部署指南](docs/QUICK_DEPLOY_GUIDE.md) - 快速部署流程
- [IIS 部署指南](docs/IIS_DEPLOYMENT.md) - IIS 特定部署
- [套件部署指南](docs/PACKAGE_DEPLOYMENT_GUIDE.md) - 完整部署流程
- [部署檢查清單](docs/DEPLOYMENT_CHECKLIST.md) - 部署前檢查
- [工作項目修復指南](docs/WORKITEMS_FIX_GUIDE.md) - 問題排查

### 腳本說明
- [腳本目錄說明](scripts/README.md) - 所有自動化腳本使用方法

### 報告
- [測試報告](docs/reports/TEST_REPORT_20251105.md) - 最新測試結果
- [完成報告](docs/reports/COMPLETION_REPORT.md) - 開發完成狀態
- [改進報告](docs/reports/IMPROVEMENTS_REPORT.md) - 系統改進記錄

## 🔧 NPM 腳本

```bash
# 開發
npm run dev              # 同時啟動前後端開發伺服器
npm run dev:server       # 僅啟動後端
npm run dev:client       # 僅啟動前端

# 建置
npm run build:all        # 建置前後端
npm run build:server     # 建置後端
npm run build:client     # 建置前端

# 資料庫
npm run migrate          # 執行資料庫遷移
npm run migrate:create   # 建立新的遷移檔案

# 工具腳本
npm run script:inspect   # 檢查每日總結
npm run script:summary   # 生成每日總結
```

## 🔐 環境變數範例

```env
# 資料庫設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecoboard
DB_USER=ecoboard_user
DB_PASSWORD=your_secure_password

# JWT 設定
JWT_SECRET=your_jwt_secret_key

# LDAP 設定
LDAP_URL=ldap://ldap.example.com:389
LDAP_BASE_DN=DC=example,DC=com
LDAP_DOMAIN=example.com

# AI 服務設定（選用）
VLLM_API_URL=http://ai-api.example.com:8001/v1
VLLM_API_KEY=your_api_key

# 伺服器設定
NODE_ENV=development
PORT=3000
```

## 🛡️ 安全注意事項

1. **敏感資訊**
   - 不要將 `.env` 檔案提交到版本控制
   - 使用強隨機密鑰作為 `JWT_SECRET`
   - 資料庫密碼使用複雜密碼

2. **生產環境**
   - 設定 `NODE_ENV=production`
   - 使用 HTTPS
   - 啟用 CORS 限制
   - 定期更新依賴套件

3. **測試腳本**
   - 測試腳本中的帳號密碼僅供範例
   - 不要在腳本中硬編碼生產環境帳號

## 📄 授權

本專案為內部使用專案。

## 🤝 貢獻

本專案目前為內部開發專案，如有問題請聯繫開發團隊。

## 📞 支援

如需技術支援，請參考：
- [快速開始指南](docs/QUICKSTART.md)
- [常見問題排查](docs/WORKITEMS_FIX_GUIDE.md)
- 或聯繫開發團隊
