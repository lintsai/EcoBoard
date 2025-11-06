# EcoBoard Phase 1-3 測試報告

**測試日期：** 2025-11-05  
**測試環境：** Development (localhost)  
**後端狀態：** ✅ 運行中 (Port 3000)  
**前端狀態：** ✅ 運行中 (Port 3001)

---

## 快速測試指南

### 方法 1：自動化測試腳本（推薦）

在 PowerShell 中執行：

```powershell
cd D:\source\EcoBoard
.\test-api.ps1
```

**需要準備：**
- 一組有效的 LDAP 帳號密碼
- 確保後端伺服器運行中

**測試內容：**
- ✅ 21 個 API 端點完整測試
- ✅ Phase 1, 2, 3 所有功能
- ✅ 自動產生測試報告

---

### 方法 2：手動瀏覽器測試

#### Step 1: 測試登入功能
1. 開啟 http://localhost:3001
2. 輸入 LDAP 帳號密碼
3. 檢查是否成功登入並跳轉

**預期結果：**
- ✅ 登入成功跳轉到團隊選擇頁
- ✅ 顯示使用者名稱
- ✅ Token 已儲存

---

#### Step 2: 測試團隊管理
1. 在團隊選擇頁點擊「建立新團隊」
2. 輸入團隊名稱（例如：開發團隊）
3. 點擊建立

**預期結果：**
- ✅ 團隊成功建立
- ✅ 團隊出現在列表中
- ✅ 可以選擇進入團隊

---

#### Step 3: 測試每日打卡
1. 選擇團隊進入 Dashboard
2. 點擊「每日打卡」
3. 輸入今日工作計畫（例如：開發登入功能、修復 bug）
4. 點擊提交

**預期結果：**
- ✅ 打卡成功
- ✅ 顯示打卡時間
- ✅ 再次進入顯示「今日已打卡」
- ✅ 不能重複打卡

---

#### Step 4: 測試 AI 工作項目輸入
1. 在 Dashboard 點擊「輸入工作項目」
2. 在對話框輸入：「今天要開發使用者登入功能」
3. 等待 AI 回應
4. 繼續輸入：「還要修復資料庫連線的 bug」
5. 點擊「儲存工作項目」

**預期結果：**
- ✅ AI 有回應（如果 vLLM 正常運作）
- ✅ 對話記錄正確顯示
- ✅ 工作項目成功儲存
- ✅ 自動捲動到最新訊息

**注意：** 如果 vLLM 服務未運行，AI 功能會失敗，但不影響其他功能。

---

#### Step 5: 測試工作進度更新
1. 在 Dashboard 點擊「更新工作進度」
2. 選擇今天的工作項目
3. 更新進度和說明
4. 提交更新

**預期結果：**
- ✅ 可以看到今天的工作項目列表
- ✅ 可以更新工作狀態
- ✅ 更新記錄被保存

---

#### Step 6: 測試每日總結
1. 確保當天有打卡和工作項目
2. 在 Dashboard 點擊「每日總結」
3. 查看 AI 生成的總結

**預期結果：**
- ✅ 顯示今日工作摘要
- ✅ 比較計畫與實際完成
- ✅ AI 提供改善建議（如果 vLLM 正常）

---

### 方法 3：API 端點直接測試

使用 PowerShell 測試個別端點：

#### 測試 Health Check
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -UseBasicParsing | Select-Object -ExpandProperty Content
```

#### 測試登入
```powershell
$body = @{
    username = "你的LDAP帳號"
    password = "你的LDAP密碼"
} | ConvertTo-Json

$response = Invoke-WebRequest `
    -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing

$response.Content | ConvertFrom-Json
```

#### 測試建立團隊（需要先取得 Token）
```powershell
$token = "你的_JWT_Token"
$headers = @{ Authorization = "Bearer $token" }
$body = @{
    name = "測試團隊"
    description = "測試用團隊"
} | ConvertTo-Json

$response = Invoke-WebRequest `
    -Uri "http://localhost:3000/api/teams" `
    -Method POST `
    -Headers $headers `
    -Body $body `
    -ContentType "application/json" `
    -UseBasicParsing

$response.Content | ConvertFrom-Json
```

---

## 測試檢查清單

### Phase 1: Core Infrastructure ✅

- [x] **資料庫連線**
  - 伺服器啟動時顯示 "✓ Database initialized"
  - 所有 8 個資料表已建立

- [ ] **LDAP 認證**
  - 正確帳號密碼可登入
  - 錯誤密碼顯示錯誤訊息
  - 自動嘗試 7 種 DN 格式
  - Console 顯示認證過程

- [x] **JWT Token**
  - 登入成功獲得 Token
  - Token 包含使用者資訊
  - Token 驗證成功

---

### Phase 2: 基本功能 ✅

- [ ] **登入/登出**
  - 登入頁面正常顯示
  - 成功登入跳轉
  - 登入失敗顯示錯誤
  - 登出功能正常

- [ ] **團隊管理**
  - 可建立團隊
  - 團隊列表顯示
  - 可選擇進入團隊
  - 團隊資訊正確

- [ ] **團隊成員**
  - 創建者自動成為成員
  - 可查看成員列表
  - 可新增成員（需要另一帳號）
  - 可移除成員

- [ ] **每日打卡**
  - 可以打卡
  - 打卡資訊儲存
  - 今日已打卡顯示
  - 不能重複打卡
  - 歷史記錄可查詢

- [ ] **工作項目**
  - 可新增工作項目
  - 可查看列表
  - 可更新狀態
  - 可新增更新記錄
  - 更新記錄可查詢

---

### Phase 3: AI 整合 ✅

**前提：vLLM API 必須運行在 http://ai-api.example.com:8001**

- [ ] **vLLM 連線**
  - vLLM 服務運行中
  - API 可正常呼叫
  - 回應格式正確

- [ ] **AI 對話**
  - 可以發送訊息
  - AI 有回應
  - 對話記錄顯示
  - 訊息格式正確

- [ ] **工作分析**
  - 可分析團隊工作
  - 返回摘要
  - 列出關鍵任務
  - 識別風險

- [ ] **任務分配**
  - 可分配任務
  - 每個成員有任務
  - 提供執行順序
  - 給出建議

- [ ] **每日總結**
  - 可生成總結
  - 比較計畫與實際
  - 提供改善建議

---

## 已知限制

### 需要外部服務
1. **PostgreSQL** - 必須運行在 db.example.com:5432
2. **LDAP** - 必須運行在 ldap.example.com:389
3. **vLLM API** - 必須運行在 ai-api.example.com:8001

### 未完成功能
- StandupReview 頁面（僅佔位）
- UpdateWork 頁面（僅佔位）
- DailySummary 頁面（僅佔位）
- TeamManagement 頁面（僅佔位）

---

## 測試結果記錄

### 自動化測試
```
執行日期：
執行者：
總測試數：
通過數：
失敗數：
成功率：
```

### 手動測試
```
登入功能：
團隊管理：
每日打卡：
工作項目：
AI 對話：
```

### 問題記錄
```
1. 
2. 
3. 
```

---

## 下一步行動

### 如果測試全部通過 ✅
1. 完成 Phase 4 的 4 個頁面實作
2. 加強錯誤處理和載入狀態
3. 優化使用者體驗
4. 準備 IIS 部署

### 如果有測試失敗 ❌
1. 記錄失敗的測試項目
2. 檢查 Console 錯誤訊息
3. 修復問題
4. 重新測試

---

## 聯絡資訊

如有問題，請檢查：
1. `D:\source\EcoBoard\TESTING.md` - 詳細測試文件
2. `docs/API.md` - API 文件
3. `docs/QUICKSTART.md` - 快速開始指南
4. Console 日誌 - 查看詳細錯誤

**開始測試！** 🚀
