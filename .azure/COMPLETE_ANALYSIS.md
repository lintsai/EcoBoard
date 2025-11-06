# 完整問題分析與修復計劃

## 執行日期
2025-11-05

## 問題統整與分析

### 問題 1 & 7: 團隊管理按鈕（刪除團隊、權限編輯）

**代碼檢查結果**: ✅ **按鈕代碼存在**
- 刪除按鈕: Line 276-282 in TeamManagement.tsx
- 權限編輯按鈕: Line 468-484 in TeamManagement.tsx

**顯示條件**: `isCurrentUserAdmin === true`
```typescript
const isCurrentUserAdmin = members.find(m => m.user_id === user?.id)?.role === 'admin';
```

**可能的問題原因**:
1. ❌ API `/teams/:teamId/members` 沒有正確返回 `role` 欄位
2. ❌ 用戶實際上不是管理員
3. ❌ `user?.id` 與 `members` 中的 `user_id` 類型不匹配（string vs number）

**修復計劃**:
1. 檢查 API 返回的數據結構
2. 添加調試日誌輸出 `isCurrentUserAdmin` 的值
3. 確認用戶是否真的是管理員

---

### 問題 2: 填寫工作項目版面問題

**代碼檢查結果**: ⚠️ **最近有修改但未測試**

**當前布局**:
```tsx
<div style={{ display: 'flex', gap: '20px' }}>
  {/* Left: 60% */}
  <div style={{ flex: '1 1 60%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
    ...
  </div>
  {/* Right: 40% */}
  <div style={{ flex: '1 1 40%', minWidth: '300px', maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
    ...
  </div>
</div>
```

**潛在問題**:
1. ❌ 沒有設置外層容器的高度
2. ❌ `calc(100vh - 200px)` 可能不準確
3. ❌ 聊天容器的高度沒有正確限制

**修復計劃**:
1. 設置外層容器的正確高度
2. 確保聊天區域可滾動
3. 測試在不同螢幕尺寸下的表現

---

### 問題 3: 編輯工作項目時載入對話歷史

**代碼檢查結果**: ❌ **無法完整實現**

**根本問題**: `work_items` 表沒有 `session_id` 欄位！

**當前表結構**:
```sql
CREATE TABLE work_items (
  id SERIAL PRIMARY KEY,
  checkin_id INTEGER,
  user_id INTEGER,
  content TEXT NOT NULL,
  item_type VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

**缺少**: `session_id VARCHAR(255)`

**當前實現**: 只顯示編輯提示，無法載入真實歷史

**修復計劃**:
1. **選項 A** (推薦): 在 work_items 表添加 session_id 欄位
2. **選項 B**: 改為顯示「開始新對話」而不是「繼續對話」
3. **選項 C**: 在 chat_messages 中查詢包含該 work item content 的記錄（不準確）

**建議**: 採用選項 A，需要數據庫遷移

---

### 問題 4: AI 總結標題可編輯

**代碼檢查結果**: ✅ **已實現**

**實現方式**:
- 添加了 `aiSummaryTitle` 和 `editingTitle` state
- 點擊標題可編輯
- 顯示編輯圖標

**潛在問題**:
1. ⚠️ 標題修改後沒有持久化（重新載入會丟失）
2. ⚠️ 預設標題寫死在 state 初始化

**修復計劃**:
1. 考慮是否需要持久化（可能不需要，每次重新生成即可）
2. 測試編輯功能是否正常

---

### 問題 5: 站立會議無法閱讀/編輯工作項目

**代碼檢查結果**: ⚠️ **部分實現**

**已實現**: 可收合/展開查看工作項目
**未實現**: 無法編輯工作項目

**當前實現**:
```tsx
{expandedMembers.has(member.user_id) && (
  <ul>
    {memberWorkItems.map((item) => (
      <li>{item.content}</li>
    ))}
  </ul>
)}
```

**修復計劃**:
1. 添加編輯按鈕（如果當前用戶是該項目的擁有者或管理員）
2. 實現即時編輯功能
3. 考慮用戶體驗（是否在站立會議頁面編輯合適？）

---

### 問題 6: 打卡狀態不準確

**代碼檢查結果**: ✅ **邏輯正確**

**當前實現**:
```typescript
const getTodayDate = () => {
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return taiwanTime.toISOString().split('T')[0];
};
```

**可能的問題**:
1. ❌ 伺服器時區不是 UTC
2. ❌ 數據庫時區設定問題
3. ❌ 瀏覽器快取舊數據

**驗證方法**:
```sql
-- 檢查數據庫時區
SHOW timezone;

-- 查看今日打卡記錄
SELECT * FROM checkins 
WHERE checkin_date = CURRENT_DATE;
```

**修復計劃**:
1. 檢查實際打卡記錄
2. 添加調試日誌
3. 確認時區設定

---

## 修復優先順序

### P0 (立即修復)
1. ✅ **問題 1 & 7**: 添加調試日誌確認 `isCurrentUserAdmin`
2. ✅ **問題 2**: 修復版面布局
3. ✅ **問題 6**: 驗證打卡邏輯並添加日誌

### P1 (重要但不緊急)
4. ⚠️ **問題 3**: 添加 session_id 到 work_items（需要數據庫遷移）
5. ⚠️ **問題 5**: 添加工作項目編輯功能

### P2 (可選)
6. ✓ **問題 4**: 已實現，僅需測試

---

## 實際修復步驟

### Step 1: 添加調試功能
在 TeamManagement 和 StandupReview 中添加 console.log

### Step 2: 修復 WorkItems 布局
調整 CSS 和高度計算

### Step 3: 添加 work_items.session_id
創建數據庫遷移腳本

### Step 4: 測試所有功能
使用實際數據測試每個功能點

---

## 測試清單

- [ ] 團隊管理頁面（管理員帳號）
  - [ ] 可看到刪除團隊按鈕
  - [ ] 可看到成員權限編輯按鈕
  - [ ] 按鈕功能正常

- [ ] 填寫工作項目頁面
  - [ ] 左右布局正常（不重疊、不錯位）
  - [ ] 聊天區域可滾動
  - [ ] 右側列表可滾動
  - [ ] AI 總結標題可編輯

- [ ] 站立會議頁面
  - [ ] 工作項目可展開/收合
  - [ ] 打卡狀態正確
  - [ ] 數據即時更新

---

## 下一步行動

1. 立即執行 Step 1-2（調試和布局修復）
2. 測試並收集用戶反饋
3. 根據反饋決定是否執行 Step 3（數據庫遷移）
