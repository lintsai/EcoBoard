# 資料庫遷移指南

## 概述
本文件說明如何執行資料庫遷移，更新 `daily_summaries` 表結構以支援新的每日總結儲存功能。

---

## 方法一：使用 npm 指令（推薦）

### 步驟
1. 開啟 PowerShell 終端機
2. 切換到專案目錄：
   ```powershell
   cd D:\source\EcoBoard
   ```

3. 執行遷移指令：
   ```powershell
   npm run migrate
   ```

4. 確認輸出訊息：
   ```
   Starting database migration...
   ✓ Database tables created successfully
   ✓ Migration completed successfully
   ```

### 說明
- `npm run migrate` 會執行 `src/server/database/migrate.ts`
- 該腳本會呼叫 `initDatabase()` 函數
- `initDatabase()` 會建立或更新所有資料表
- 使用 `CREATE TABLE IF NOT EXISTS`，已存在的表不會被覆蓋
- `daily_summaries` 表會被更新為新結構

---

## 方法二：直接執行 SQL（進階使用者）

### 使用 psql 客戶端

1. 連線到資料庫：
   ```bash
   psql -h db.example.com -p 5432 -U your_username -d ecoboard
   ```

2. 執行遷移 SQL：
   ```sql
   -- 如果表已存在，先備份
   CREATE TABLE IF NOT EXISTS daily_summaries_backup AS 
   SELECT * FROM daily_summaries;

   -- 刪除舊表
   DROP TABLE IF EXISTS daily_summaries CASCADE;

   -- 建立新表
   CREATE TABLE daily_summaries (
     id SERIAL PRIMARY KEY,
     team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
     summary_date DATE NOT NULL,
     summary_content TEXT NOT NULL,
     generated_by INTEGER REFERENCES users(id),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(team_id, summary_date)
   );

   -- 建立索引
   CREATE INDEX idx_daily_summaries_team_date ON daily_summaries(team_id, summary_date);
   CREATE INDEX idx_daily_summaries_date ON daily_summaries(summary_date);
   ```

3. 如需恢復舊資料（可選）：
   ```sql
   -- 如果舊表有 evening_summary 欄位，可以遷移資料
   INSERT INTO daily_summaries (team_id, summary_date, summary_content, created_at)
   SELECT 
     team_id, 
     summary_date, 
     COALESCE(evening_summary, morning_summary, 'No summary available'), 
     created_at
   FROM daily_summaries_backup
   ON CONFLICT (team_id, summary_date) DO NOTHING;
   ```

---

## 方法三：使用 DBeaver / pgAdmin（GUI 工具）

### 使用 DBeaver

1. 開啟 DBeaver
2. 連線到 `db.example.com:5432/ecoboard`
3. 右鍵點擊 `ecoboard` 資料庫 → SQL 編輯器 → 新 SQL 腳本
4. 貼上以下 SQL：
   ```sql
   -- 檢查 daily_summaries 表是否存在
   SELECT EXISTS (
     SELECT FROM information_schema.tables 
     WHERE table_schema = 'public' 
     AND table_name = 'daily_summaries'
   );

   -- 如果存在且結構不同，先備份
   CREATE TABLE IF NOT EXISTS daily_summaries_old AS 
   SELECT * FROM daily_summaries;

   -- 刪除舊表
   DROP TABLE IF EXISTS daily_summaries CASCADE;

   -- 建立新表
   CREATE TABLE daily_summaries (
     id SERIAL PRIMARY KEY,
     team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
     summary_date DATE NOT NULL,
     summary_content TEXT NOT NULL,
     generated_by INTEGER REFERENCES users(id),
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(team_id, summary_date)
   );

   -- 建立索引
   CREATE INDEX idx_daily_summaries_team_date ON daily_summaries(team_id, summary_date);
   CREATE INDEX idx_daily_summaries_date ON daily_summaries(summary_date);

   -- 驗證表結構
   SELECT 
     column_name, 
     data_type, 
     is_nullable,
     column_default
   FROM information_schema.columns
   WHERE table_name = 'daily_summaries'
   ORDER BY ordinal_position;
   ```

5. 點擊「執行 SQL 腳本」（或按 Ctrl+Enter）
6. 確認執行成功

---

## 驗證遷移成功

### 檢查表結構
```sql
\d daily_summaries
```

**預期輸出**:
```
                                      Table "public.daily_summaries"
      Column      |            Type             | Collation | Nullable |                   Default
------------------+-----------------------------+-----------+----------+---------------------------------------------
 id               | integer                     |           | not null | nextval('daily_summaries_id_seq'::regclass)
 team_id          | integer                     |           | not null |
 summary_date     | date                        |           | not null |
 summary_content  | text                        |           | not null |
 generated_by     | integer                     |           |          |
 created_at       | timestamp without time zone |           |          | CURRENT_TIMESTAMP
 updated_at       | timestamp without time zone |           |          | CURRENT_TIMESTAMP
Indexes:
    "daily_summaries_pkey" PRIMARY KEY, btree (id)
    "daily_summaries_team_id_summary_date_key" UNIQUE CONSTRAINT, btree (team_id, summary_date)
    "idx_daily_summaries_date" btree (summary_date)
    "idx_daily_summaries_team_date" btree (team_id, summary_date)
Foreign-key constraints:
    "daily_summaries_generated_by_fkey" FOREIGN KEY (generated_by) REFERENCES users(id)
    "daily_summaries_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
```

### 檢查索引
```sql
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'daily_summaries';
```

**預期輸出**:
```
           indexname            |                                        indexdef
--------------------------------+----------------------------------------------------------------------------------------
 daily_summaries_pkey           | CREATE UNIQUE INDEX daily_summaries_pkey ON daily_summaries USING btree (id)
 daily_summaries_team_id_...   | CREATE UNIQUE INDEX daily_summaries_team_id_summary_date_key ON daily_summaries...
 idx_daily_summaries_team_date  | CREATE INDEX idx_daily_summaries_team_date ON daily_summaries USING btree (team_id...
 idx_daily_summaries_date       | CREATE INDEX idx_daily_summaries_date ON daily_summaries USING btree (summary_date)
```

---

## 常見問題與解決方案

### Q1: 遷移失敗，提示 "table already exists"
**原因**: 表已存在但結構不同

**解決方案**:
```sql
-- 先刪除舊表
DROP TABLE IF EXISTS daily_summaries CASCADE;

-- 重新執行 npm run migrate
```

### Q2: 遷移後前端顯示錯誤
**原因**: 可能是緩存問題

**解決方案**:
1. 重啟 Node.js 後端：
   ```powershell
   # 按 Ctrl+C 停止
   npm run dev
   ```

2. 清除瀏覽器緩存：
   - Chrome: F12 → Network → Disable cache
   - 或直接按 Ctrl+Shift+Delete

3. 重新登入系統

### Q3: 提示 "permission denied"
**原因**: 資料庫使用者權限不足

**解決方案**:
```sql
-- 以 postgres 超級使用者身份執行
GRANT ALL PRIVILEGES ON TABLE daily_summaries TO your_username;
GRANT USAGE, SELECT ON SEQUENCE daily_summaries_id_seq TO your_username;
```

### Q4: 想要保留舊資料
**解決方案**:
1. 先備份舊表：
   ```sql
   CREATE TABLE daily_summaries_backup AS SELECT * FROM daily_summaries;
   ```

2. 執行遷移

3. 選擇性恢復資料：
   ```sql
   INSERT INTO daily_summaries (team_id, summary_date, summary_content, created_at)
   SELECT 
     team_id, 
     summary_date, 
     COALESCE(evening_summary, morning_summary), 
     created_at
   FROM daily_summaries_backup
   WHERE evening_summary IS NOT NULL OR morning_summary IS NOT NULL
   ON CONFLICT (team_id, summary_date) DO NOTHING;
   ```

---

## 遷移後測試

### 1. 測試資料插入
```sql
INSERT INTO daily_summaries (team_id, summary_date, summary_content, generated_by)
VALUES (1, CURRENT_DATE, '測試總結內容', 1);
```

### 2. 測試查詢
```sql
SELECT * FROM daily_summaries 
WHERE team_id = 1 AND summary_date = CURRENT_DATE;
```

### 3. 測試唯一約束
```sql
-- 應該失敗（重複的 team_id + summary_date）
INSERT INTO daily_summaries (team_id, summary_date, summary_content, generated_by)
VALUES (1, CURRENT_DATE, '另一個總結', 1);
```

### 4. 測試級聯刪除
```sql
-- 刪除團隊時，daily_summaries 也應該被刪除
DELETE FROM teams WHERE id = 1;

-- 驗證
SELECT COUNT(*) FROM daily_summaries WHERE team_id = 1;  -- 應為 0
```

---

## 回滾計劃

如果遷移出現問題，需要回滾：

### 步驟
1. 恢復備份表：
   ```sql
   DROP TABLE IF EXISTS daily_summaries CASCADE;
   ALTER TABLE daily_summaries_backup RENAME TO daily_summaries;
   ```

2. 重建索引：
   ```sql
   CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(summary_date);
   CREATE INDEX IF NOT EXISTS idx_daily_summaries_team ON daily_summaries(team_id);
   ```

3. 重啟後端服務

---

## 檢查清單

遷移前：
- [ ] 已備份現有資料
- [ ] 已確認資料庫連線正常
- [ ] 已停止後端服務（避免資料不一致）

遷移中：
- [ ] 執行 `npm run migrate` 或 SQL 腳本
- [ ] 確認輸出訊息無錯誤
- [ ] 驗證表結構正確

遷移後：
- [ ] 重啟後端服務
- [ ] 清除前端緩存
- [ ] 執行測試查詢
- [ ] 測試前端每日總結功能
- [ ] 確認歷史記錄功能正常

---

## 總結

**推薦方法**: 使用 `npm run migrate` 最簡單且安全

**預計時間**:
- 執行遷移: < 1 分鐘
- 驗證測試: 3-5 分鐘

**風險評估**: 低
- 使用 `IF NOT EXISTS`，不會覆蓋現有資料
- 舊表可以備份
- 容易回滾

**下一步**: 執行遷移後，請參考 `FEATURE_COMPLETION_SUMMARY.md` 進行完整的功能測試。

---

**文件版本**: 1.0  
**最後更新**: 2025年1月
