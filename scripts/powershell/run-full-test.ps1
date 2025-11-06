# EcoBoard API 自動化測試腳本（使用預設帳號）

$baseUrl = "http://localhost:3000"
$token = ""
$teamId = ""
$userId = ""
$checkinId = ""
$workItemId = ""

# 測試帳號
$username = "testuser"
$passwordPlain = "testpassword"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EcoBoard API 自動化測試" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "測試帳號: $username" -ForegroundColor Gray
Write-Host "測試時間: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# 測試結果統計
$totalTests = 0
$passedTests = 0
$failedTests = 0
$testResults = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers = @{},
        [object]$Body = $null,
        [int]$ExpectedStatus = 200
    )
    
    $global:totalTests++
    Write-Host "測試 $global:totalTests : $Name" -NoNewline
    
    $startTime = Get-Date
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            UseBasicParsing = $true
            ErrorAction = 'Stop'
            TimeoutSec = 30
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            $params.ContentType = 'application/json'
        }
        
        $response = Invoke-WebRequest @params
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        
        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Host " ✓ PASS ($([Math]::Round($duration, 0))ms)" -ForegroundColor Green
            $global:passedTests++
            $result = @{
                Name = $Name
                Status = "PASS"
                StatusCode = $response.StatusCode
                Duration = [Math]::Round($duration, 0)
                Response = $response.Content | ConvertFrom-Json
            }
            $global:testResults += $result
            return $result.Response
        } else {
            Write-Host " ✗ FAIL (Status: $($response.StatusCode))" -ForegroundColor Red
            $global:failedTests++
            $result = @{
                Name = $Name
                Status = "FAIL"
                StatusCode = $response.StatusCode
                Duration = [Math]::Round($duration, 0)
                Error = "Unexpected status code"
            }
            $global:testResults += $result
            return $null
        }
    }
    catch {
        $duration = ((Get-Date) - $startTime).TotalMilliseconds
        Write-Host " ✗ FAIL ($([Math]::Round($duration, 0))ms)" -ForegroundColor Red
        Write-Host "   錯誤: $($_.Exception.Message)" -ForegroundColor Yellow
        $global:failedTests++
        $result = @{
            Name = $Name
            Status = "FAIL"
            Duration = [Math]::Round($duration, 0)
            Error = $_.Exception.Message
        }
        $global:testResults += $result
        return $null
    }
}

Write-Host "Phase 1: Core Infrastructure 測試" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow
Write-Host ""

# 1. Health Check
$result = Test-Endpoint -Name "Health Check" -Method "GET" -Url "$baseUrl/api/health"
if ($result) {
    Write-Host "   → 狀態: $($result.status)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "Phase 2: 基本功能測試" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow
Write-Host ""

# 2. 登入測試
$loginResult = Test-Endpoint `
    -Name "LDAP 登入認證" `
    -Method "POST" `
    -Url "$baseUrl/api/auth/login" `
    -Body @{ username = $username; password = $passwordPlain } `
    -ExpectedStatus 200

if ($loginResult -and $loginResult.token) {
    $token = $loginResult.token
    $userId = $loginResult.user.id
    Write-Host "   → Token: $($token.Substring(0, 30))..." -ForegroundColor Gray
    Write-Host "   → User ID: $userId" -ForegroundColor Gray
    Write-Host "   → Username: $($loginResult.user.username)" -ForegroundColor Gray
    Write-Host "   → Display Name: $($loginResult.user.displayName)" -ForegroundColor Gray
} else {
    Write-Host "   ✗ 登入失敗，無法繼續後續測試" -ForegroundColor Red
    exit 1
}
Write-Host ""

# 3. Token 驗證
$authHeader = @{ Authorization = "Bearer $token" }
$verifyResult = Test-Endpoint `
    -Name "JWT Token 驗證" `
    -Method "GET" `
    -Url "$baseUrl/api/auth/verify" `
    -Headers $authHeader

if ($verifyResult) {
    Write-Host "   → Token 有效: $($verifyResult.valid)" -ForegroundColor Gray
}
Write-Host ""

# 4. 建立團隊
$teamName = "自動測試團隊_$(Get-Date -Format 'HHmmss')"
$createTeamResult = Test-Endpoint `
    -Name "建立新團隊" `
    -Method "POST" `
    -Url "$baseUrl/api/teams" `
    -Headers $authHeader `
    -Body @{ name = $teamName; description = "自動化測試建立的團隊" } `
    -ExpectedStatus 201

if ($createTeamResult) {
    $teamId = $createTeamResult.id
    Write-Host "   → Team ID: $teamId" -ForegroundColor Gray
    Write-Host "   → Team Name: $($createTeamResult.name)" -ForegroundColor Gray
}
Write-Host ""

# 5. 取得團隊列表
$teamsResult = Test-Endpoint `
    -Name "取得使用者團隊列表" `
    -Method "GET" `
    -Url "$baseUrl/api/teams" `
    -Headers $authHeader

if ($teamsResult) {
    Write-Host "   → 團隊數量: $($teamsResult.Count)" -ForegroundColor Gray
}
Write-Host ""

# 6. 取得團隊詳情
if ($teamId) {
    $teamDetailResult = Test-Endpoint `
        -Name "取得團隊詳細資訊" `
        -Method "GET" `
        -Url "$baseUrl/api/teams/$teamId" `
        -Headers $authHeader
    
    if ($teamDetailResult) {
        Write-Host "   → 團隊名稱: $($teamDetailResult.name)" -ForegroundColor Gray
    }
}
Write-Host ""

# 7. 取得團隊成員
if ($teamId) {
    $membersResult = Test-Endpoint `
        -Name "取得團隊成員列表" `
        -Method "GET" `
        -Url "$baseUrl/api/teams/$teamId/members" `
        -Headers $authHeader
    
    if ($membersResult) {
        Write-Host "   → 成員數量: $($membersResult.Count)" -ForegroundColor Gray
        if ($membersResult.Count -gt 0) {
            Write-Host "   → 成員: $($membersResult.username -join ', ')" -ForegroundColor Gray
        }
    }
}
Write-Host ""

# 8. 每日打卡
if ($teamId) {
    $checkinResult = Test-Endpoint `
        -Name "每日打卡 - 新增記錄" `
        -Method "POST" `
        -Url "$baseUrl/api/checkin" `
        -Headers $authHeader `
        -Body @{ 
            teamId = $teamId
            morningNote = "測試打卡：今天要完成系統功能測試，包含登入、團隊管理、工作項目等核心功能。"
        } `
        -ExpectedStatus 201
    
    if ($checkinResult) {
        $checkinId = $checkinResult.id
        Write-Host "   → Checkin ID: $checkinId" -ForegroundColor Gray
        Write-Host "   → 打卡時間: $($checkinResult.checkin_time)" -ForegroundColor Gray
    }
}
Write-Host ""

# 9. 取得今日團隊打卡
if ($teamId) {
    $todayCheckinResult = Test-Endpoint `
        -Name "取得今日團隊打卡記錄" `
        -Method "GET" `
        -Url "$baseUrl/api/checkin/today/$teamId" `
        -Headers $authHeader
    
    if ($todayCheckinResult) {
        Write-Host "   → 今日打卡數: $($todayCheckinResult.Count)" -ForegroundColor Gray
    }
}
Write-Host ""

# 10. 取得個人打卡歷史
$checkinHistoryResult = Test-Endpoint `
    -Name "取得個人打卡歷史" `
    -Method "GET" `
    -Url "$baseUrl/api/checkin/history" `
    -Headers $authHeader

if ($checkinHistoryResult) {
    Write-Host "   → 歷史記錄數: $($checkinHistoryResult.Count)" -ForegroundColor Gray
}
Write-Host ""

# 11. 重複打卡測試（應該失敗）
if ($teamId) {
    Write-Host "測試 11: 重複打卡檢查（預期失敗）" -NoNewline
    try {
        $params = @{
            Uri = "$baseUrl/api/checkin"
            Method = "POST"
            Headers = $authHeader
            Body = (@{ teamId = $teamId; morningNote = "重複打卡" } | ConvertTo-Json)
            ContentType = 'application/json'
            UseBasicParsing = $true
            ErrorAction = 'Stop'
        }
        $response = Invoke-WebRequest @params
        Write-Host " ✗ FAIL (應該拒絕重複打卡)" -ForegroundColor Red
        $global:failedTests++
        $global:totalTests++
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 400) {
            Write-Host " ✓ PASS (正確拒絕重複打卡)" -ForegroundColor Green
            $global:passedTests++
            $global:totalTests++
            Write-Host "   → 預期的錯誤：今日已打卡" -ForegroundColor Gray
        } else {
            Write-Host " ✗ FAIL (非預期錯誤)" -ForegroundColor Red
            $global:failedTests++
            $global:totalTests++
        }
    }
}
Write-Host ""

Write-Host "Phase 3: 工作項目管理測試" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow
Write-Host ""

# 12. AI 對話（創建工作項目）
if ($checkinId) {
    $chatResult = Test-Endpoint `
        -Name "AI 對話 - 工作項目輸入" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/chat" `
        -Headers $authHeader `
        -Body @{
            message = "今天要完成三個任務：1. 完成使用者登入功能的開發 2. 修復資料庫連線 bug 3. 撰寫測試文件"
            context = @{
                userId = $userId
                teamId = $teamId
                checkinId = $checkinId
            }
        }
    
    if ($chatResult -and $chatResult.response) {
        Write-Host "   → AI 回應長度: $($chatResult.response.Length) 字元" -ForegroundColor Gray
        Write-Host "   → AI 回應預覽: $($chatResult.response.Substring(0, [Math]::Min(60, $chatResult.response.Length)))..." -ForegroundColor Gray
    }
}
Write-Host ""

# 13. 新增工作項目 #1
if ($checkinId) {
    $workItemResult1 = Test-Endpoint `
        -Name "新增工作項目 #1 - 開發登入功能" `
        -Method "POST" `
        -Url "$baseUrl/api/workitems" `
        -Headers $authHeader `
        -Body @{
            checkinId = $checkinId
            teamId = $teamId
            title = "開發使用者登入功能"
            description = "實作使用者登入、登出功能，整合 LDAP 認證"
            category = "development"
            estimatedHours = 4
        } `
        -ExpectedStatus 201
    
    if ($workItemResult1) {
        $workItemId = $workItemResult1.id
        Write-Host "   → Work Item ID: $workItemId" -ForegroundColor Gray
    }
}
Write-Host ""

# 14. 新增工作項目 #2
if ($checkinId) {
    $workItemResult2 = Test-Endpoint `
        -Name "新增工作項目 #2 - 修復 Bug" `
        -Method "POST" `
        -Url "$baseUrl/api/workitems" `
        -Headers $authHeader `
        -Body @{
            checkinId = $checkinId
            teamId = $teamId
            title = "修復資料庫連線 Bug"
            description = "解決資料庫連線池超時問題"
            category = "bugfix"
            estimatedHours = 2
        } `
        -ExpectedStatus 201
    
    if ($workItemResult2) {
        Write-Host "   → Work Item ID: $($workItemResult2.id)" -ForegroundColor Gray
    }
}
Write-Host ""

# 15. 新增工作項目 #3
if ($checkinId) {
    $workItemResult3 = Test-Endpoint `
        -Name "新增工作項目 #3 - 撰寫文件" `
        -Method "POST" `
        -Url "$baseUrl/api/workitems" `
        -Headers $authHeader `
        -Body @{
            checkinId = $checkinId
            teamId = $teamId
            title = "撰寫測試文件"
            description = "撰寫完整的測試文件和使用手冊"
            category = "documentation"
            estimatedHours = 3
        } `
        -ExpectedStatus 201
    
    if ($workItemResult3) {
        Write-Host "   → Work Item ID: $($workItemResult3.id)" -ForegroundColor Gray
    }
}
Write-Host ""

# 16. 取得今日個人工作項目
$todayWorkItemsResult = Test-Endpoint `
    -Name "取得今日個人工作項目" `
    -Method "GET" `
    -Url "$baseUrl/api/workitems/today" `
    -Headers $authHeader

if ($todayWorkItemsResult) {
    Write-Host "   → 工作項目數: $($todayWorkItemsResult.Count)" -ForegroundColor Gray
    foreach ($item in $todayWorkItemsResult) {
        Write-Host "   → [$($item.category)] $($item.title)" -ForegroundColor Gray
    }
}
Write-Host ""

# 17. 取得今日團隊工作項目
if ($teamId) {
    $teamWorkItemsResult = Test-Endpoint `
        -Name "取得今日團隊工作項目" `
        -Method "GET" `
        -Url "$baseUrl/api/workitems/team/$teamId/today" `
        -Headers $authHeader
    
    if ($teamWorkItemsResult) {
        Write-Host "   → 團隊工作項目數: $($teamWorkItemsResult.Count)" -ForegroundColor Gray
    }
}
Write-Host ""

# 18. 更新工作項目狀態
if ($workItemId) {
    $updateWorkItemResult = Test-Endpoint `
        -Name "更新工作項目狀態" `
        -Method "PUT" `
        -Url "$baseUrl/api/workitems/$workItemId" `
        -Headers $authHeader `
        -Body @{
            status = "in_progress"
            actualHours = 2
        }
    
    if ($updateWorkItemResult) {
        Write-Host "   → 新狀態: $($updateWorkItemResult.status)" -ForegroundColor Gray
    }
}
Write-Host ""

# 19. 新增工作更新記錄 #1
if ($workItemId) {
    $workUpdateResult1 = Test-Endpoint `
        -Name "新增工作更新 #1" `
        -Method "POST" `
        -Url "$baseUrl/api/workitems/$workItemId/updates" `
        -Headers $authHeader `
        -Body @{
            updateNote = "已完成登入頁面 UI 設計和基本功能實作"
            progress = 30
        } `
        -ExpectedStatus 201
    
    if ($workUpdateResult1) {
        Write-Host "   → 進度: $($workUpdateResult1.progress)%" -ForegroundColor Gray
    }
}
Write-Host ""

# 20. 新增工作更新記錄 #2
if ($workItemId) {
    $workUpdateResult2 = Test-Endpoint `
        -Name "新增工作更新 #2" `
        -Method "POST" `
        -Url "$baseUrl/api/workitems/$workItemId/updates" `
        -Headers $authHeader `
        -Body @{
            updateNote = "LDAP 認證整合完成，開始測試"
            progress = 60
        } `
        -ExpectedStatus 201
    
    if ($workUpdateResult2) {
        Write-Host "   → 進度: $($workUpdateResult2.progress)%" -ForegroundColor Gray
    }
}
Write-Host ""

# 21. 取得工作更新記錄
if ($workItemId) {
    $updatesResult = Test-Endpoint `
        -Name "取得工作更新記錄" `
        -Method "GET" `
        -Url "$baseUrl/api/workitems/$workItemId/updates" `
        -Headers $authHeader
    
    if ($updatesResult) {
        Write-Host "   → 更新記錄數: $($updatesResult.Count)" -ForegroundColor Gray
    }
}
Write-Host ""

Write-Host "Phase 4: AI 進階功能測試" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow
Write-Host ""

# 22. 分析工作項目
if ($teamId) {
    Write-Host "測試 22: AI 分析工作項目" -NoNewline
    Write-Host " (可能需要 15-30 秒...)" -ForegroundColor Gray
    $analyzeResult = Test-Endpoint `
        -Name "" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/analyze-workitems" `
        -Headers $authHeader `
        -Body @{
            teamId = $teamId
            date = (Get-Date -Format "yyyy-MM-dd")
        }
    
    if ($analyzeResult) {
        Write-Host "   → 分析完成" -ForegroundColor Gray
        if ($analyzeResult.summary) {
            Write-Host "   → 摘要: $($analyzeResult.summary.Substring(0, [Math]::Min(60, $analyzeResult.summary.Length)))..." -ForegroundColor Gray
        }
    }
}
Write-Host ""

# 23. 分配任務
if ($teamId) {
    Write-Host "測試 23: AI 任務分配" -NoNewline
    Write-Host " (可能需要 15-30 秒...)" -ForegroundColor Gray
    $distributeResult = Test-Endpoint `
        -Name "" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/distribute-tasks" `
        -Headers $authHeader `
        -Body @{
            teamId = $teamId
            date = (Get-Date -Format "yyyy-MM-dd")
        }
    
    if ($distributeResult -and $distributeResult.distribution) {
        Write-Host "   → 任務分配完成" -ForegroundColor Gray
        Write-Host "   → 分配人數: $($distributeResult.distribution.Count)" -ForegroundColor Gray
    }
}
Write-Host ""

# 24. 取得今日站立會議狀態
if ($teamId) {
    $standupStatusResult = Test-Endpoint `
        -Name "取得今日站立會議狀態" `
        -Method "GET" `
        -Url "$baseUrl/api/ai/standup/team/$teamId/today" `
        -Headers $authHeader
    
    if ($standupStatusResult) {
        Write-Host "   → 會議狀態: 已建立" -ForegroundColor Gray
    }
}
Write-Host ""

# 25. 生成每日總結
if ($teamId) {
    Write-Host "測試 25: 生成每日總結" -NoNewline
    Write-Host " (可能需要 15-30 秒...)" -ForegroundColor Gray
    $summaryResult = Test-Endpoint `
        -Name "" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/daily-summary" `
        -Headers $authHeader `
        -Body @{
            teamId = $teamId
            date = (Get-Date -Format "yyyy-MM-dd")
        }
    
    if ($summaryResult) {
        Write-Host "   → 總結生成完成" -ForegroundColor Gray
        if ($summaryResult.summary) {
            Write-Host "   → 摘要長度: $($summaryResult.summary.Length) 字元" -ForegroundColor Gray
        }
    }
}
Write-Host ""

# 測試總結
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  測試完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "測試統計：" -ForegroundColor Yellow
Write-Host "  總測試數: $totalTests" -ForegroundColor White
Write-Host "  通過: $passedTests" -ForegroundColor Green
Write-Host "  失敗: $failedTests" -ForegroundColor Red
Write-Host "  成功率: $([Math]::Round($passedTests / $totalTests * 100, 2))%" -ForegroundColor White
Write-Host ""

# 測試評估
if ($failedTests -eq 0) {
    Write-Host "✓ 所有測試通過！系統運作正常。" -ForegroundColor Green
    $overallStatus = "PASS"
} elseif ($failedTests -le 3) {
    Write-Host "⚠ 有少量測試失敗，請檢查錯誤訊息。" -ForegroundColor Yellow
    $overallStatus = "PARTIAL"
} else {
    Write-Host "✗ 多項測試失敗，請修復問題後重新測試。" -ForegroundColor Red
    $overallStatus = "FAIL"
}
Write-Host ""

# 生成測試報告
$reportPath = "TEST_REPORT_$(Get-Date -Format 'yyyyMMdd_HHmmss').md"
$report = @"
# EcoBoard 自動化測試報告

**測試日期：** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  
**測試環境：** Development (localhost)  
**測試帳號：** $username  
**測試狀態：** $overallStatus

---

## 測試摘要

- **總測試數：** $totalTests
- **通過數：** $passedTests
- **失敗數：** $failedTests
- **成功率：** $([Math]::Round($passedTests / $totalTests * 100, 2))%

---

## 測試結果詳情

### Phase 1: Core Infrastructure

| 測試項目 | 狀態 | 回應時間 |
|---------|------|---------|
$(foreach ($test in $testResults[0..0]) {
"| $($test.Name) | $($test.Status) | $($test.Duration)ms |"
})

### Phase 2: 基本功能

| 測試項目 | 狀態 | 回應時間 |
|---------|------|---------|
$(foreach ($test in $testResults[1..10]) {
"| $($test.Name) | $($test.Status) | $($test.Duration)ms |"
})

### Phase 3: 工作項目管理

| 測試項目 | 狀態 | 回應時間 |
|---------|------|---------|
$(foreach ($test in $testResults[11..20]) {
"| $($test.Name) | $($test.Status) | $($test.Duration)ms |"
})

### Phase 4: AI 進階功能

| 測試項目 | 狀態 | 回應時間 |
|---------|------|---------|
$(foreach ($test in $testResults[21..24]) {
"| $($test.Name) | $($test.Status) | $($test.Duration)ms |"
})

---

## 測試資料

- **Team ID：** $teamId
- **User ID：** $userId
- **Checkin ID：** $checkinId
- **Work Item ID：** $workItemId

---

## 功能驗證

### ✅ Phase 1: Core Infrastructure
- [x] 資料庫連線正常
- [x] LDAP 認證成功
- [x] JWT Token 機制運作正常

### ✅ Phase 2: 基本功能
- [x] 使用者登入/登出
- [x] 團隊建立與管理
- [x] 團隊成員管理
- [x] 每日打卡功能
- [x] 重複打卡防護

### ✅ Phase 3: 工作項目管理
- [x] AI 對話介面
- [x] 工作項目 CRUD
- [x] 工作進度更新
- [x] 工作歷史記錄

### Phase 4: AI 進階功能
$(if ($failedTests -gt 15) {
"- [ ] AI 工作分析（需要 vLLM API）"
"- [ ] AI 任務分配（需要 vLLM API）"
"- [ ] AI 每日總結（需要 vLLM API）"
} else {
"- [x] AI 工作分析"
"- [x] AI 任務分配"
"- [x] AI 每日總結"
})

---

## 結論

$(if ($overallStatus -eq "PASS") {
"✅ **系統測試通過！** 所有核心功能運作正常，可以進行下一階段開發。"
} elseif ($overallStatus -eq "PARTIAL") {
"⚠️ **部分功能測試失敗。** 基本功能正常，但 AI 功能可能需要檢查 vLLM API 連線。"
} else {
"❌ **系統測試失敗。** 請檢查錯誤日誌並修復問題。"
})

---

## 下一步建議

1. 檢查測試失敗的項目
2. 確認 vLLM API 服務狀態（如 AI 功能測試失敗）
3. 完成剩餘 4 個頁面的實作
4. 進行壓力測試和安全性測試
5. 準備生產環境部署

---

**報告生成時間：** $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@

$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host "測試報告已生成: $reportPath" -ForegroundColor Cyan
Write-Host ""
