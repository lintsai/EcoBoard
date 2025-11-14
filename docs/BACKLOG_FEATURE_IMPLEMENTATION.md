# Issue #14: 提早一週規劃工作項目功能 - 實作完成報告

## 功能概述

根據 Issue #14 的需求，成功實作了「提早一週規劃工作項目功能」，允許使用者提前規劃工作項目（Backlog），並支援手動填寫和 AI 批量匯入。

## 實作內容

### 1. 資料庫層 (Database)

**新增檔案:**
- `src/server/database/migrations/010_create_backlog.sql`

**功能:**
- 建立 `backlog_items` 表，包含以下欄位：
  - `id`: 主鍵
  - `team_id`: 團隊 ID
  - `user_id`: 使用者 ID
  - `title`: 標題 (最多 500 字元)
  - `content`: 詳細內容
  - `priority`: 優先級 (1-5，1 最高，5 最低)
  - `estimated_date`: 預計處理時間
  - `status`: 狀態 (pending, scheduled, moved_to_today, completed, cancelled)
  - `created_at`, `updated_at`: 時間戳記
- 建立相關索引以優化查詢效能

### 2. 後端服務層 (Backend Services)

**新增檔案:**
- `src/server/services/backlog.service.ts`

**主要功能:**
- `createBacklogItem`: 創建單個 backlog 項目
- `createBacklogItemsBatch`: 批量創建 backlog 項目（用於 AI 解析後的批量插入）
- `getUserBacklogItems`: 獲取使用者的 backlog 項目
- `getTeamBacklogItems`: 獲取團隊的所有 backlog 項目（管理員查看）
- `updateBacklogItem`: 更新 backlog 項目
- `deleteBacklogItem`: 刪除 backlog 項目
- `moveBacklogToWorkItem`: 將 backlog 項目移動到今日工作項目

**修改檔案:**
- `src/server/services/ai.service.ts`
  - 新增 `parseTableToBacklogItems` 函數：使用 AI 解析貼上的表格並轉換為結構化的 backlog 項目

### 3. 後端路由層 (Backend Routes)

**新增檔案:**
- `src/server/routes/backlog.routes.ts`

**API 端點:**
- `POST /api/backlog` - 創建單個 backlog 項目
- `POST /api/backlog/batch` - 批量創建 backlog 項目
- `GET /api/backlog/my` - 獲取使用者的 backlog 項目
- `GET /api/backlog/team/:teamId` - 獲取團隊的 backlog 項目
- `PUT /api/backlog/:itemId` - 更新 backlog 項目
- `DELETE /api/backlog/:itemId` - 刪除 backlog 項目
- `POST /api/backlog/:itemId/move-to-today` - 將 backlog 項目移動到今日

**修改檔案:**
- `src/server/routes/ai.routes.ts`
  - 新增 `POST /api/ai/parse-table` - 解析表格並轉換為 backlog 項目
- `src/server/index.ts`
  - 註冊 backlog 路由

### 4. 前端服務層 (Frontend Services)

**修改檔案:**
- `client/src/services/api.ts`

**新增 API 方法:**
- `createBacklogItem`: 創建 backlog 項目
- `createBacklogItemsBatch`: 批量創建 backlog 項目
- `getUserBacklogItems`: 獲取使用者 backlog 項目
- `getTeamBacklogItems`: 獲取團隊 backlog 項目
- `updateBacklogItem`: 更新 backlog 項目
- `deleteBacklogItem`: 刪除 backlog 項目
- `moveBacklogToWorkItem`: 將 backlog 移動到工作項目
- `parseTableToBacklogItems`: 解析表格

### 5. 前端頁面 (Frontend Pages)

**新增檔案:**
- `client/src/pages/Backlog.tsx`

**主要功能:**

#### 5.1 手動填寫模式
- 提供表單輸入：標題、詳細內容、優先級、預計處理時間
- 支援編輯和刪除現有項目
- 優先級使用視覺化標記（🔴 最高 → 🔵 最低）

#### 5.2 AI 批量匯入模式
- 使用者可貼上表格內容（支援 Excel、Word、純文字格式）
- AI 自動識別並解析表格中的欄位（標題、內容、優先級、日期等）
- 解析後顯示預覽，允許手動修改每個項目
- 可移除不需要的項目
- 一鍵批量儲存所有項目

#### 5.3 Backlog 項目列表
- 顯示所有待規劃的項目
- 按優先級和預計時間排序
- 每個項目可以：
  - 加入今日工作項目（會使用標題進行第一次 AI 對談）
  - 編輯內容
  - 刪除

**修改檔案:**
- `client/src/App.tsx`
  - 新增 `/backlog` 路由
- `client/src/pages/Dashboard.tsx`
  - 在儀表板新增「工作項目規劃 (Backlog)」選單項目
- `client/src/pages/WorkItems.tsx`
  - 在標題列新增「Backlog 規劃」按鈕，方便快速切換

## 使用流程

### 方式一：手動填寫
1. 進入「工作項目規劃（Backlog）」頁面
2. 點擊「手動新增」按鈕
3. 填寫標題、內容、優先級、預計處理時間
4. 點擊「新增」儲存

### 方式二：AI 批量匯入
1. 進入「工作項目規劃（Backlog）」頁面
2. 點擊「AI 批量匯入」按鈕
3. 貼上包含工作項目的表格（可從 Excel、Word 等複製）
4. 點擊「AI 解析」
5. 檢視並修改解析結果
6. 點擊「儲存全部」

### 方式三：從 Backlog 加入今日項目
1. 在 Backlog 頁面選擇想要處理的項目
2. 點擊「加入今日」按鈕
3. 系統會將項目移動到今日工作項目，並使用標題進行第一次 AI 對談
4. 可選擇是否立即前往工作項目頁面

## 技術特點

### AI 整合
- 使用 vLLM API 進行表格解析
- 自動識別表格結構和欄位
- 智能推斷優先級（根據內容判斷緊急程度）
- 支援多種表格格式

### 使用者體驗
- 優先級使用顏色和 emoji 視覺化標記
- 提供編輯預覽功能，可在儲存前修改
- 支援批量操作，提高效率
- 與現有工作項目系統無縫整合

### 資料完整性
- 使用資料庫約束確保資料一致性
- 權限控制：只有創建者或管理員可修改/刪除
- 狀態追蹤：記錄項目從規劃到執行的完整生命週期

## 測試建議

1. **資料庫遷移測試**
   - 執行 `010_create_backlog.sql` 確認表格建立成功
   - 檢查索引是否正確建立

2. **API 測試**
   - 測試所有 CRUD 操作
   - 測試 AI 表格解析功能
   - 測試 backlog 移動到工作項目功能

3. **前端測試**
   - 測試手動新增/編輯/刪除功能
   - 測試 AI 批量匯入流程
   - 測試與工作項目頁面的整合

4. **整合測試**
   - 測試從 Backlog 加入今日後，與 AI 對談的整合
   - 測試多使用者協作場景

## 已知限制與未來改進

1. **AI 解析準確度**
   - 目前依賴 AI 模型的解析能力，複雜表格可能需要手動調整
   - 建議未來加入更多表格格式範例以提升準確度

2. **批量操作**
   - 目前每次只能選擇一個項目移動到今日
   - 可考慮新增批量選擇功能

3. **排程功能**
   - 目前預計處理時間僅作為參考
   - 可考慮新增自動提醒或自動加入今日功能

## 部署注意事項

1. 執行資料庫遷移：
   ```sql
   \i src/server/database/migrations/010_create_backlog.sql
   ```

2. 重新建置專案：
   ```bash
   npm run build
   ```

3. 確認 vLLM API 設定正確（用於 AI 表格解析）

## 結論

Issue #14 的所有需求已完整實作：
- ✅ 新增頁面可預先編輯工作項目（Backlog）
- ✅ 可標記預計處理時間及優先級
- ✅ 支援手動填寫
- ✅ 支援貼上表格，AI 自動整理
- ✅ 填寫後可手動修改
- ✅ Backlog 加入今日項目時用標題與 AI 對談

此功能完全整合到現有系統中，提供使用者更靈活的工作規劃方式。
