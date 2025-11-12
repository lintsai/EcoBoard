# Username Normalization Implementation

## Issue #6 - 帳號標準化處理

### 問題描述
系統需要統一處理大小寫不同和完整email格式的帳號，確保：
1. 使用者可以用不同大小寫登入（例如：`user`, `USER`, `User`）
2. 使用者可以用完整email登入（例如：`user@example.com`）
3. 系統內部統一顯示為小寫帳號（例如：`user`）
4. 避免重複帳號（不同大小寫被視為同一帳號）

### 實作變更

#### 1. LDAP 認證服務 (`src/server/services/ldap.service.ts`)

新增 `normalizeUsername` 函數：
```typescript
function normalizeUsername(username: string): string {
  // 如果包含 @，取 @ 之前的部分
  const usernameWithoutDomain = username.includes('@') 
    ? username.split('@')[0] 
    : username;
  
  // 統一轉換為小寫
  return usernameWithoutDomain.toLowerCase();
}
```

修改 `authenticateLDAP` 函數：
- 在認證前標準化使用者名稱
- 返回標準化後的小寫帳號
- 支援多種輸入格式（大小寫、email格式）

#### 2. 使用者服務 (`src/server/services/user.service.ts`)

修改資料庫查詢為大小寫不敏感：
- `createOrGetUser`: 使用 `LOWER(username)` 比對，儲存時轉為小寫
- `getUserByUsername`: 使用 `LOWER(username)` 比對

#### 3. 資料庫遷移 (`src/server/database/migrations/007_normalize_usernames.sql`)

新增遷移腳本：
- 標準化現有資料庫中的使用者名稱（移除 domain、轉小寫）
- 建立唯一索引防止大小寫重複

### 使用範例

使用者可以用以下任何格式登入（假設帳號為 `john`）：
- `john` ✓
- `JOHN` ✓
- `John` ✓
- `john@example.com` ✓
- `JOHN@example.com` ✓
- `John@EXAMPLE.COM` ✓

所有格式都會被標準化為 `john` 並儲存/顯示。

### 測試

執行遷移並測試登入：
```bash
# 執行資料庫遷移
npm run migrate

# 測試不同格式登入
# 1. 小寫帳號
# 2. 大寫帳號
# 3. 混合大小寫
# 4. 完整 email 格式
```

### 注意事項

1. **向後兼容**：現有帳號會被自動標準化，不影響現有使用者
2. **LDAP 認證**：保持使用原始輸入進行 LDAP 綁定，只在儲存時標準化
3. **唯一性**：資料庫索引確保不會有大小寫不同的重複帳號
4. **顯示名稱**：可以保持原始大小寫（如需要，可以額外處理 displayName）

### 相關檔案

- `src/server/services/ldap.service.ts` - LDAP 認證與標準化
- `src/server/services/user.service.ts` - 使用者資料庫操作
- `src/server/routes/auth.routes.ts` - 認證路由
- `src/server/database/migrations/007_normalize_usernames.sql` - 資料庫遷移
