# 部署到 IIS 指南

## 前置條件

1. Windows Server 或 Windows 10/11
2. IIS (Internet Information Services)
3. Node.js (建議 v18 或以上)
4. PostgreSQL 資料庫
5. URL Rewrite Module for IIS
6. iisnode (用於在 IIS 上運行 Node.js 應用)

## 安裝步驟

### 1. 安裝必要組件

```powershell
# 安裝 IIS (需要管理員權限)
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServer
Enable-WindowsOptionalFeature -Online -FeatureName IIS-CommonHttpFeatures
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpErrors
Enable-WindowsOptionalFeature -Online -FeatureName IIS-ApplicationDevelopment
Enable-WindowsOptionalFeature -Online -FeatureName IIS-NetFxExtensibility45
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HealthAndDiagnostics
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpLogging
Enable-WindowsOptionalFeature -Online -FeatureName IIS-Security
Enable-WindowsOptionalFeature -Online -FeatureName IIS-RequestFiltering
Enable-WindowsOptionalFeature -Online -FeatureName IIS-Performance
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerManagementTools
Enable-WindowsOptionalFeature -Online -FeatureName IIS-StaticContent
Enable-WindowsOptionalFeature -Online -FeatureName IIS-DefaultDocument
Enable-WindowsOptionalFeature -Online -FeatureName IIS-DirectoryBrowsing
Enable-WindowsOptionalFeature -Online -FeatureName IIS-HttpCompressionStatic
```

### 2. 下載並安裝

- [URL Rewrite Module](https://www.iis.net/downloads/microsoft/url-rewrite)
- [iisnode](https://github.com/Azure/iisnode/releases)

### 3. 建置應用程式

```powershell
# 在專案根目錄執行
npm install

# 建置後端
npm run build:server

# 建置前端
npm run build:client
```

### 4. 設定環境變數

複製 `.env.example` 為 `.env` 並修改設定：

```env
DB_HOST=your_postgres_host
DB_PORT=5432
DB_NAME=ecoboard
DB_USER=your_db_user
DB_PASSWORD=your_db_password

LDAP_URL=ldap://your-ldap-server:389
LDAP_BASE_DN=DC=example,DC=com
LDAP_DOMAIN=example.com

VLLM_API_URL=http://your-vllm-server:8000/v1
VLLM_API_KEY=your_api_key

JWT_SECRET=your_secret_key
PORT=3000
NODE_ENV=production

也可以使用單一連線字串（與雲/托管常見配置相容）：

```
DATABASE_URL=postgres://user:password@host:5432/ecoboard
DB_SSL=false
# 若需要 SSL 且無驗證憑證，可設定（視您的環境）：
# DB_SSL=true
# DB_SSL_REJECT_UNAUTHORIZED=false
```

在 IIS/iisnode 上，如果不使用 `.env`，可以在 `web.config` 內或 IIS 管理員的「環境變數」加入設定（請勿將祕密提交到原始碼庫）。

`web.config` 範例（僅供參考，部署時請移除註解並填入實際值）：

```xml
<iisnode>
  <environmentVariables>
    <add name="DB_HOST" value="your-db-host" />
    <add name="DB_PORT" value="5432" />
    <add name="DB_NAME" value="ecoboard" />
    <add name="DB_USER" value="your-db-user" />
    <add name="DB_PASSWORD" value="your-db-password" />
    <!-- 或使用單一連線字串： -->
    <!-- <add name="DATABASE_URL" value="postgres://user:password@host:5432/ecoboard" /> -->
  <!-- 注意：在 iisnode 模式下不要設定 PORT，IIS/iisnode 會提供 named pipe 的 PORT 值給 Node。 -->
    <add name="NODE_ENV" value="production" />
  </environmentVariables>
  <!-- 其餘 iisnode 設定 -->
  <!-- ... -->
  
</iisnode>
```
```

### 5. 執行資料庫遷移

```powershell
npm run migrate
```

### 6. 建立 IIS 網站

#### 6.1 建立 web.config

在專案根目錄建立 `web.config`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="dist/server.js" verb="*" modules="iisnode" />
    </handlers>
    
    <rewrite>
      <rules>
        <!-- API 請求轉發到 Node.js -->
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^dist/server.js\/debug[\/]?" />
        </rule>
        
        <rule name="StaticContent">
          <action type="Rewrite" url="client/build{REQUEST_URI}" />
        </rule>
        
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True" />
          </conditions>
          <action type="Rewrite" url="dist/server.js" />
        </rule>
      </rules>
    </rewrite>
    
    <iisnode 
      node_env="production"
      nodeProcessCountPerApplication="1"
      maxConcurrentRequestsPerProcess="1024"
      maxNamedPipeConnectionRetry="100"
      namedPipeConnectionRetryDelay="250"
      maxNamedPipeConnectionPoolSize="512"
      maxNamedPipePooledConnectionAge="30000"
      asyncCompletionThreadCount="0"
      initialRequestBufferSize="4096"
      maxRequestBufferSize="65536"
      watchedFiles="*.js;iisnode.yml"
      uncFileChangesPollingInterval="5000"
      gracefulShutdownTimeout="60000"
      loggingEnabled="true"
      logDirectory="iisnode"
      debuggingEnabled="false"
      debugHeaderEnabled="false"
      debuggerPortRange="5058-6058"
      debuggerPathSegment="debug"
      maxLogFileSizeInKB="128"
      maxTotalLogFileSizeInKB="1024"
      maxLogFiles="20"
      devErrorsEnabled="false"
      flushResponse="false"
      enableXFF="true"
    />
    
    <httpErrors existingResponse="PassThrough" />
    
    <staticContent>
      <mimeMap fileExtension=".json" mimeType="application/json" />
    </staticContent>
  </system.webServer>
</configuration>
```

#### 6.2 設定 IIS 網站

1. 開啟 IIS Manager
2. 右鍵點擊 "Sites" -> "Add Website"
3. 設定：
   - Site name: EcoBoard
   - Physical path: 指向專案根目錄
   - Binding: HTTP, Port 80 (或其他埠)
4. 設定應用程式集區：
   - .NET CLR Version: No Managed Code
   - Managed Pipeline Mode: Integrated

#### 6.3 設定權限

```powershell
# 給予 IIS_IUSRS 讀取權限
icacls "C:\path\to\EcoBoard" /grant "IIS_IUSRS:(OI)(CI)R" /T
```

### 7. 重啟 IIS

```powershell
iisreset
```

## 測試

訪問 `http://your-server-ip` 應該能看到登入頁面。

## 疑難排解

### 查看日誌

- IIS 日誌: `C:\inetpub\logs\LogFiles`
- iisnode 日誌: 專案根目錄的 `iisnode` 資料夾

### 常見問題

1. **500 錯誤**
   - 檢查 web.config 設定
   - 確認 Node.js 路徑正確
   - 查看 iisnode 日誌

2. **資料庫連線失敗**
  - 確認 PostgreSQL 服務運行中
  - 在伺服器上檢查 `.env` 或 IIS 環境變數是否設置正確（`DB_HOST/DB_NAME/DB_USER/DB_PASSWORD` 或 `DATABASE_URL`）
  - 確認防火牆允許連線
  - 如果出現「SASL: client password must be a string」，代表密碼環境變數沒有被設定為字串（或為空/未設定）。請以純文字字串設定 `DB_PASSWORD`，或改用 `DATABASE_URL`

3. **LDAP 認證失敗**
   - 確認 LDAP 伺服器可連線
   - 檢查 LDAP 設定參數
   - 測試 LDAP 查詢

4. **靜態檔案無法載入**
   - 確認前端已正確建置
   - 檢查 web.config 的重寫規則
   - 確認檔案權限

## 生產環境建議

1. **啟用 HTTPS**
   - 安裝 SSL 憑證
   - 在 IIS 中設定 HTTPS binding
   - 強制 HTTP 重定向到 HTTPS

2. **效能優化**
   - 啟用 IIS 壓縮
   - 設定快取標頭
   - 使用 CDN 服務靜態資源

3. **安全性**
   - 定期更新依賴套件
   - 設定強密碼策略
   - 啟用請求限制和防火牆

4. **監控**
   - 設定應用程式效能監控
   - 設定錯誤告警
   - 定期檢查日誌

5. **備份**
   - 定期備份資料庫
   - 備份應用程式檔案
   - 備份設定檔案
