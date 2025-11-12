# Issue #6 完成報告 - 帳號標準化

## ✅ 已完成的工作

### 1. 修正資料庫遷移腳本
**檔案**: `src/server/database/migrate.ts`
- **問題**: ts-node 執行時未載入 `.env` 環境變數
- **解決**: 新增 `dotenv.config()` 確保環境變數正確載入
- **結果**: ✓ Migration completed successfully

### 2. 實作帳號標準化功能

#### 修改的檔案:

1. **`src/server/services/ldap.service.ts`**
   - 新增 `normalizeUsername()` 函數
   - 處理 email 格式（移除 @domain.com）
   - 統一轉換為小寫
   - 更新 `authenticateLDAP()` 和 `tryBind()` 使用標準化帳號

2. **`src/server/services/user.service.ts`**
   - `createOrGetUser()`: 使用 `LOWER(username)` 進行大小寫不敏感查詢
   - `getUserByUsername()`: 使用 `LOWER(username)` 進行大小寫不敏感查詢
   - 儲存時統一轉為小寫

3. **`src/server/routes/auth.routes.ts`**
   - 新增註解說明 username 會在 authenticateLDAP 中標準化

4. **`src/server/database/migrations/007_normalize_usernames.sql`**
   - 標準化現有資料庫中的使用者名稱
   - 建立唯一索引 `idx_users_username_lower` 防止大小寫重複

### 3. 建立文件
- `docs/USERNAME_NORMALIZATION.md`: 詳細的實作說明文件
- `scripts/test-username-normalization.ts`: 測試腳本

## 🎯 功能說明

使用者現在可以用以下任何格式登入，系統都會將其標準化為小寫帳號：

| 輸入格式 | 標準化結果 | 說明 |
|---------|-----------|------|
| `john` | `john` | 小寫 |
| `JOHN` | `john` | 大寫轉小寫 |
| `John` | `john` | 混合轉小寫 |
| `john@example.com` | `john` | 移除 domain |
| `JOHN@example.com` | `john` | 大寫 + domain |
| `John@EXAMPLE.COM` | `john` | 混合 + domain |

## 🧪 測試方式

### 方法 1: 使用現有的測試腳本（推薦）

```powershell
# 啟動伺服器
npm run dev

# 在另一個終端執行測試
.\scripts\powershell\test-api-safe.ps1
```

在測試時嘗試以下組合：
1. 用小寫帳號登入
2. 用大寫帳號登入
3. 用混合大小寫登入
4. 用完整 email 格式登入（username@domain）

### 方法 2: 使用 Postman 或 curl 手動測試

```powershell
# 測試 1: 小寫帳號
curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"john\",\"password\":\"your_password\"}'

# 測試 2: 大寫帳號（應該返回相同使用者）
curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"JOHN\",\"password\":\"your_password\"}'

# 測試 3: Email 格式
curl -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"username\":\"john@example.com\",\"password\":\"your_password\"}'
```

### 方法 3: 前端登入測試

```powershell
npm run dev
```

開啟 http://localhost:3001 並嘗試：
- 用不同大小寫登入
- 用 email 格式登入
- 檢查登入後顯示的使用者名稱是否統一為小寫

## 📊 資料庫變更

遷移腳本已執行，資料庫已包含：
1. 現有使用者名稱已標準化為小寫
2. 已建立唯一索引 `idx_users_username_lower`

可以透過以下查詢確認：
```sql
-- 查看索引
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'users' 
AND indexname = 'idx_users_username_lower';

-- 查看所有使用者（確認都是小寫）
SELECT id, username, display_name 
FROM users 
ORDER BY id;
```

## ⚠️ 注意事項

1. **向後兼容**: 現有帳號已自動標準化，不影響現有使用者登入
2. **LDAP 認證**: 仍使用原始輸入進行 LDAP 綁定驗證，只在儲存到資料庫時標準化
3. **唯一性保證**: 資料庫索引確保不會有大小寫不同的重複帳號
4. **顯示名稱**: 目前 displayName 也使用標準化後的小寫帳號，如需要可以另外處理

## 📝 相關檔案清單

### 核心功能
- `src/server/services/ldap.service.ts` - LDAP 認證與帳號標準化
- `src/server/services/user.service.ts` - 使用者資料庫操作
- `src/server/routes/auth.routes.ts` - 認證路由
- `src/server/database/migrate.ts` - 資料庫遷移執行器（修正 dotenv）
- `src/server/database/migrations/007_normalize_usernames.sql` - 標準化遷移腳本

### 文件與測試
- `docs/USERNAME_NORMALIZATION.md` - 詳細技術文件
- `scripts/test-username-normalization.ts` - 測試腳本
- `docs/ISSUE_6_COMPLETION.md` - 本文件

## ✅ 狀態

- [x] LDAP 服務標準化
- [x] 使用者服務大小寫不敏感
- [x] 資料庫遷移腳本
- [x] 修正 migrate.ts dotenv 問題
- [x] 執行遷移成功
- [x] 建立文件
- [ ] 實際登入測試（待用戶驗證）

## 🚀 下一步

1. 啟動應用程式: `npm run dev`
2. 測試不同格式登入
3. 確認所有格式都能正常登入
4. 確認帳號顯示統一為小寫

---

**完成日期**: 2025-11-12
**Issue**: #6
**狀態**: ✅ 實作完成，待測試驗證
