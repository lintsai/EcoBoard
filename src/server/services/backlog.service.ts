import { query } from '../database/pool';

export interface BacklogItem {
  id: number;
  user_id: number;
  content: string;
  item_type: string;
  ai_title?: string;
  ai_summary?: string;
  priority: number;
  estimated_date?: string;
  is_backlog: boolean;
  created_at: string;
  updated_at: string;
}

// 創建 backlog 項目（不綁定 checkin，is_backlog = true）
export const createBacklogItem = async (
  userId: number,
  title: string,
  content: string,
  priority: number = 3,
  estimatedDate?: string
) => {
  // Backlog 項目不需要 checkin_id，設為 NULL 或使用特殊值
  // 這裡我們需要一個虛擬的 checkin_id，或者修改 work_items 表結構
  // 為了保持兼容性，我們創建一個特殊的 "backlog" checkin 記錄
  
  const result = await query(
    `INSERT INTO work_items (
      checkin_id, user_id, content, item_type, 
      ai_title, ai_summary, priority, estimated_date, is_backlog
    )
    VALUES (NULL, $1, $2, 'task', $3, $2, $4, CAST($5 AS DATE), TRUE)
    RETURNING *`,
    [userId, content, title, priority, estimatedDate]
  );

  const workItem = result.rows[0];

  // 將創建者添加為主要處理人
  await query(
    `INSERT INTO work_item_handlers (work_item_id, user_id, handler_type)
     VALUES ($1, $2, 'primary')
     ON CONFLICT (work_item_id, user_id) DO NOTHING`,
    [workItem.id, userId]
  );

  return workItem;
};

// 批量創建 backlog 項目
export const createBacklogItemsBatch = async (
  items: Array<{
    userId: number;
    title: string;
    content: string;
    priority: number;
    estimatedDate?: string;
  }>
) => {
  const results = [];
  
  for (const item of items) {
    const result = await createBacklogItem(
      item.userId,
      item.title,
      item.content,
      item.priority,
      item.estimatedDate
    );
    results.push(result);
  }

  return results;
};

// 獲取用戶的 backlog 項目
export const getUserBacklogItems = async (
  userId: number,
  teamId?: number
) => {
  // Backlog 項目：is_backlog = true
  let queryText = `
    WITH latest_statuses AS (
      SELECT DISTINCT ON (work_item_id)
        work_item_id,
        progress_status
      FROM work_updates
      ORDER BY work_item_id, updated_at DESC
    )
    SELECT 
      wi.id, wi.checkin_id, wi.user_id, wi.content, wi.item_type,
      wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,
      TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
      wi.is_backlog, wi.created_at, wi.updated_at,
      COALESCE(ls.progress_status, 'not_started') as progress_status
    FROM work_items wi
    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id
    INNER JOIN work_item_handlers wih ON wi.id = wih.work_item_id
    WHERE wih.user_id = $1 
      AND wi.is_backlog = TRUE
      AND COALESCE(ls.progress_status, 'not_started') NOT IN ('completed', 'cancelled')
  `;

  const params: any[] = [userId];

  queryText += ` ORDER BY wi.priority ASC, wi.estimated_date ASC NULLS LAST, wi.created_at DESC`;

  const result = await query(queryText, params);
  return result.rows;
};

// 獲取團隊的所有 backlog 項目（管理員查看）
export const getTeamBacklogItems = async (
  teamId: number
) => {
  const queryText = `
    WITH latest_statuses AS (
      SELECT DISTINCT ON (work_item_id)
        work_item_id,
        progress_status
      FROM work_updates
      ORDER BY work_item_id, updated_at DESC
    )
    SELECT 
      wi.*,
      u.username,
      u.display_name,
      COALESCE(ls.progress_status, 'not_started') as progress_status
    FROM work_items wi
    INNER JOIN users u ON wi.user_id = u.id
    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id
    WHERE wi.is_backlog = TRUE
      AND COALESCE(ls.progress_status, 'not_started') NOT IN ('completed', 'cancelled')
    ORDER BY wi.priority ASC, u.display_name, wi.estimated_date ASC NULLS LAST, wi.created_at DESC
  `;

  const result = await query(queryText, [teamId]);
  return result.rows;
};

// 更新 backlog 項目
export const updateBacklogItem = async (
  itemId: number,
  userId: number,
  updates: {
    title?: string;
    content?: string;
    priority?: number;
    estimatedDate?: string;
  }
) => {
  // 檢查權限
  const itemCheck = await query(
    `SELECT wi.id, wi.checkin_id, wi.user_id, wi.content, wi.item_type,
            wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,
            TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
            wi.is_backlog, wi.created_at, wi.updated_at,
            wih.handler_type
     FROM work_items wi
     INNER JOIN work_item_handlers wih ON wi.id = wih.work_item_id
     WHERE wi.id = $1 AND wih.user_id = $2`,
    [itemId, userId]
  );

  if (itemCheck.rows.length === 0) {
    throw new Error('Backlog 項目不存在或無權限');
  }

  const item = itemCheck.rows[0];

  // 確認是 backlog 項目
  if (!item.is_backlog) {
    throw new Error('此項目不是 backlog 項目');
  }

  // 只有主要處理人可以修改
  if (item.handler_type !== 'primary') {
    throw new Error('只有主要處理人可以修改此項目');
  }

  const updateFields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (updates.title !== undefined) {
    updateFields.push(`ai_title = $${paramCount++}`);
    values.push(updates.title);
  }

  if (updates.content !== undefined) {
    updateFields.push(`content = $${paramCount++}, ai_summary = $${paramCount++}`);
    values.push(updates.content);
    values.push(updates.content);
  }

  if (updates.priority !== undefined) {
    updateFields.push(`priority = $${paramCount++}`);
    values.push(updates.priority);
  }

  if (updates.estimatedDate !== undefined) {
    // 使用 CAST 確保日期正確儲存，避免時區問題
    updateFields.push(`estimated_date = CAST($${paramCount++} AS DATE)`);
    values.push(updates.estimatedDate);
  }

  if (updateFields.length === 0) {
    throw new Error('沒有要更新的內容');
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(itemId);

  const sql = `UPDATE work_items 
     SET ${updateFields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`;

  const result = await query(sql, values);
  return result.rows[0];
};

// 刪除 backlog 項目
export const deleteBacklogItem = async (itemId: number, userId: number) => {
  // 檢查權限
  const itemCheck = await query(
    `SELECT wi.id, wi.checkin_id, wi.user_id, wi.content, wi.item_type,
            wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,
            TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
            wi.is_backlog, wi.created_at, wi.updated_at,
            wih.handler_type
     FROM work_items wi
     INNER JOIN work_item_handlers wih ON wi.id = wih.work_item_id
     WHERE wi.id = $1 AND wih.user_id = $2`,
    [itemId, userId]
  );

  if (itemCheck.rows.length === 0) {
    throw new Error('Backlog 項目不存在或無權限');
  }

  const item = itemCheck.rows[0];

  // 確認是 backlog 項目
  if (!item.is_backlog) {
    throw new Error('此項目不是 backlog 項目');
  }

  // 只有主要處理人可以刪除
  if (item.handler_type !== 'primary') {
    throw new Error('只有主要處理人可以刪除此項目');
  }

  // 先刪除 handlers
  await query('DELETE FROM work_item_handlers WHERE work_item_id = $1', [itemId]);
  
  // 刪除相關 updates
  await query('DELETE FROM work_updates WHERE work_item_id = $1', [itemId]);
  
  // 刪除 work item
  const result = await query(
    `DELETE FROM work_items WHERE id = $1 RETURNING *`,
    [itemId]
  );

  return result.rows[0];
};

// 將 backlog 項目加入今日工作項目
export const moveBacklogToWorkItem = async (
  backlogItemId: number,
  userId: number,
  teamId: number
) => {
  // 獲取 backlog 項目
  const backlogResult = await query(
    `SELECT wi.id, wi.checkin_id, wi.user_id, wi.content, wi.item_type,
            wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,
            TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
            wi.is_backlog, wi.created_at, wi.updated_at,
            wih.handler_type
     FROM work_items wi
     INNER JOIN work_item_handlers wih ON wi.id = wih.work_item_id
     WHERE wi.id = $1 AND wih.user_id = $2 AND wi.is_backlog = TRUE`,
    [backlogItemId, userId]
  );

  if (backlogResult.rows.length === 0) {
    throw new Error('Backlog 項目不存在或無權限');
  }

  const backlogItem = backlogResult.rows[0];

  // 獲取今日日期
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const today = taiwanTime.toISOString().split('T')[0];

  // 獲取或創建今日的 checkin
  let checkinResult = await query(
    `SELECT * FROM checkins WHERE user_id = $1 AND team_id = $2 AND checkin_date = $3`,
    [userId, teamId, today]
  );

  if (checkinResult.rows.length === 0) {
    checkinResult = await query(
      `INSERT INTO checkins (user_id, team_id, checkin_date, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [userId, teamId, today]
    );
  }

  const checkinId = checkinResult.rows[0].id;

  // 生成新的 session_id 用於 AI 對談
  const newSessionId = `session_${Date.now()}_${userId}`;

  // 更新工作項目：綁定到今日 checkin，設定 is_backlog = false，並設置新的 session_id
  const result = await query(
    `UPDATE work_items 
     SET checkin_id = $1, is_backlog = FALSE, session_id = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [checkinId, newSessionId, backlogItemId]
  );

  return result.rows[0];
};
