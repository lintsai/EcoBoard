# EcoBoard API 測試腳本
# 使用方法：在 PowerShell 中執行 .\test-api.ps1

# 設定控制台緩衝區大小以避免輸出錯誤
try {
    $host.UI.RawUI.BufferSize = New-Object Management.Automation.Host.Size(120, 9999)
} catch {
    # 忽略緩衝區設定錯誤
}

$baseUrl = "http://localhost:3000"
$token = ""
$teamId = ""
$userId = ""
$checkinId = ""
$workItemId = ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EcoBoard API 自動化測試" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

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
    
    try {
        Write-Host "測試: $Name" -NoNewline
    } catch {
        # 如果 Write-Host 失敗，使用 Write-Output
        Write-Output "測試: $Name"
    }
    
    try {
        $params = @{
            Uri = $Url
            Method = $Method
            Headers = $Headers
            UseBasicParsing = $true
            ErrorAction = 'Stop'
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
            $params.ContentType = 'application/json'
        }
        
        $response = Invoke-WebRequest @params
        
        if ($response.StatusCode -eq $ExpectedStatus) {
            try {
                Write-Host " ✓ PASS" -ForegroundColor Green
            } catch {
                Write-Output " ✓ PASS"
            }
            $global:passedTests++
            return $response.Content | ConvertFrom-Json
        } else {
            try {
                Write-Host " ✗ FAIL (Status: $($response.StatusCode))" -ForegroundColor Red
            } catch {
                Write-Output " ✗ FAIL (Status: $($response.StatusCode))"
            }
            $global:failedTests++
            return $null
        }
    }
    catch {
        try {
            Write-Host " ✗ FAIL" -ForegroundColor Red
            Write-Host "   錯誤: $($_.Exception.Message)" -ForegroundColor Yellow
        } catch {
            Write-Output " ✗ FAIL"
            Write-Output "   錯誤: $($_.Exception.Message)"
        }
        $global:failedTests++
        return $null
    }
}

Write-Host "Phase 1: Core Infrastructure 測試" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

# 1. Health Check
$result = Test-Endpoint -Name "Health Check" -Method "GET" -Url "$baseUrl/api/health"
if ($result) {
    Write-Host "   狀態: $($result.status)" -ForegroundColor Gray
    Write-Host "   時間: $($result.timestamp)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "Phase 2: 基本功能測試" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

# 2. 登入測試（需要實際的 LDAP 帳號密碼）
Write-Host ""
Write-Host "請輸入 LDAP 測試帳號資訊：" -ForegroundColor Cyan
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
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host "   User ID: $userId" -ForegroundColor Gray
    Write-Host "   Username: $($loginResult.user.username)" -ForegroundColor Gray
    Write-Host "   Display Name: $($loginResult.user.displayName)" -ForegroundColor Gray
} else {
    Write-Host "   登入失敗，無法繼續測試需要認證的功能" -ForegroundColor Red
    Write-Host ""
    Write-Host "測試統計：" -ForegroundColor Cyan
    Write-Host "  總測試數: $totalTests" -ForegroundColor White
    Write-Host "  通過: $passedTests" -ForegroundColor Green
    Write-Host "  失敗: $failedTests" -ForegroundColor Red
    exit
}
Write-Host ""

# 3. Token 驗證
$authHeader = @{ Authorization = "Bearer $token" }
Test-Endpoint `
    -Name "Token 驗證" `
    -Method "GET" `
    -Url "$baseUrl/api/auth/verify" `
    -Headers $authHeader | Out-Null
Write-Host ""

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
    Write-Host "   Team ID: $teamId" -ForegroundColor Gray
    Write-Host "   Team Name: $($createTeamResult.name)" -ForegroundColor Gray
}
Write-Host ""

# 5. 取得團隊列表
$teamsResult = Test-Endpoint `
    -Name "取得團隊列表" `
    -Method "GET" `
    -Url "$baseUrl/api/teams" `
    -Headers $authHeader

if ($teamsResult) {
    Write-Host "   團隊數量: $($teamsResult.Count)" -ForegroundColor Gray
}
Write-Host ""

# 6. 取得團隊詳情
if ($teamId) {
    Test-Endpoint `
        -Name "取得團隊詳情" `
        -Method "GET" `
        -Url "$baseUrl/api/teams/$teamId" `
        -Headers $authHeader | Out-Null
    Write-Host ""
}

# 7. 取得團隊成員
if ($teamId) {
    $membersResult = Test-Endpoint `
        -Name "取得團隊成員" `
        -Method "GET" `
        -Url "$baseUrl/api/teams/$teamId/members" `
        -Headers $authHeader
    
    if ($membersResult) {
        Write-Host "   成員數量: $($membersResult.Count)" -ForegroundColor Gray
    }
    Write-Host ""
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
        Write-Host "   Checkin ID: $checkinId" -ForegroundColor Gray
    }
    Write-Host ""
}

# 9. 取得今日團隊打卡
if ($teamId) {
    $todayCheckinResult = Test-Endpoint `
        -Name "取得今日團隊打卡" `
        -Method "GET" `
        -Url "$baseUrl/api/checkin/today/$teamId" `
        -Headers $authHeader
    
    if ($todayCheckinResult) {
        Write-Host "   今日打卡數: $($todayCheckinResult.Count)" -ForegroundColor Gray
    }
    Write-Host ""
}

# 10. 取得個人打卡歷史
$checkinHistoryResult = Test-Endpoint `
    -Name "取得個人打卡歷史" `
    -Method "GET" `
    -Url "$baseUrl/api/checkin/history" `
    -Headers $authHeader

if ($checkinHistoryResult) {
    Write-Host "   歷史記錄數: $($checkinHistoryResult.Count)" -ForegroundColor Gray
}
Write-Host ""

Write-Host "Phase 3: AI 整合測試" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

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
        Write-Host "   AI 回應: $($chatResult.response.Substring(0, [Math]::Min(50, $chatResult.response.Length)))..." -ForegroundColor Gray
    }
    Write-Host ""
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
        Write-Host "   Work Item ID: $workItemId" -ForegroundColor Gray
    }
    Write-Host ""
}

# 13. 取得今日個人工作項目
$todayWorkItemsResult = Test-Endpoint `
    -Name "取得今日個人工作項目" `
    -Method "GET" `
    -Url "$baseUrl/api/workitems/today" `
    -Headers $authHeader

if ($todayWorkItemsResult) {
    Write-Host "   工作項目數: $($todayWorkItemsResult.Count)" -ForegroundColor Gray
}
Write-Host ""

# 14. 取得今日團隊工作項目
if ($teamId) {
    $teamWorkItemsResult = Test-Endpoint `
        -Name "取得今日團隊工作項目" `
        -Method "GET" `
        -Url "$baseUrl/api/workitems/team/$teamId/today" `
        -Headers $authHeader
    
    if ($teamWorkItemsResult) {
        Write-Host "   團隊工作項目數: $($teamWorkItemsResult.Count)" -ForegroundColor Gray
    }
    Write-Host ""
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
    Write-Host ""
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
    Write-Host ""
}

# 17. 取得工作更新記錄
if ($workItemId) {
    $updatesResult = Test-Endpoint `
        -Name "取得工作更新記錄" `
        -Method "GET" `
        -Url "$baseUrl/api/workitems/$workItemId/updates" `
        -Headers $authHeader
    
    if ($updatesResult) {
        Write-Host "   更新記錄數: $($updatesResult.Count)" -ForegroundColor Gray
    }
    Write-Host ""
}

# 18. 分析工作項目
if ($teamId) {
    Write-Host "測試: 分析工作項目 (可能需要較長時間)" -NoNewline
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
        Write-Host "   分析完成" -ForegroundColor Gray
    }
    Write-Host ""
}

# 19. 分配任務
if ($teamId) {
    Write-Host "測試: 分配任務 (可能需要較長時間)" -NoNewline
    $distributeResult = Test-Endpoint `
        -Name "" `
        -Method "POST" `
        -Url "$baseUrl/api/ai/distribute-tasks" `
        -Headers $authHeader `
        -Body @{
            teamId = $teamId
            date = (Get-Date -Format "yyyy-MM-dd")
        }
    
    if ($distributeResult) {
        Write-Host "   任務分配完成" -ForegroundColor Gray
    }
    Write-Host ""
}

# 20. 取得今日站立會議狀態
if ($teamId) {
    Test-Endpoint `
        -Name "取得今日站立會議狀態" `
        -Method "GET" `
        -Url "$baseUrl/api/ai/standup/team/$teamId/today" `
        -Headers $authHeader | Out-Null
    Write-Host ""
}

# 21. 生成每日總結
if ($teamId) {
    Write-Host "測試: 生成每日總結 (可能需要較長時間)" -NoNewline
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
        Write-Host "   總結生成完成" -ForegroundColor Gray
    }
    Write-Host ""
}

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

if ($failedTests -eq 0) {
    Write-Host "✓ 所有測試通過！系統運作正常。" -ForegroundColor Green
} elseif ($failedTests -le 3) {
    Write-Host "⚠ 有少量測試失敗，請檢查錯誤訊息。" -ForegroundColor Yellow
} else {
    Write-Host "✗ 多項測試失敗，請修復問題後重新測試。" -ForegroundColor Red
}
Write-Host ""
