# EcoBoard 架構文檔

## 整體架構

```
┌─────────────────────────────────────────────────────────────┐
│                        IIS Server                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            URL Rewrite Module                         │  │
│  │  ┌─────────────────┐  ┌──────────────────────────┐  │  │
│  │  │  /api/*         │  │  /* (其他所有路徑)       │  │  │
│  │  │  → Node.js      │  │  → Static Files          │  │  │
│  │  └────────┬────────┘  └──────────┬───────────────┘  │  │
│  └───────────┼────────────────────────┼──────────────────┘  │
│              │                        │                      │
│  ┌───────────▼────────────┐  ┌────────▼──────────────────┐ │
│  │      iisnode           │  │   Static Content          │ │
│  │  dist/server.js        │  │   client/build/*          │ │
│  │  (Express API)         │  │   (React SPA)             │ │
│  └───────────┬────────────┘  └───────────────────────────┘ │
└──────────────┼──────────────────────────────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───▼─────────┐  ┌───────▼────────┐  ┌──────────────┐
│ PostgreSQL  │  │      LDAP      │  │  vLLM API    │
│ :5432       │  │      :389      │  │  :8001       │
└─────────────┘  └────────────────┘  └──────────────┘
```

## 技術選型說明

### 為什麼選擇 Node.js + IIS？

#### ✅ **適合的場景（您的情況）**

1. **內部企業系統**
   - 不需要處理大量公網流量
   - 主要服務團隊內部使用
   - 可控的用戶數量和負載

2. **快速開發與迭代**
   - Node.js 生態系統豐富
   - JavaScript/TypeScript 全棧統一
   - 易於維護和擴展

3. **既有基礎設施整合**
   - 公司已有 IIS 伺服器
   - 需要與 LDAP/AD 整合
   - PostgreSQL 資料庫已部署

#### ⚠️ **需要注意的限制**

1. **效能考量**
   - Node.js 單執行緒，適合 I/O 密集型
   - 不適合 CPU 密集型運算
   - iisnode 會有輕微效能損失（相比直接運行）

2. **部署複雜度**
   - 需要安裝 Node.js runtime
   - 需要配置 iisnode 模組
   - 需要管理 npm 套件

3. **穩定性**
   - Node.js 記憶體洩漏需監控
   - 需要適當的錯誤處理和重啟機制

---

## 架構優勢

### 1. **分層架構**
```
Client (React)
    ↓
API Routes (Express)
    ↓
Service Layer (Business Logic)
    ↓
Data Layer (PostgreSQL)
```

### 2. **外部整合**
- **LDAP 認證**：企業級單點登入
- **vLLM API**：AI 功能擴展
- **PostgreSQL**：可靠的資料持久化

### 3. **安全性**
- JWT Token 認證
- LDAP 密碼不存儲
- HTTPS 加密（生產環境）
- Helmet.js 安全頭
- CORS 跨域保護

---

## 效能優化建議

### IIS 層級

1. **啟用壓縮**
```xml
<httpCompression>
  <dynamicTypes>
    <add mimeType="application/json" enabled="true"/>
  </dynamicTypes>
</httpCompression>
```

2. **配置快取**
```xml
<staticContent>
  <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="30.00:00:00" />
</staticContent>
```

3. **Application Pool 設定**
- 定期回收（避免記憶體洩漏）
- 適當的最大記憶體限制
- CPU 使用率監控

### Node.js 層級

1. **使用 PM2 管理**（建議替代 iisnode）
```bash
npm install -g pm2
pm2 start dist/server.js -i max  # 多執行個體
```

2. **啟用叢集模式**
```javascript
// 在 server.js 中
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  // 啟動 Express app
}
```

3. **資料庫連接池優化**
```javascript
// 已在 pool.ts 中配置
max: 20,           // 最大連接數
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 2000
```

---

## 替代方案比較

| 方案 | 優點 | 缺點 | 建議使用場景 |
|-----|-----|-----|------------|
| **Node.js + iisnode** (目前) | 快速開發、豐富生態 | 需要額外配置 | 內部系統、快速迭代 |
| **.NET Core** | IIS 原生支援、高效能 | 需重寫代碼 | 大型企業應用 |
| **Node.js + Nginx** | 效能最佳、配置靈活 | 非 Windows 生態 | 雲端部署 |
| **Serverless (Azure Functions)** | 自動擴展、無需管理 | 冷啟動、成本高 | 間歇性負載 |

---

## 監控與維護

### 1. **日誌管理**
- IIS 日誌：`C:\inetpub\logs\LogFiles`
- iisnode 日誌：應用程式根目錄 `\iisnode`
- Application 日誌：使用 Winston 或 Morgan

### 2. **健康檢查**
```javascript
// 已實作在 src/server/index.ts
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
```

### 3. **錯誤追蹤**
- 集中式錯誤處理中介層
- 考慮使用 Sentry 或 Application Insights

---

## 結論

**目前的 Node.js + IIS 架構完全適合您的需求**，因為：

✅ 您的系統是內部使用
✅ 需要快速開發和迭代
✅ 公司已有 IIS 基礎設施
✅ 需要整合 LDAP 和 PostgreSQL

**不建議改用 .NET**，除非：
- 預期有大量並發用戶（>1000 同時在線）
- 需要極致效能優化
- 團隊更熟悉 C#

**唯一建議的改進**：
考慮在生產環境使用 **PM2 + IIS 反向代理** 而不是 iisnode，這樣可以獲得更好的進程管理和效能。
