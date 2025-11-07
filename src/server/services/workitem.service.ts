import { query } from '../database/pool';

// 統一的今日日期函數（使用台灣時區 UTC+8）
const getTodayDate = () => {
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return taiwanTime.toISOString().split('T')[0];
};

export const createWorkItem = async (
  checkinId: number,
  userId: number,
  content: string,
  itemType: string = 'task',
  sessionId?: string,
  aiSummary?: string,
  aiTitle?: string
) => {
  const result = await query(
    `INSERT INTO work_items (checkin_id, user_id, content, item_type, session_id, ai_summary, ai_title)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [checkinId, userId, content, itemType, sessionId, aiSummary, aiTitle]
  );

  return result.rows[0];
};

export const getTodayUserWorkItems = async (
  userId: number,
  teamId?: number
) => {
  const today = getTodayDate();

  let queryText = `
    SELECT wi.*, c.team_id, c.checkin_date
    FROM work_items wi
    INNER JOIN checkins c ON wi.checkin_id = c.id
    WHERE wi.user_id = $1 AND c.checkin_date = $2
  `;

  const params: any[] = [userId, today];

  if (teamId) {
    queryText += ` AND c.team_id = $3`;
    params.push(teamId);
  }

  queryText += ` ORDER BY wi.created_at`;

  const result = await query(queryText, params);
  return result.rows;
};

export const getTodayTeamWorkItems = async (teamId: number) => {
  const today = getTodayDate();

  const result = await query(
    `SELECT wi.*, u.username, u.display_name, c.checkin_date
     FROM work_items wi
     INNER JOIN checkins c ON wi.checkin_id = c.id
     INNER JOIN users u ON wi.user_id = u.id
     WHERE c.team_id = $1 AND c.checkin_date = $2
     ORDER BY u.display_name, wi.created_at`,
    [teamId, today]
  );

  return result.rows;
};

export const updateWorkItem = async (
  itemId: number,
  userId: number,
  content?: string,
  aiSummary?: string,
  aiTitle?: string
) => {
  console.log('[updateWorkItem] Called with:', { itemId, userId, content, aiSummary, aiTitle });
  
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (content !== undefined) {
    updates.push(`content = $${paramCount++}`);
    values.push(content);
  }
  
  if (aiSummary !== undefined) {
    updates.push(`ai_summary = $${paramCount++}`);
    values.push(aiSummary);
  }
  
  if (aiTitle !== undefined) {
    updates.push(`ai_title = $${paramCount++}`);
    values.push(aiTitle);
  }

  if (updates.length === 0) {
    throw new Error('沒有要更新的內容');
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  
  // Add WHERE clause parameters
  const itemIdParam = paramCount++;
  const userIdParam = paramCount++;
  values.push(itemId, userId);

  const sql = `UPDATE work_items 
     SET ${updates.join(', ')}
     WHERE id = $${itemIdParam} AND user_id = $${userIdParam}
     RETURNING *`;
  
  console.log('[updateWorkItem] SQL:', sql);
  console.log('[updateWorkItem] Values:', values);

  const result = await query(sql, values);

  if (result.rows.length === 0) {
    throw new Error('工作項目不存在或無權限修改');
  }

  return result.rows[0];
};

// 重新分配工作項目給其他成員
export const reassignWorkItem = async (
  itemId: number,
  newUserId: number,
  operatorUserId: number
) => {
  console.log('[reassignWorkItem] Called with:', { itemId, newUserId, operatorUserId });
  
  // Check if operator has permission (must be manager or owner)
  const permissionCheck = await query(
    `SELECT wi.*, c.team_id, tm.role
     FROM work_items wi
     INNER JOIN checkins c ON wi.checkin_id = c.id
     LEFT JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = $2
     WHERE wi.id = $1`,
    [itemId, operatorUserId]
  );

  console.log('[reassignWorkItem] Permission check result:', permissionCheck.rows.length);

  if (permissionCheck.rows.length === 0) {
    throw new Error('工作項目不存在');
  }

  const item = permissionCheck.rows[0];
  
  // Only owner or admin can reassign
  if (item.user_id !== operatorUserId && item.role !== 'admin') {
    throw new Error('無權限重新分配此工作項目');
  }

  // Check if new user is in the same team
  const teamCheck = await query(
    `SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [item.team_id, newUserId]
  );

  if (teamCheck.rows.length === 0) {
    throw new Error('目標用戶不在同一團隊中');
  }

  // Get new user's checkin for today
  const today = getTodayDate();
  let checkinResult = await query(
    `SELECT * FROM checkins WHERE user_id = $1 AND team_id = $2 AND checkin_date = $3`,
    [newUserId, item.team_id, today]
  );

  // Create checkin if not exists
  if (checkinResult.rows.length === 0) {
    checkinResult = await query(
      `INSERT INTO checkins (user_id, team_id, checkin_date, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [newUserId, item.team_id, today]
    );
  }

  const newCheckinId = checkinResult.rows[0].id;

  console.log('[reassignWorkItem] Updating work item:', { itemId, newUserId, newCheckinId });

  // Update work item
  const result = await query(
    `UPDATE work_items 
     SET user_id = $1, checkin_id = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING *`,
    [newUserId, newCheckinId, itemId]
  );

  console.log('[reassignWorkItem] Update result:', result.rows.length);

  return result.rows[0];
};

export const createWorkUpdate = async (
  workItemId: number,
  userId: number,
  updateContent: string,
  progressStatus?: string
) => {
  // Verify work item belongs to user
  const itemCheck = await query(
    `SELECT * FROM work_items WHERE id = $1 AND user_id = $2`,
    [workItemId, userId]
  );

  if (itemCheck.rows.length === 0) {
    throw new Error('工作項目不存在或無權限更新');
  }

  const result = await query(
    `INSERT INTO work_updates (work_item_id, user_id, update_content, progress_status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [workItemId, userId, updateContent, progressStatus]
  );

  return result.rows[0];
};

export const getWorkItemUpdates = async (workItemId: number) => {
  const result = await query(
    `SELECT wu.*, u.username, u.display_name
     FROM work_updates wu
     INNER JOIN users u ON wu.user_id = u.id
     WHERE wu.work_item_id = $1
     ORDER BY wu.updated_at DESC`,
    [workItemId]
  );

  return result.rows;
};

export const getWorkItemById = async (itemId: number) => {
  const result = await query(
    `SELECT wi.*, u.username, u.display_name
     FROM work_items wi
     INNER JOIN users u ON wi.user_id = u.id
     WHERE wi.id = $1`,
    [itemId]
  );

  return result.rows[0] || null;
};

export const deleteWorkItem = async (itemId: number, userId: number) => {
  // Check if user owns the work item or is a manager
  const workItem = await query(
    `SELECT wi.*, tm.role
     FROM work_items wi
     INNER JOIN checkins c ON wi.checkin_id = c.id
     LEFT JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = $2
     WHERE wi.id = $1`,
    [itemId, userId]
  );

  if (workItem.rows.length === 0) {
    throw new Error('工作項目不存在');
  }

  const item = workItem.rows[0];
  
  // Only owner or manager can delete
  if (item.user_id !== userId && item.role !== 'manager') {
    throw new Error('無權限刪除此工作項目');
  }

  // Delete related updates first
  await query('DELETE FROM work_updates WHERE work_item_id = $1', [itemId]);
  
  // Delete the work item
  const result = await query(
    'DELETE FROM work_items WHERE id = $1 RETURNING *',
    [itemId]
  );

  return result.rows[0];
};
