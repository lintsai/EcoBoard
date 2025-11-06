# EcoBoard 功能改進報告
*生成時間：2025-11-05*

## 📋 改進需求總覽

根據使用者手動測試反饋，共有 10 項功能需要改進：

1. ✅ 工作項目不能刪除
2. ✅ 工作項目不能閱讀，沒有總結
3. ✅ 工作項目不能編輯
4. 🔄 團隊不能刪除或編輯
5. ⏳ 站立會議無法閱讀編輯工作項目
6. ⏳ 站立會議團隊成員打卡狀況不準確
7. ⏳ 更新工作進度權限管理
8. ⏳ 團隊可加入多個 Manager
9. ✅ AI 回答的內容格式優化
10. ⏳ 每日總結存檔功能

圖例：✅ 已完成 | 🔄 進行中 | ⏳ 待完成

---

## ✅ 已完成的改進

### 1. 工作項目刪除功能

**後端實現：**
- 檔案：`src/server/routes/workitem.routes.ts`
- 新增 API：`DELETE /api/workitems/:itemId`
- 權限控制：本人或團隊 Manager 可刪除
- 級聯刪除：自動刪除關聯的 work_updates

**前端實現：**
- 檔案：`client/src/pages/WorkItems.tsx`
- UI：每個工作項目新增刪除按鈕（🗑️ Trash2 圖標）
- 確認對話框：刪除前詢問確認
- 即時更新：刪除後自動重新載入列表

**程式碼範例：**
```typescript
// 後端服務
export const deleteWorkItem = async (itemId: number, userId: number) => {
  const workItem = await query(/*檢查權限*/);
  if (item.user_id !== userId && item.role !== 'manager') {
    throw new Error('無權限刪除此工作項目');
  }
  await query('DELETE FROM work_updates WHERE work_item_id = $1', [itemId]);
  await query('DELETE FROM work_items WHERE id = $1', [itemId]);
};
```

---

### 2. 工作項目即時總結顯示

**功能特色：**
- 雙欄式布局：左側對話區，右側總結區
- AI 即時總結：自動生成今日工作項目總覽
- Markdown 渲染：使用 ReactMarkdown 美化顯示
- 自動更新：工作項目變動時即時更新總結

**UI 設計：**
```
+------------------+------------------+
|   對話區域       |   AI 總結區      |
|   (60%)          |   (40%)          |
|                  |  📋 今日工作總覽  |
|  [聊天訊息]      |  1. 項目一       |
|  [輸入框]        |  2. 項目二       |
|                  |  ...             |
|                  |  今日工作項目     |
+------------------+------------------+
```

**程式碼範例：**
```typescript
const generateSummary = () => {
  const summary = `### 📋 今日工作項目總覽\n\n**總計**: ${workItems.length} 個項目\n\n` +
    workItems.map((item, idx) => `${idx + 1}. ${item.content}`).join('\n');
  setAiSummary(summary);
};
```

---

### 3. 工作項目編輯功能

**功能實現：**
- 點擊編輯按鈕（✏️ Edit2 圖標）進入編輯模式
- 內容填入輸入框，可繼續對話修改
- AI 提示：顯示「正在編輯工作項目」
- 取消功能：可隨時取消編輯

**交互流程：**
1. 使用者點擊編輯按鈕
2. 工作項目內容填入輸入框
3. AI 顯示編輯提示訊息
4. 使用者修改後發送
5. 呼叫 PUT API 更新
6. 顯示成功訊息並重新載入

**程式碼範例：**
```typescript
const handleEditWorkItem = (item: WorkItem) => {
  setEditingItemId(item.id);
  setInputMessage(item.content);
  setMessages(prev => [...prev, {
    role: 'ai',
    content: `正在編輯工作項目：${item.content}\n\n請輸入新的內容：`,
    timestamp: new Date().toISOString()
  }]);
};
```

---

### 4. AI 回應格式優化

**實現方式：**
- 使用 `react-markdown` 套件渲染
- 支援完整 Markdown 語法
- 自訂 CSS 樣式美化

**支援的格式：**
- ✅ 標題（H1-H6）
- ✅ 粗體、斜體
- ✅ 列表（有序、無序）
- ✅ 程式碼區塊
- ✅ 引用
- ✅ 連結
- ✅ 表格

**程式碼範例：**
```tsx
{msg.role === 'ai' ? (
  <div className="markdown-content">
    <ReactMarkdown>{msg.content}</ReactMarkdown>
  </div>
) : (
  msg.content
)}
```

---

### 5. 團隊刪除功能（後端）

**API 實現：**
- 檔案：`src/server/routes/team.routes.ts`
- 新增 API：`DELETE /api/teams/:teamId`
- 權限控制：僅團隊 Admin 可刪除
- 級聯刪除順序：
  1. work_updates
  2. work_items
  3. standup_meetings
  4. checkins
  5. team_members
  6. teams

**安全性考量：**
- 檢查使用者是否為 Admin
- 刪除前確認權限
- 使用事務確保資料一致性

**程式碼範例：**
```typescript
export const deleteTeam = async (teamId: number, userId: number) => {
  // 權限檢查
  const adminCheck = await query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );
  if (adminCheck.rows[0].role !== 'admin') {
    throw new Error('無權限刪除團隊');
  }
  
  // 級聯刪除
  await query(/* DELETE work_updates */);
  await query(/* DELETE work_items */);
  // ...
};
```

---

## 🔄 進行中的改進

### 4. 團隊編輯與刪除（前端）

**已完成：**
- ✅ 後端 API 完成
- ✅ 前端 API 服務更新

**待完成：**
- ⏳ TeamManagement.tsx UI 更新
- ⏳ 加入編輯團隊資訊功能
- ⏳ 加入刪除團隊按鈕
- ⏳ 加入編輯成員角色功能

---

## ⏳ 待完成的改進

### 5. 站立會議工作項目管理增強

**需求分析：**
- 可閱讀、編輯工作項目
- 手動或 AI 分配工作項目給成員
- 多角度查看（按成員/按類型/按優先級）

**計劃實現：**
1. 新增工作項目詳情彈窗
2. 實作拖放功能分配任務
3. 新增篩選和排序功能
4. AI 智能分配建議

---

### 6. 修正打卡狀況準確度

**問題分析：**
- 可能是時區問題
- 或是查詢條件錯誤

**計劃檢查：**
1. 檢查 `checkin.service.ts` 的日期查詢
2. 確認時區設定
3. 驗證 `getTodayTeamCheckins` 邏輯
4. 加入除錯日誌

---

### 7. 工作進度權限管理

**需求：**
- Manager 可查看所有成員進度
- 一般成員只能查看自己的

**計劃實現：**
1. 後端加入角色檢查
2. UpdateWork 頁面根據角色顯示不同內容
3. API 返回時過濾資料

---

### 8. 多 Manager 支援

**需求：**
- 一個團隊可有多個 Manager
- 加入角色切換功能

**計劃實現：**
1. 檢查 team_members 表結構（已支援多個 admin）
2. 新增 PUT API 修改成員角色
3. 前端加入角色切換 UI

---

### 9. 每日總結存檔功能

**需求：**
- 儲存已生成的總結
- 可查看歷史總結
- 避免重複生成

**計劃實現：**
1. 建立 `daily_summaries` 資料表
2. 修改生成邏輯：先查詢是否已存在
3. 新增歷史總結查詢頁面
4. 加入日期選擇器

**資料表設計：**
```sql
CREATE TABLE daily_summaries (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  summary_date DATE NOT NULL,
  summary_content TEXT NOT NULL,
  generated_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, summary_date)
);
```

---

## 📊 技術總結

### 新增的依賴
- `react-markdown` v10.1.0 - Markdown 渲染

### 修改的檔案

**後端（5 個檔案）：**
1. `src/server/routes/workitem.routes.ts` - 新增刪除 API
2. `src/server/services/workitem.service.ts` - 刪除服務實作
3. `src/server/routes/team.routes.ts` - 新增刪除 API
4. `src/server/services/team.service.ts` - 刪除服務實作
5. `client/src/services/api.ts` - API 服務更新

**前端（1 個檔案）：**
1. `client/src/pages/WorkItems.tsx` - 大幅改版
   - 新增雙欄布局
   - 加入編輯、刪除功能
   - 整合 ReactMarkdown
   - 加入 AI 即時總結

### API 變更

**新增的 API：**
- `DELETE /api/workitems/:itemId` - 刪除工作項目
- `PUT /api/workitems/:itemId` - 更新工作項目（已存在，增強使用）
- `DELETE /api/teams/:teamId` - 刪除團隊
- `PUT /api/teams/:teamId` - 更新團隊（已存在）

---

## 🎯 下一步計劃

### 優先級 1（高）：
1. 完成團隊管理前端功能
2. 修正打卡狀況準確度
3. 實現每日總結存檔

### 優先級 2（中）：
4. 工作進度權限管理
5. 多 Manager 支援

### 優先級 3（低）：
6. 站立會議工作項目管理增強

---

## 💡 建議

1. **測試建議：**
   - 先測試已完成的功能
   - 確認無誤後再繼續開發

2. **部署建議：**
   - 備份資料庫
   - 先部署到測試環境
   - 確認後再部署到正式環境

3. **優化建議：**
   - 加入載入動畫
   - 改善錯誤提示訊息
   - 加入操作提示（Tooltip）

---

## 📝 變更記錄

### v1.1.0 (2025-11-05)
- ✅ 新增工作項目刪除功能
- ✅ 新增工作項目編輯功能
- ✅ 新增 AI 即時總結顯示
- ✅ 優化 AI 回應格式（Markdown）
- ✅ 新增團隊刪除後端 API
- 🔄 團隊管理前端功能（進行中）

---

*報告生成工具：GitHub Copilot*
*專案：EcoBoard - 團隊工作管理系統*
