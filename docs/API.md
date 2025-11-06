# EcoBoard API 文件

## 基本資訊

- **Base URL**: `http://localhost:3000/api` (開發環境)
- **認證方式**: JWT Bearer Token
- **Content-Type**: `application/json`

## 認證

所有需要認證的 API 都需要在 Header 中帶入 JWT Token：

```
Authorization: Bearer <your_jwt_token>
```

---

## 認證 API

### 登入

**Endpoint**: `POST /auth/login`

**描述**: 使用 LDAP 帳號密碼登入

**Request Body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response** (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "johndoe",
    "displayName": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error** (401):
```json
{
  "error": "使用者名稱或密碼錯誤"
}
```

### 驗證 Token

**Endpoint**: `GET /auth/verify`

**描述**: 驗證 JWT Token 是否有效

**Headers**: 需要認證

**Response** (200):
```json
{
  "valid": true,
  "user": {
    "id": 1,
    "username": "johndoe",
    "displayName": "John Doe"
  }
}
```

**Error** (401):
```json
{
  "error": "無效的認證令牌",
  "valid": false
}
```

---

## 團隊管理 API

### 取得使用者的團隊列表

**Endpoint**: `GET /teams`

**描述**: 取得目前使用者所屬的所有團隊

**Headers**: 需要認證

**Response** (200):
```json
[
  {
    "id": 1,
    "name": "開發團隊",
    "description": "前後端開發",
    "role": "admin",
    "joined_at": "2024-01-01T00:00:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### 建立團隊

**Endpoint**: `POST /teams`

**描述**: 建立新團隊，建立者自動成為管理員

**Headers**: 需要認證

**Request Body**:
```json
{
  "name": "string (必填)",
  "description": "string (選填)"
}
```

**Response** (201):
```json
{
  "id": 1,
  "name": "開發團隊",
  "description": "前後端開發",
  "created_by": 1,
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

### 取得團隊詳情

**Endpoint**: `GET /teams/:teamId`

**描述**: 取得特定團隊的詳細資訊

**Headers**: 需要認證

**Parameters**:
- `teamId` (path): 團隊 ID

**Response** (200):
```json
{
  "id": 1,
  "name": "開發團隊",
  "description": "前後端開發",
  "role": "admin",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

### 取得團隊成員

**Endpoint**: `GET /teams/:teamId/members`

**描述**: 取得團隊所有成員列表

**Headers**: 需要認證

**Response** (200):
```json
[
  {
    "id": 1,
    "username": "johndoe",
    "display_name": "John Doe",
    "email": "john@example.com",
    "role": "admin",
    "joined_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### 新增團隊成員

**Endpoint**: `POST /teams/:teamId/members`

**描述**: 將使用者加入團隊（需要管理員權限）

**Headers**: 需要認證

**Request Body**:
```json
{
  "username": "string"
}
```

**Response** (201):
```json
{
  "id": 2,
  "username": "janedoe",
  "display_name": "Jane Doe",
  "role": "member",
  "joinedAt": "2024-01-02T00:00:00.000Z"
}
```

### 移除團隊成員

**Endpoint**: `DELETE /teams/:teamId/members/:userId`

**描述**: 從團隊移除成員（需要管理員權限）

**Headers**: 需要認證

**Response** (200):
```json
{
  "message": "成員已移除"
}
```

---

## 打卡 API

### 每日打卡

**Endpoint**: `POST /checkin`

**描述**: 進行每日打卡（每天每個團隊只能打卡一次）

**Headers**: 需要認證

**Request Body**:
```json
{
  "teamId": 1
}
```

**Response** (201):
```json
{
  "id": 1,
  "team_id": 1,
  "user_id": 1,
  "checkin_date": "2024-01-15",
  "checkin_time": "2024-01-15T09:00:00.000Z",
  "status": "checked_in"
}
```

**Error** (400):
```json
{
  "error": "今日已打卡"
}
```

### 取得今日團隊打卡記錄

**Endpoint**: `GET /checkin/team/:teamId/today`

**描述**: 取得團隊今日所有成員的打卡狀況

**Headers**: 需要認證

**Response** (200):
```json
[
  {
    "id": 1,
    "user_id": 1,
    "username": "johndoe",
    "display_name": "John Doe",
    "checkin_date": "2024-01-15",
    "checkin_time": "2024-01-15T09:00:00.000Z",
    "status": "checked_in"
  }
]
```

### 取得打卡歷史

**Endpoint**: `GET /checkin/history`

**描述**: 取得使用者的打卡歷史記錄

**Headers**: 需要認證

**Query Parameters**:
- `teamId` (optional): 篩選特定團隊
- `startDate` (optional): 開始日期 (YYYY-MM-DD)
- `endDate` (optional): 結束日期 (YYYY-MM-DD)

**Response** (200):
```json
[
  {
    "id": 1,
    "team_id": 1,
    "team_name": "開發團隊",
    "checkin_date": "2024-01-15",
    "checkin_time": "2024-01-15T09:00:00.000Z",
    "status": "checked_in"
  }
]
```

---

## 工作項目 API

### 建立工作項目

**Endpoint**: `POST /workitems`

**描述**: 建立新的工作項目

**Headers**: 需要認證

**Request Body**:
```json
{
  "checkinId": 1,
  "content": "完成用戶登入功能",
  "itemType": "task"
}
```

**Response** (201):
```json
{
  "id": 1,
  "checkin_id": 1,
  "user_id": 1,
  "content": "完成用戶登入功能",
  "item_type": "task",
  "created_at": "2024-01-15T09:30:00.000Z"
}
```

### 取得今日工作項目

**Endpoint**: `GET /workitems/today`

**描述**: 取得使用者今日的工作項目

**Headers**: 需要認證

**Query Parameters**:
- `teamId` (optional): 篩選特定團隊

**Response** (200):
```json
[
  {
    "id": 1,
    "checkin_id": 1,
    "user_id": 1,
    "content": "完成用戶登入功能",
    "item_type": "task",
    "created_at": "2024-01-15T09:30:00.000Z",
    "updated_at": "2024-01-15T09:30:00.000Z"
  }
]
```

### 取得團隊今日工作項目

**Endpoint**: `GET /workitems/team/:teamId/today`

**描述**: 取得團隊今日所有工作項目

**Headers**: 需要認證

**Response** (200):
```json
[
  {
    "id": 1,
    "user_id": 1,
    "username": "johndoe",
    "display_name": "John Doe",
    "content": "完成用戶登入功能",
    "item_type": "task",
    "created_at": "2024-01-15T09:30:00.000Z"
  }
]
```

### 更新工作項目

**Endpoint**: `PUT /workitems/:itemId`

**描述**: 更新工作項目內容

**Headers**: 需要認證

**Request Body**:
```json
{
  "content": "完成用戶登入功能和註冊功能"
}
```

**Response** (200):
```json
{
  "id": 1,
  "content": "完成用戶登入功能和註冊功能",
  "updated_at": "2024-01-15T10:00:00.000Z"
}
```

### 新增工作更新

**Endpoint**: `POST /workitems/:itemId/updates`

**描述**: 為工作項目新增進度更新

**Headers**: 需要認證

**Request Body**:
```json
{
  "updateContent": "登入功能已完成，正在進行測試",
  "progressStatus": "in_progress"
}
```

**Response** (201):
```json
{
  "id": 1,
  "work_item_id": 1,
  "user_id": 1,
  "update_content": "登入功能已完成，正在進行測試",
  "progress_status": "in_progress",
  "updated_at": "2024-01-15T17:00:00.000Z"
}
```

### 取得工作項目更新歷史

**Endpoint**: `GET /workitems/:itemId/updates`

**描述**: 取得特定工作項目的所有更新記錄

**Headers**: 需要認證

**Response** (200):
```json
[
  {
    "id": 1,
    "work_item_id": 1,
    "user_id": 1,
    "username": "johndoe",
    "display_name": "John Doe",
    "update_content": "登入功能已完成，正在進行測試",
    "progress_status": "in_progress",
    "updated_at": "2024-01-15T17:00:00.000Z"
  }
]
```

---

## AI 功能 API

### AI 對話

**Endpoint**: `POST /ai/chat`

**描述**: 與 AI 助手進行對話，協助填寫工作項目

**Headers**: 需要認證

**Request Body**:
```json
{
  "message": "今天要完成用戶登入功能",
  "sessionId": "session_123",
  "context": {
    "teamId": 1,
    "userId": 1
  }
}
```

**Response** (200):
```json
{
  "sessionId": "session_123",
  "response": "了解！請問用戶登入功能包含哪些部分？預計需要多少時間完成？",
  "timestamp": "2024-01-15T09:30:00.000Z"
}
```

### AI 分析工作項目

**Endpoint**: `POST /ai/analyze-workitems`

**描述**: 使用 AI 分析團隊工作項目，提供總覽和建議

**Headers**: 需要認證

**Request Body**:
```json
{
  "teamId": 1,
  "workItems": [
    {
      "id": 1,
      "user_id": 1,
      "content": "完成用戶登入功能"
    }
  ]
}
```

**Response** (200):
```json
{
  "summary": "今日團隊共有 5 個工作項目...",
  "keyTasks": [
    "完成用戶登入功能",
    "修復資料庫連線問題"
  ],
  "risks": [
    "資料庫問題可能影響其他功能開發"
  ],
  "priorities": [
    {
      "task": "修復資料庫連線問題",
      "priority": "high",
      "reason": "阻塞其他工作"
    }
  ]
}
```

### AI 智能分配任務

**Endpoint**: `POST /ai/distribute-tasks`

**描述**: 使用 AI 智能分配工作任務到團隊成員

**Headers**: 需要認證

**Request Body**:
```json
{
  "teamId": 1,
  "workItems": [...],
  "teamMembers": [...]
}
```

**Response** (200):
```json
{
  "distribution": [
    {
      "userId": 1,
      "userName": "John Doe",
      "tasks": ["完成用戶登入功能"],
      "estimatedWorkload": "medium"
    }
  ],
  "executionOrder": [
    {
      "step": 1,
      "tasks": ["修復資料庫連線問題"],
      "assignees": ["Jane Doe"],
      "reason": "必須優先處理基礎設施問題"
    }
  ],
  "recommendations": [
    "建議先處理資料庫問題再進行功能開發"
  ]
}
```

### 完成站立會議 Review

**Endpoint**: `POST /ai/standup/review`

**描述**: 完成站立會議 Review，AI 自動產生總結和任務分配

**Headers**: 需要認證

**Request Body**:
```json
{
  "teamId": 1,
  "standupId": 1
}
```

**Response** (200):
```json
{
  "id": 1,
  "status": "completed",
  "ai_summary": {...},
  "ai_task_distribution": {...},
  "reviewed_at": "2024-01-15T10:00:00.000Z"
}
```

### 取得今日站立會議

**Endpoint**: `GET /ai/standup/team/:teamId/today`

**描述**: 取得團隊今日的站立會議資訊

**Headers**: 需要認證

**Response** (200):
```json
{
  "id": 1,
  "team_id": 1,
  "meeting_date": "2024-01-15",
  "status": "in_progress",
  "ai_summary": null,
  "created_at": "2024-01-15T09:00:00.000Z"
}
```

### 產生每日總結

**Endpoint**: `POST /ai/daily-summary`

**描述**: AI 產生當日工作總結

**Headers**: 需要認證

**Request Body**:
```json
{
  "teamId": 1,
  "summaryDate": "2024-01-15"
}
```

**Response** (200):
```json
{
  "summary": "今日團隊完成情況良好，共完成 4 個任務...",
  "date": "2024-01-15",
  "teamId": 1
}
```

---

## 錯誤碼說明

| HTTP Status | 說明 |
|------------|------|
| 200 | 請求成功 |
| 201 | 資源建立成功 |
| 400 | 請求參數錯誤 |
| 401 | 未認證或認證失敗 |
| 403 | 無權限執行此操作 |
| 404 | 資源不存在 |
| 500 | 伺服器內部錯誤 |

## 錯誤回應格式

```json
{
  "error": "錯誤訊息"
}
```

或帶驗證錯誤詳情：

```json
{
  "errors": [
    {
      "field": "username",
      "message": "使用者名稱為必填"
    }
  ]
}
```

---

## Rate Limiting

目前未實作 Rate Limiting，建議在生產環境中加入。

## Webhooks

目前未支援 Webhooks，規劃在未來版本中加入。

## 版本控制

目前 API 版本：v1

未來可能透過 URL 路徑或 Header 進行版本控制：
- URL: `/api/v2/...`
- Header: `API-Version: 2`
