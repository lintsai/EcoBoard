# EcoBoard 快速開始指南

## 專案概述

EcoBoard 是一個整合 AI 的團隊工作管理系統，支援：
- ✅ LDAP 認證登入
- ✅ 團隊建立與管理
- ✅ 每日打卡與工作記錄
- ✅ AI 對話式工作項目填寫
- ✅ 智能工作分配與站立會議
- ✅ 工作進度追蹤與每日總結
- ✅ PostgreSQL 資料庫
- ✅ vLLM API 整合
- ✅ IIS 部署支援

## 系統架構

```
EcoBoard/
├── src/server/          # Node.js + Express 後端
│   ├── routes/          # API 路由
│   ├── services/        # 業務邏輯層
│   ├── middleware/      # 中介層
│   └── database/        # 資料庫設定
├── client/              # React + TypeScript 前端
│   └── src/
│       ├── pages/       # 頁面組件
│       ├── services/    # API 服務
│       └── App.tsx      # 主應用
├── docs/                # 文件
└── web.config           # IIS 設定
```

## 環境需求

### 開發環境
- Node.js 18+
- PostgreSQL 12+
- LDAP 伺服器
- vLLM API 服務

### 生產環境（IIS）
- Windows Server 2016+ 或 Windows 10/11
- IIS 10+
- URL Rewrite Module
- iisnode

## 安裝步驟

### 1. 克隆專案

```powershell
git clone <repository-url>
cd EcoBoard
```

### 2. 安裝後端依賴

```powershell
npm install
```

### 3. 安裝前端依賴

```powershell
cd client
npm install
cd ..
```

### 4. 設定環境變數

複製 `.env.example` 為 `.env` 並修改：

```env
# 資料庫設定
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ecoboard
DB_USER=postgres
DB_PASSWORD=your_password

# LDAP 設定
LDAP_URL=ldap://your-ldap-server:389
LDAP_BIND_DN=cn=admin,dc=example,dc=com
LDAP_BIND_PASSWORD=your_ldap_password
LDAP_SEARCH_BASE=ou=users,dc=example,dc=com
LDAP_SEARCH_FILTER=(uid={{username}})

# vLLM API 設定
VLLM_API_URL=http://localhost:8000/v1
VLLM_API_KEY=your_api_key
VLLM_MODEL_NAME=your_model_name

# JWT 密鑰（請更換為強密碼）
JWT_SECRET=your_secure_secret_key_here
JWT_EXPIRES_IN=24h

# 伺服器設定
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
```

### 5. 建立資料庫

在 PostgreSQL 中建立資料庫：

```sql
CREATE DATABASE ecoboard;
```

### 6. 執行資料庫遷移

```powershell
npm run migrate
```

### 7. 啟動開發伺服器

```powershell
# 同時啟動前後端
npm run dev

# 或分別啟動
npm run server:dev  # 後端 (port 3000)
npm run client:dev  # 前端 (port 3001)
```

### 8. 訪問應用

開啟瀏覽器訪問：`http://localhost:3001`

## 使用流程

### 1. 登入
使用 LDAP 帳號密碼登入系統

### 2. 選擇或建立團隊
- 首次使用需要建立團隊
- 管理員可以新增團隊成員

### 3. 早上打卡
進入儀表板 → 點擊「早上打卡」

### 4. 填寫工作項目
使用 AI 對話輔助填寫今日工作計劃：
```
使用者：今天要完成用戶登入功能和修復 bug #123
AI：了解！請問這兩個任務的優先順序如何？預計各需要多少時間？
使用者：登入功能優先，預計 4 小時。bug 修復 2 小時
AI：好的！還有其他工作項目嗎？或是有依賴關係需要說明的？
```

### 5. 站立會議 Review
當團隊所有成員完成工作項目填寫後：
- 管理員進入「站立會議 Review」
- AI 會自動分析所有工作項目
- 提供合理的工作分配建議
- 顯示執行順序和注意事項
- 點擊「完成 Review」

### 6. 工作期間
正常進行工作開發

### 7. 更新工作進度
下班前進入「更新工作進度」：
- 選擇早上規劃的工作項目
- 填寫實際完成狀況
- AI 會協助整理更新內容

### 8. 查看每日總結
AI 自動產生每日總結：
- 今日完成項目總覽
- 進度評估
- 遇到的問題
- 明日建議

## API 端點

### 認證
- `POST /api/auth/login` - LDAP 登入
- `GET /api/auth/verify` - 驗證 token

### 團隊管理
- `GET /api/teams` - 取得使用者團隊列表
- `POST /api/teams` - 建立新團隊
- `GET /api/teams/:teamId` - 取得團隊詳情
- `GET /api/teams/:teamId/members` - 取得團隊成員
- `POST /api/teams/:teamId/members` - 新增團隊成員

### 打卡
- `POST /api/checkin` - 打卡
- `GET /api/checkin/team/:teamId/today` - 取得今日團隊打卡記錄

### 工作項目
- `POST /api/workitems` - 建立工作項目
- `GET /api/workitems/today` - 取得今日工作項目
- `GET /api/workitems/team/:teamId/today` - 取得團隊今日工作項目
- `POST /api/workitems/:itemId/updates` - 新增工作更新

### AI 功能
- `POST /api/ai/chat` - AI 對話
- `POST /api/ai/analyze-workitems` - 分析工作項目
- `POST /api/ai/distribute-tasks` - 智能分配任務
- `POST /api/ai/standup/review` - 完成站立會議 Review
- `GET /api/ai/standup/team/:teamId/today` - 取得今日站立會議
- `POST /api/ai/daily-summary` - 產生每日總結

## 部署到 IIS

詳見 [IIS_DEPLOYMENT.md](./IIS_DEPLOYMENT.md)

簡要步驟：
1. 安裝 IIS、URL Rewrite、iisnode
2. 建置應用程式：`npm run build`
3. 設定 `.env` 為生產環境
4. 在 IIS 中建立網站
5. 設定 web.config
6. 重啟 IIS

## 常見問題

### Q: LDAP 連線失敗
**A:** 檢查以下項目：
- LDAP 伺服器是否可連線
- LDAP_URL、LDAP_BIND_DN、LDAP_BIND_PASSWORD 是否正確
- 防火牆是否允許 LDAP 連接埠（預設 389）

### Q: vLLM API 呼叫失敗
**A:** 確認：
- vLLM 服務是否運行
- VLLM_API_URL 是否正確
- VLLM_API_KEY 是否有效
- 網路是否可連線到 vLLM 服務

### Q: 資料庫連線錯誤
**A:** 檢查：
- PostgreSQL 服務是否啟動
- 資料庫是否已建立
- DB_* 環境變數是否正確
- 防火牆設定

### Q: 前端無法連接後端
**A:** 確認：
- 後端伺服器是否運行（port 3000）
- CORS 設定是否正確
- FRONTEND_URL 環境變數是否正確

## 開發建議

### 程式碼規範
- 使用 TypeScript 的型別定義
- 遵循 ESLint 規則
- 保持程式碼簡潔可讀

### 測試
```powershell
# 執行測試（待實作）
npm test
```

### Git 工作流程
```powershell
# 建立功能分支
git checkout -b feature/new-feature

# 提交變更
git add .
git commit -m "feat: add new feature"

# 推送到遠端
git push origin feature/new-feature
```

## 資源連結

- [Express 文件](https://expressjs.com/)
- [React 文件](https://react.dev/)
- [PostgreSQL 文件](https://www.postgresql.org/docs/)
- [LDAP.js 文件](http://ldapjs.org/)
- [IIS 文件](https://docs.microsoft.com/en-us/iis/)

## 授權

MIT License

## 聯絡方式

如有問題或建議，請聯絡開發團隊。
