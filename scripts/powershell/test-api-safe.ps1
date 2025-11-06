# EcoBoard API 測試腳本 (安全版本 - 避免控制台緩衝區錯誤)
# 使用方法：在 PowerShell 中執行 .\test-api-safe.ps1

$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:3000"
$token = ""
$teamId = ""
$userId = ""
$checkinId = ""
$workItemId = ""

# 輸出到檔案以避免控制台問題
$logFile = "test-results-$(Get-Date -Format 'yyyyMMdd-HHmmss').log"

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    $Message | Out-File -FilePath $logFile -Append -Encoding UTF8
    try {
        Write-Host $Message -ForegroundColor $Color
    } catch {
        Write-Output $Message
    }
}

Write-Log "========================================" "Cyan"
Write-Log "  EcoBoard API 自動化測試" "Cyan"
Write-Log "========================================" "Cyan"
Write-Log ""
Write-Log "測試結果將同時輸出到: $logFile" "Yellow"
Write-Log ""

# 測試結果統計
$totalTests = 0
$passedTests = 0
$failedTests = 0

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
    Write-Log "測試: $Name" "White"
    
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
        
        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Log "  結果: ✓ PASS" "Green"
            $global:passedTests++
            return $response.Content | ConvertFrom-Json
        } else {
            Write-Log "  結果: ✗ FAIL (Status: $($response.StatusCode))" "Red"
            $global:failedTests++
            return $null
        }
    }
    catch {
        Write-Log "  結果: ✗ FAIL" "Red"
        Write-Log "  錯誤: $($_.Exception.Message)" "Yellow"
        $global:failedTests++
        return $null
    }
}

Write-Log "Phase 1: Core Infrastructure 測試" "Yellow"
Write-Log "=================================" "Yellow"
Write-Log ""

# 1. Health Check
$result = Test-Endpoint -Name "Health Check" -Method "GET" -Url "$baseUrl/api/health"
if ($result) {
    Write-Log "  狀態: $($result.status)" "Gray"
    Write-Log "  時間: $($result.timestamp)" "Gray"
}
Write-Log ""

Write-Log "Phase 2: 基本功能測試" "Yellow"
Write-Log "=================================" "Yellow"
Write-Log ""

# 2. 登入測試
Write-Log "請輸入 LDAP 測試帳號資訊：" "Cyan"
$username = Read-Host "使用者名稱"
$password = Read-Host "密碼" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

$loginResult = Test-Endpoint `
    -Name "LDAP 登入" `
    -Method "POST" `
    -Url "$baseUrl/api/auth/login" `
    -Body @{ username = $username; password = $passwordPlain } `
    -ExpectedStatus 200

if ($loginResult -and $loginResult.token) {
    $token = $loginResult.token
    $userId = $loginResult.user.id
    Write-Log "  Token: $($token.Substring(0, 20))..." "Gray"
    Write-Log "  User ID: $userId" "Gray"
    Write-Log "  Username: $($loginResult.user.username)" "Gray"
    Write-Log "  Display Name: $($loginResult.user.displayName)" "Gray"
} else {
    Write-Log "登入失敗，無法繼續測試需要認證的功能" "Red"
    Write-Log ""
    Write-Log "測試統計：" "Cyan"
    Write-Log "  總測試數: $totalTests" "White"
    Write-Log "  通過: $passedTests" "Green"
    Write-Log "  失敗: $failedTests" "Red"
    Write-Log ""
    Write-Log "完整測試結果已儲存至: $logFile" "Yellow"
    exit
}
Write-Log ""

# 3. Token 驗證
$authHeader = @{ Authorization = "Bearer $token" }
Test-Endpoint `
    -Name "Token 驗證" `
    -Method "GET" `
    -Url "$baseUrl/api/auth/verify" `
    -Headers $authHeader | Out-Null
Write-Log ""

# 4. 建立團隊
$teamName = "測試團隊_$(Get-Date -Format 'HHmmss')"
$createTeamResult = Test-Endpoint `
    -Name "建立團隊" `
    -Method "POST" `
    -Url "$baseUrl/api/teams" `
    -Headers $authHeader `
    -Body @{ name = $teamName; description = "自動化測試建立的團隊" } `
    -ExpectedStatus 201

if ($createTeamResult) {
    $teamId = $createTeamResult.id
    Write-Log "  Team ID: $teamId" "Gray"
    Write-Log "  Team Name: $($createTeamResult.name)" "Gray"
}
Write-Log ""

# 5. 取得團隊列表
$teamsResult = Test-Endpoint `
    -Name "取得團隊列表" `
    -Method "GET" `
    -Url "$baseUrl/api/teams" `
    -Headers $authHeader

if ($teamsResult) {
    Write-Log "  團隊數量: $($teamsResult.Count)" "Gray"
}
Write-Log ""

# 6. 取得團隊詳情
if ($teamId) {
    Test-Endpoint `
        -Name "取得團隊詳情" `
        -Method "GET" `
        -Url "$baseUrl/api/teams/$teamId" `
        -Headers $authHeader | Out-Null
    Write-Log ""
}

# 7. 取得團隊成員
if ($teamId) {
    $membersResult = Test-Endpoint `
        -Name "取得團隊成員" `
        -Method "GET" `
        -Url "$baseUrl/api/teams/$teamId/members" `
        -Headers $authHeader
    
    if ($membersResult) {
        Write-Log "  成員數量: $($membersResult.Count)" "Gray"
    }
    Write-Log ""
}

# 8. 每日打卡
if ($teamId) {
    $checkinResult = Test-Endpoint `
        -Name "每日打卡" `
        -Method "POST" `
        -Url "$baseUrl/api/checkin" `
        -Headers $authHeader `
        -Body @{ 
            teamId = $teamId
            morningNote = "今天要測試系統功能"
        } `
        -ExpectedStatus 201
    
    if ($checkinResult) {
        $checkinId = $checkinResult.id
        Write-Log "  Checkin ID: $checkinId" "Gray"
    }
    Write-Log ""
}

# 9. 取得今日團隊打卡
if ($teamId) {
    $todayCheckinResult = Test-Endpoint `
        -Name "取得今日團隊打卡" `
        -Method "GET" `
        -Url "$baseUrl/api/checkin/today/$teamId" `
        -Headers $authHeader
    
    if ($todayCheckinResult) {
        Write-Log "  今日打卡數: $($todayCheckinResult.Count)" "Gray"
    }
    Write-Log ""
}

# 10. 取得個人打卡歷史
$checkinHistoryResult = Test-Endpoint `
    -Name "取得個人打卡歷史" `
    -Method "GET" `
    -Url "$baseUrl/api/checkin/history" `
    -Headers $authHeader

if ($checkinHistoryResult) {
    Write-Log "  歷史記錄數: $($checkinHistoryResult.Count)" "Gray"
}
Write-Log ""

Write-Log "Phase 3: AI 整合測試" "Yellow"
Write-Log "=================================" "Yellow"
Write-Log ""

# 11. AI 對話（創建工作項目）
if ($checkinId) {
    $chatResult = Test-Endpoint `
        -Name "AI 對話 - 輸入工作項目" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/chat" `
        -Headers $authHeader `
        -Body @{
            message = "今天要完成使用者登入功能的開發和測試"
            context = @{
                userId = $userId
                teamId = $teamId
                checkinId = $checkinId
            }
        }
    
    if ($chatResult) {
        Write-Log "  AI 回應: $($chatResult.response.Substring(0, [Math]::Min(50, $chatResult.response.Length)))..." "Gray"
    }
    Write-Log ""
}

# 12. 新增工作項目
if ($checkinId) {
    $workItemResult = Test-Endpoint `
        -Name "新增工作項目" `
        -Method "POST" `
        -Url "$baseUrl/api/workitems" `
        -Headers $authHeader `
        -Body @{
            checkinId = $checkinId
            teamId = $teamId
            title = "開發登入功能"
            description = "實作使用者登入、登出功能"
            category = "development"
            estimatedHours = 4
        } `
        -ExpectedStatus 201
    
    if ($workItemResult) {
        $workItemId = $workItemResult.id
        Write-Log "  Work Item ID: $workItemId" "Gray"
    }
    Write-Log ""
}

# 13. 取得今日個人工作項目
$todayWorkItemsResult = Test-Endpoint `
    -Name "取得今日個人工作項目" `
    -Method "GET" `
    -Url "$baseUrl/api/workitems/today" `
    -Headers $authHeader

if ($todayWorkItemsResult) {
    Write-Log "  工作項目數: $($todayWorkItemsResult.Count)" "Gray"
}
Write-Log ""

# 14. 取得今日團隊工作項目
if ($teamId) {
    $teamWorkItemsResult = Test-Endpoint `
        -Name "取得今日團隊工作項目" `
        -Method "GET" `
        -Url "$baseUrl/api/workitems/team/$teamId/today" `
        -Headers $authHeader
    
    if ($teamWorkItemsResult) {
        Write-Log "  團隊工作項目數: $($teamWorkItemsResult.Count)" "Gray"
    }
    Write-Log ""
}

# 15. 更新工作項目
if ($workItemId) {
    Test-Endpoint `
        -Name "更新工作項目" `
        -Method "PUT" `
        -Url "$baseUrl/api/workitems/$workItemId" `
        -Headers $authHeader `
        -Body @{
            status = "in_progress"
            actualHours = 2
        } | Out-Null
    Write-Log ""
}

# 16. 新增工作更新
if ($workItemId) {
    Test-Endpoint `
        -Name "新增工作更新" `
        -Method "POST" `
        -Url "$baseUrl/api/workitems/$workItemId/updates" `
        -Headers $authHeader `
        -Body @{
            updateNote = "已完成登入頁面UI設計"
            progress = 50
        } `
        -ExpectedStatus 201 | Out-Null
    Write-Log ""
}

# 17. 取得工作更新記錄
if ($workItemId) {
    $updatesResult = Test-Endpoint `
        -Name "取得工作更新記錄" `
        -Method "GET" `
        -Url "$baseUrl/api/workitems/$workItemId/updates" `
        -Headers $authHeader
    
    if ($updatesResult) {
        Write-Log "  更新記錄數: $($updatesResult.Count)" "Gray"
    }
    Write-Log ""
}

# 18. 分析工作項目
if ($teamId) {
    $analyzeResult = Test-Endpoint `
        -Name "分析工作項目 (可能需要較長時間)" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/analyze-workitems" `
        -Headers $authHeader `
        -Body @{
            teamId = $teamId
            date = (Get-Date -Format "yyyy-MM-dd")
        }
    
    if ($analyzeResult) {
        Write-Log "  分析完成" "Gray"
    }
    Write-Log ""
}

# 19. 分配任務
if ($teamId) {
    $distributeResult = Test-Endpoint `
        -Name "分配任務 (可能需要較長時間)" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/distribute-tasks" `
        -Headers $authHeader `
        -Body @{
            teamId = $teamId
            date = (Get-Date -Format "yyyy-MM-dd")
        }
    
    if ($distributeResult) {
        Write-Log "  任務分配完成" "Gray"
    }
    Write-Log ""
}

# 20. 取得今日站立會議狀態
if ($teamId) {
    Test-Endpoint `
        -Name "取得今日站立會議狀態" `
        -Method "GET" `
        -Url "$baseUrl/api/ai/standup/team/$teamId/today" `
        -Headers $authHeader | Out-Null
    Write-Log ""
}

# 21. 生成每日總結
if ($teamId) {
    $summaryResult = Test-Endpoint `
        -Name "生成每日總結 (可能需要較長時間)" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/daily-summary" `
        -Headers $authHeader `
        -Body @{
            teamId = $teamId
            date = (Get-Date -Format "yyyy-MM-dd")
        }
    
    if ($summaryResult) {
        Write-Log "  總結生成完成" "Gray"
    }
    Write-Log ""
}

# 測試總結
Write-Log ""
Write-Log "========================================" "Cyan"
Write-Log "  測試完成" "Cyan"
Write-Log "========================================" "Cyan"
Write-Log ""
Write-Log "測試統計：" "Yellow"
Write-Log "  總測試數: $totalTests" "White"
Write-Log "  通過: $passedTests" "Green"
Write-Log "  失敗: $failedTests" "Red"
$successRate = if ($totalTests -gt 0) { [Math]::Round($passedTests / $totalTests * 100, 2) } else { 0 }
Write-Log "  成功率: $successRate%" "White"
Write-Log ""

if ($failedTests -eq 0) {
    Write-Log "✓ 所有測試通過！系統運作正常。" "Green"
} elseif ($failedTests -le 3) {
    Write-Log "⚠ 有少量測試失敗，請檢查錯誤訊息。" "Yellow"
} else {
    Write-Log "✗ 多項測試失敗，請修復問題後重新測試。" "Red"
}
Write-Log ""
Write-Log "完整測試結果已儲存至: $logFile" "Cyan"
Write-Log ""
