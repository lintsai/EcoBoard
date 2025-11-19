import { query } from '../database/pool';

export interface BacklogItem {
  id: number;
  user_id: number;
  team_id?: number | null;
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

const normalizeDateValue = (value?: string | Date | null) => {
  if (!value) {
    return value;
  }
  if (typeof value === 'string') {
    if (value.includes('T')) {
      return value.split('T')[0];
    }
    if (value.includes(' ')) {
      return value.split(' ')[0];
    }
    return value;
  }
  try {
    return value.toISOString().split('T')[0];
  } catch {
    return value as any;
  }
};

const withNormalizedEstimatedDate = <T extends { estimated_date?: any }>(item: T): T => {
  if (!item || item.estimated_date === undefined) {
    return item;
  }
  return {
    ...item,
    estimated_date: item.estimated_date ? normalizeDateValue(item.estimated_date) : item.estimated_date
  };
};

const ensureTeamMembership = async (teamId: number, userId: number) => {
  const membership = await query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 LIMIT 1',
    [teamId, userId]
  );

  if (membership.rows.length === 0) {
    throw new Error('你無權限操作此 Backlog');
  }
};

const ensureBacklogPermission = async (itemId: number, userId: number) => {
  const result = await query(
    `SELECT wi.id, wi.team_id, wi.user_id, wi.is_backlog,
            wih.handler_type as requester_handler_type
     FROM work_items wi
     LEFT JOIN work_item_handlers wih 
       ON wi.id = wih.work_item_id AND wih.user_id = $2
     WHERE wi.id = $1`,
    [itemId, userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Backlog 項目不存在或無權限');
  }

  const item = result.rows[0];

  if (!item.is_backlog) {
    throw new Error('此項目不是 backlog 項目');
  }

  if (item.team_id) {
    await ensureTeamMembership(item.team_id, userId);
  } else if (!item.requester_handler_type) {
    throw new Error('Backlog 項目不存在或無權限');
  }

  return item;
};

const fetchTeamBacklogItems = async (teamId: number) => {
  const teamBacklogQuery = `
    WITH latest_statuses AS (
      SELECT DISTINCT ON (work_item_id)
        work_item_id,
        progress_status
      FROM work_updates
      ORDER BY work_item_id, updated_at DESC
    )
    SELECT 
      wi.id,
      wi.checkin_id,
      wi.team_id,
      wi.user_id,
      wi.content,
      wi.item_type,
      wi.session_id,
      wi.ai_summary,
      wi.ai_title,
      wi.priority,
      TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
      wi.is_backlog,
      wi.created_at,
      wi.updated_at,
      COALESCE(ls.progress_status, 'not_started') as progress_status,
      u.username,
      u.display_name
    FROM work_items wi
    INNER JOIN users u ON wi.user_id = u.id
    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id
    WHERE wi.is_backlog = TRUE
      AND wi.team_id = $1
      AND COALESCE(ls.progress_status, 'not_started') NOT IN ('completed', 'cancelled')
    ORDER BY wi.priority ASC, wi.estimated_date ASC NULLS LAST, u.display_name, wi.created_at DESC
  `;

  const result = await query(teamBacklogQuery, [teamId]);
  return result.rows;
};

// 創建 backlog 項目（不綁定 checkin，is_backlog = true）
export const createBacklogItem = async (
  userId: number,
  teamId: number,
  title: string,
  content: string,
  priority: number = 3,
  estimatedDate?: string
) => {
  // Backlog 項目不需要 checkin_id，設為 NULL 或使用特殊值
  // 這裡我們需要一個虛擬的 checkin_id，或者修改 work_items 表結構
  // 為了保持兼容性，我們創建一個特殊的 "backlog" checkin 記錄
  
  await ensureTeamMembership(teamId, userId);

  const result = await query(
    `INSERT INTO work_items (
      checkin_id, team_id, user_id, content, item_type, 
      ai_title, ai_summary, priority, estimated_date, is_backlog
    )
    VALUES (NULL, $1, $2, $3, 'task', $4, $3, $5, CAST($6 AS DATE), TRUE)
    RETURNING *`,
    [teamId, userId, content, title, priority, estimatedDate]
  );

  const workItem = result.rows[0];

  // 將創建者添加為主要處理人
  await query(
    `INSERT INTO work_item_handlers (work_item_id, user_id, handler_type)
     VALUES ($1, $2, 'primary')
     ON CONFLICT (work_item_id, user_id) DO NOTHING`,
    [workItem.id, userId]
  );

  return withNormalizedEstimatedDate(workItem);
};

// 批量創建 backlog 項目
export const createBacklogItemsBatch = async (
  userId: number,
  teamId: number,
  items: Array<{
    title: string;
    content: string;
    priority: number;
    estimatedDate?: string;
  }>
) => {
  const results = [];
  
  for (const item of items) {
    const result = await createBacklogItem(
      userId,
      teamId,
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

  if (teamId) {
    await ensureTeamMembership(teamId, userId);
    return fetchTeamBacklogItems(teamId);
  }



  const queryText = `

    WITH latest_statuses AS (

      SELECT DISTINCT ON (work_item_id)

        work_item_id,

        progress_status

      FROM work_updates

      ORDER BY work_item_id, updated_at DESC

    )

    SELECT 

      wi.id, wi.checkin_id, wi.team_id, wi.user_id, wi.content, wi.item_type,

      wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,

      TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,

      wi.is_backlog, wi.created_at, wi.updated_at,

      COALESCE(ls.progress_status, 'not_started') as progress_status,

      u.username,

      u.display_name

    FROM work_items wi

    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id

    INNER JOIN work_item_handlers wih ON wi.id = wih.work_item_id

    INNER JOIN users u ON wi.user_id = u.id

    WHERE wih.user_id = $1 

      AND wi.is_backlog = TRUE

      AND COALESCE(ls.progress_status, 'not_started') NOT IN ('completed', 'cancelled')

    ORDER BY wi.priority ASC, wi.estimated_date ASC NULLS LAST, wi.created_at DESC

  `;



  const result = await query(queryText, [userId]);

  return result.rows;

};

// 獲取團隊的所有 backlog 項目（管理員查看）
export const getTeamBacklogItems = async (
  teamId: number,
  requesterId: number
) => {
  await ensureTeamMembership(teamId, requesterId);
  return fetchTeamBacklogItems(teamId);
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
    teamId?: number;
  }
) => {
  const item = await ensureBacklogPermission(itemId, userId);

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

  if (updates.teamId !== undefined) {
    await ensureTeamMembership(updates.teamId, userId);
    updateFields.push(`team_id = $${paramCount++}`);
    values.push(updates.teamId);
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
  return withNormalizedEstimatedDate(result.rows[0]);
};

// 刪除 backlog 項目
export const deleteBacklogItem = async (itemId: number, userId: number) => {
  const item = await ensureBacklogPermission(itemId, userId);

  // 先刪除 handlers
  await query('DELETE FROM work_item_handlers WHERE work_item_id = $1', [itemId]);
  
  // 刪除相關 updates
  await query('DELETE FROM work_updates WHERE work_item_id = $1', [itemId]);
  
  // 刪除 work item
  const result = await query(
    `DELETE FROM work_items WHERE id = $1 RETURNING *`,
    [itemId]
  );

  return withNormalizedEstimatedDate(result.rows[0]);
};

// 將 backlog 項目加入今日工作項目
export const moveBacklogToWorkItem = async (
  backlogItemId: number,
  userId: number,
  teamId: number
) => {
  // 取得 backlog 項目（不限制建立者）
  const backlogResult = await query(
    `SELECT wi.id, wi.checkin_id, wi.team_id, wi.user_id, wi.content, wi.item_type,
            wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,
            TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
            wi.is_backlog, wi.created_at, wi.updated_at,
            (SELECT user_id FROM work_item_handlers 
             WHERE work_item_id = wi.id AND handler_type = 'primary'
             LIMIT 1) as primary_handler_id
     FROM work_items wi
     WHERE wi.id = $1 AND wi.is_backlog = TRUE`,
    [backlogItemId]
  );

  if (backlogResult.rows.length === 0) {
    throw new Error('Backlog 項目不存在或無權限');
  }

  const backlogItem = backlogResult.rows[0];
  const backlogTeamId: number | null = backlogItem.team_id;
  const effectiveTeamId = backlogTeamId ?? teamId;

  if (!effectiveTeamId) {
    throw new Error('Backlog 項目尚未指定團隊，無法加入今日工作');
  }

  if (backlogTeamId && backlogTeamId !== teamId) {
    throw new Error('Backlog 項目不屬於此團隊，無權限操作');
  }

  await ensureTeamMembership(effectiveTeamId, userId);

  // 獲取今日日期
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const today = taiwanTime.toISOString().split('T')[0];

  // 獲取或創建今日的 checkin
  let checkinResult = await query(
    `SELECT * FROM checkins WHERE user_id = $1 AND team_id = $2 AND checkin_date = $3`,
    [userId, effectiveTeamId, today]
  );

  if (checkinResult.rows.length === 0) {
    checkinResult = await query(
      `INSERT INTO checkins (user_id, team_id, checkin_date, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [userId, effectiveTeamId, today]
    );
  }

  const checkinId = checkinResult.rows[0].id;

  // 生成新的 session_id 用於 AI 對談
  const newSessionId = `session_${Date.now()}_${userId}`;

  // 更新工作項目：綁定到今日 checkin，設定 is_backlog = false，並設置新的 session_id 與負責人
  const result = await query(
    `UPDATE work_items 
     SET checkin_id = $1, 
         team_id = $2, 
         user_id = $3,
         is_backlog = FALSE, 
         session_id = $4, 
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [checkinId, effectiveTeamId, userId, newSessionId, backlogItemId]
  );

  const updatedItem = result.rows[0];

  // 更新 handlers：將既有主要處理人改為協同處理人，並設置目前使用者為主要處理人
  await query(
    `UPDATE work_item_handlers 
     SET handler_type = 'co_handler'
     WHERE work_item_id = $1 AND handler_type = 'primary' AND user_id <> $2`,
    [backlogItemId, userId]
  );

  await query(
    `INSERT INTO work_item_handlers (work_item_id, user_id, handler_type)
     VALUES ($1, $2, 'primary')
     ON CONFLICT (work_item_id, user_id)
     DO UPDATE SET handler_type = 'primary'`,
    [backlogItemId, userId]
  );

  return withNormalizedEstimatedDate(updatedItem);
};
