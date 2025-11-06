# WorkItems.tsx 修復腳本

由於文件創建時出現重複內容問題，請手動執行以下步驟：

## 方案 1：使用備份恢復（推薦）
如果有 Git 或備份：
```bash
# 從 Git 恢復
git checkout HEAD -- client/src/pages/WorkItems.tsx

# 或從備份目錄複製
copy backup\WorkItems.tsx client\src\pages\WorkItems.tsx
```

## 方案 2：使用 VS Code 本機歷史
1. 在 VS Code 中右鍵點擊 `client/src/pages/WorkItems.tsx`
2. 選擇 "Timeline" 或"Local History"
3. 恢復到最近的乾淨版本

## 方案 3：完整重建
完整的 WorkItems.tsx 文件內容已放在 `WORKITEMS_NEW.tsx.template` 中
執行以下命令：
```powershell
Move-Item "client\src\pages\WORKITEMS_NEW.tsx.template" "client\src\pages\WorkItems.tsx"
```

## 關鍵修改點

### 1. 添加新的 state
```typescript
const [currentItemAiSummary, setCurrentItemAiSummary] = useState<string>('');
const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
```

### 2. 添加載入對話歷史函數
```typescript
const loadChatHistory = async (itemSessionId: string) => {
  const history = await api.getChatHistory(itemSessionId);
  const formattedMessages: ChatMessage[] = [];
  history.forEach((msg: any) => {
    formattedMessages.push({
      role: 'user',
      content: msg.content,
      timestamp: msg.created_at
    });
    if (msg.ai_response) {
      formattedMessages.push({
        role: 'ai',
        content: msg.ai_response,
        timestamp: msg.created_at
      });
    }
  });
  setMessages(formattedMessages);
};
```

### 3. 修改 handleEditWorkItem
```typescript
const handleEditWorkItem = async (item: WorkItem) => {
  setSelectedItemId(item.id);
  setCurrentItemAiSummary(item.ai_summary || '');
  
  if (item.session_id) {
    setSessionId(item.session_id);
    await loadChatHistory(item.session_id);
  }
};
```

### 4. 修改保存功能
```typescript
const handleSaveAsNewWorkItem = async () => {
  const summary = await api.generateWorkSummary(sessionId);
  await api.createWorkItem(
    checkinId,
    summary.summary,
    'task',
    sessionId,
    summary.summary,
    summary.title
  );
};
```

### 5. 修改佈局為 60%-40%
```tsx
<div style={{ display: 'flex', gap: '20px', flex: 1 }}>
  {/* 左側對話區 60% */}
  <div style={{ flex: '0 0 60%' }}>
    {/* 對話內容 */}
  </div>
  
  {/* 右側：AI摘要 + 項目列表 40% */}
  <div style={{ flex: '0 0 40%' }}>
    {/* 當前項目 AI 摘要 */}
    {selectedItemId && currentItemAiSummary && (
      <div className="card">
        <ReactMarkdown>{currentItemAiSummary}</ReactMarkdown>
      </div>
    )}
    
    {/* 工作項目列表 */}
    {workItems.map((item) => (
      <div key={item.id}>
        <h4>{item.ai_title || '未命名項目'}</h4>
        <ReactMarkdown>{item.ai_summary}</ReactMarkdown>
      </div>
    ))}
  </div>
</div>
```

## 驗證步驟
1. 確認文件沒有重複內容
2. 確認所有 import 正確
3. 確認 TypeScript 類型正確
4. 運行 `npm run dev` 測試
