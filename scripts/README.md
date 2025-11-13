# EcoBoard 腳本目錄

本目錄包含 EcoBoard 專案的各種自動化腳本。

## 📁 目錄結構

```
scripts/
├── README.md                      # 本文件
├── powershell/                    # PowerShell 腳本
│   ├── deploy-to-iis.ps1         # IIS 部署腳本
│   ├── test-api.ps1              # API 測試腳本（互動式）
│   ├── test-api-safe.ps1         # API 測試腳本（安全版，輸出到日誌）
│   └── run-full-test.ps1         # 完整測試腳本（使用預設帳號）
├── check-users.ts                 # 檢查用戶資料
├── inspect_daily_summaries.ts     # 檢查每日總結
├── run_gen_summary.ts             # 生成總結腳本
├── test-username-normalization.ts # 測試用戶名正規化
└── test-leave-tracking.ts         # ⭐ 測試休假成員標記功能（Issue #13）
```

## 🔧 PowerShell 腳本

### deploy-to-iis.ps1
IIS 自動部署腳本，用於在 Windows Server 上部署 EcoBoard。

**使用方法：**
```powershell
# 從專案根目錄執行（推薦）
.\scripts\powershell\deploy-to-iis.ps1

# 自訂參數
.\scripts\powershell\deploy-to-iis.ps1 -SiteName "EcoBoard" -Port 80 -HostName "ecoboard.example.com"

# 指定實體路徑（腳本會自動偵測專案根目錄）
.\scripts\powershell\deploy-to-iis.ps1 -PhysicalPath "D:\apps\EcoBoard"
```

**功能：**
- 自動偵測專案根目錄（相對於腳本位置）
- 檢查管理員權限
- 驗證建置檔案存在
- 建立/更新 IIS 網站和應用程式集區
- 設定檔案權限
- 驗證環境設定

**必要條件：**
- 需要管理員權限執行
- IIS 必須已安裝
- 前後端必須已完成建置

### test-api.ps1
互動式 API 測試腳本，會在執行時要求輸入 LDAP 帳號密碼。

**使用方法：**
```powershell
.\scripts\powershell\test-api.ps1
```

**功能：**
- 完整的 API 端點測試
- 互動式輸入測試帳號
- 彩色輸出測試結果
- 即時顯示測試統計

### test-api-safe.ps1
安全版 API 測試腳本，輸出到日誌檔案以避免控制台緩衝區問題。

**使用方法：**
```powershell
.\scripts\powershell\test-api-safe.ps1
```

**功能：**
- 與 test-api.ps1 相同的測試功能
- 輸出到日誌檔案：`test-results-YYYYMMDD-HHMMSS.log`
- 避免 PowerShell 控制台緩衝區錯誤
- 適合在限制環境中執行

### run-full-test.ps1
使用預設測試帳號的完整自動化測試腳本。

**使用方法：**
```powershell
.\scripts\powershell\run-full-test.ps1
```

**功能：**
- 25 個完整測試項目
- 使用預設測試帳號（無需互動輸入）
- 生成詳細的測試報告
- 包含 AI 功能測試
- 自動生成 Markdown 格式報告

**預設帳號：**
- Username: `testuser`
- Password: `testpassword`

**注意：** 實際使用時請修改腳本中的帳號資訊。

## 📜 TypeScript 腳本

### check-users.ts
檢查資料庫中的用戶資料和正規化狀態。

**使用方法：**
```bash
npx ts-node scripts/check-users.ts
```

### inspect_daily_summaries.ts
檢查資料庫中的每日總結記錄。

**使用方法：**
```bash
npm run script:inspect
# 或
npx ts-node scripts/inspect_daily_summaries.ts
```

### run_gen_summary.ts
手動生成每日總結。

**使用方法：**
```bash
npm run script:summary
# 或
npx ts-node scripts/run_gen_summary.ts
```

### test-username-normalization.ts
測試用戶名正規化功能。

**使用方法：**
```bash
npx ts-node scripts/test-username-normalization.ts
```

### test-leave-tracking.ts ⭐ NEW
測試休假成員標記功能（Issue #13）。

**使用方法：**
```bash
# 測試特定團隊和日期
npx ts-node scripts/test-leave-tracking.ts <teamId> [date]

# 範例：測試團隊 1 在 2025-11-13 的休假情況
npx ts-node scripts/test-leave-tracking.ts 1 2025-11-13

# 範例：測試團隊 1 今天的休假情況
npx ts-node scripts/test-leave-tracking.ts 1
```

**輸出內容：**
- 團隊所有成員列表
- 當日已打卡成員及打卡時間
- 未打卡成員（標記為休假）
- 出勤率統計
- 當日工作項目統計

## 🚀 快速開始

### 1. 部署到 IIS
```powershell
# 1. 建置專案
npm run build:all

# 2. 執行部署腳本（從專案根目錄）
.\scripts\powershell\deploy-to-iis.ps1

# 3. 執行資料庫遷移
npm run migrate
```

### 2. 執行 API 測試
```powershell
# 方法 1: 互動式測試（手動輸入帳號）
.\scripts\powershell\test-api.ps1

# 方法 2: 使用預設測試帳號
.\scripts\powershell\run-full-test.ps1

# 方法 3: 安全版本（輸出到日誌）
.\scripts\powershell\test-api-safe.ps1
```

## ⚙️ 腳本執行注意事項

### PowerShell 執行策略
如果遇到「無法載入檔案，因為這個系統上已停用指令碼執行」錯誤：

```powershell
# 檢查目前的執行策略
Get-ExecutionPolicy

# 設定執行策略（以管理員身份執行）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser

# 或暫時繞過（不推薦用於生產環境）
powershell -ExecutionPolicy Bypass -File .\scripts\powershell\test-api.ps1
```

### 路徑相關
所有 PowerShell 腳本都設計為可以：
1. 從專案根目錄執行（推薦）
2. 從任何位置執行（會自動偵測專案根目錄）

**範例：**
```powershell
# 從專案根目錄
D:\source\EcoBoard> .\scripts\powershell\deploy-to-iis.ps1

# 從腳本目錄
D:\source\EcoBoard\scripts\powershell> .\deploy-to-iis.ps1

# 從其他位置（需要指定專案路徑）
D:\> D:\source\EcoBoard\scripts\powershell\deploy-to-iis.ps1 -PhysicalPath "D:\source\EcoBoard"
```

## 🔒 安全注意事項

1. **敏感資訊處理**
   - 測試腳本中的預設帳號密碼僅供範例
   - 實際使用時請修改為真實的測試帳號
   - 不要將生產環境帳號寫在腳本中

2. **權限要求**
   - `deploy-to-iis.ps1` 需要管理員權限
   - 測試腳本不需要管理員權限
   - 確保帳號有適當的資料庫和 LDAP 存取權限

3. **環境變數**
   - 確保 `.env` 檔案已正確設定
   - 不要將 `.env` 提交到版本控制
   - 部署前檢查環境變數是否正確

## 📝 新增自訂腳本

如需新增自訂腳本，請遵循以下規範：

### PowerShell 腳本
```powershell
# 檔案開頭加上說明註解
# EcoBoard - 腳本名稱
# 功能說明

# 使用參數
param(
    [string]$RequiredParam,
    [string]$OptionalParam = "DefaultValue"
)

# 主要邏輯
# ...
```

### TypeScript 腳本
```typescript
// 檔案開頭加上說明註解
/**
 * EcoBoard - 腳本名稱
 * 功能說明
 */

// 匯入必要模組
import { pool } from '../src/server/database/pool';

// 主要邏輯
async function main() {
  // ...
}

main().catch(console.error);
```

## 📚 相關文件

- [部署指南](../docs/PACKAGE_DEPLOYMENT_GUIDE.md)
- [測試指南](../docs/TEST_GUIDE.md)
- [IIS 部署](../docs/IIS_DEPLOYMENT.md)
- [API 文件](../docs/API.md)
