import ldap from 'ldapjs';

interface LDAPUser {
  username: string;
  displayName: string;
  email?: string;
  dn: string;
}

/**
 * 標準化使用者名稱：移除 email domain 並轉換為小寫
 */
function normalizeUsername(username: string): string {
  // 如果包含 @，取 @ 之前的部分
  const usernameWithoutDomain = username.includes('@') 
    ? username.split('@')[0] 
    : username;
  
  // 統一轉換為小寫
  return usernameWithoutDomain.toLowerCase();
}

/**
 * LDAP 認證 - 簡化版
 * 嘗試多種常見的 DN 格式，只要密碼驗證通過即可
 * 支援大小寫不敏感和 email 格式輸入
 */
export const authenticateLDAP = async (
  username: string,
  password: string
): Promise<LDAPUser | null> => {
  const ldapURL = process.env.LDAP_URL || 'ldap://your-ldap-server:389';
  const baseDn = process.env.LDAP_BASE_DN || 'DC=example,DC=com';
  const domain = process.env.LDAP_DOMAIN || 'example.com';
  
  // 標準化使用者名稱（移除 domain 並轉小寫）
  const normalizedUsername = normalizeUsername(username);
  
  // 嘗試多種常見的 DN 格式（使用原始輸入）
  const dnFormats = [
    username,  // 直接使用帳號（如果是 UPN 格式 user@domain）
    `${username}@${domain}`,  // UPN 格式
    `cn=${username},${baseDn}`,  // cn 格式
    `uid=${username},${baseDn}`,  // uid 格式
    `sAMAccountName=${username},${baseDn}`,  // sAMAccountName 格式
    `cn=${username},ou=users,${baseDn}`,  // cn with ou=users
    `uid=${username},ou=users,${baseDn}`,  // uid with ou=users
  ];

  console.log(`開始 LDAP 認證，使用者：${username} (標準化為: ${normalizedUsername})`);
  console.log(`LDAP Server：${ldapURL}`);
  console.log(`Base DN：${baseDn}`);

  // 逐一嘗試每種 DN 格式
  for (const userDn of dnFormats) {
    console.log(`嘗試 DN 格式：${userDn}`);
    
    const result = await tryBind(ldapURL, userDn, password, normalizedUsername);
    if (result) {
      console.log(`✓ 認證成功！使用 DN：${userDn}`);
      return result;
    }
  }

  console.error(`✗ 所有 DN 格式都認證失敗`);
  return null;
};

/**
 * 嘗試使用特定 DN 進行綁定
 */
async function tryBind(
  ldapURL: string,
  userDn: string,
  password: string,
  normalizedUsername: string
): Promise<LDAPUser | null> {
  return new Promise((resolve) => {
    const client = ldap.createClient({
      url: ldapURL,
      timeout: 3000,
      connectTimeout: 5000,
      reconnect: false
    });

    // 錯誤處理
    client.on('error', (err) => {
      console.error(`連線錯誤 (${userDn}):`, err.message);
      try {
        client.unbind();
      } catch (e) {
        // ignore
      }
      resolve(null);
    });

    // 嘗試綁定
    client.bind(userDn, password, (bindErr) => {
      if (bindErr) {
        console.log(`  ✗ 綁定失敗 (${userDn}):`, bindErr.message);
        try {
          client.unbind();
        } catch (e) {
          // ignore
        }
        resolve(null);
        return;
      }

      // 綁定成功，直接返回使用者資訊
      console.log(`  ✓ 綁定成功 (${userDn})`);
      
      try {
        client.unbind();
      } catch (e) {
        // ignore
      }

      // 返回基本使用者資訊（使用標準化的小寫帳號）
      resolve({
        username: normalizedUsername,
        displayName: normalizedUsername,  // 使用標準化的小寫帳號作為顯示名稱
        email: undefined,
        dn: userDn
      });
    });

    // 設定超時
    setTimeout(() => {
      try {
        client.unbind();
      } catch (e) {
        // ignore
      }
      resolve(null);
    }, 5000);
  });
}

