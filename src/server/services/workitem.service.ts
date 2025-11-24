import { query } from '../database/pool';

// 統一的今日日期函數（使用台灣時區 UTC+8）
const getTodayDate = () => {
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return taiwanTime.toISOString().split('T')[0];
};

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

const normalizeEstimatedDateList = <T extends { estimated_date?: any }>(items: T[]): T[] =>
  items.map(withNormalizedEstimatedDate);

interface CompletedHistoryFilters {
  teamId?: number;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  limit?: number;
  page?: number;
  status?: 'completed' | 'cancelled';
  sortBy?: 'completed_desc' | 'completed_asc' | 'id_desc' | 'id_asc';
}

interface CompletedHistoryPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CompletedHistoryResult {
  items: any[];
  pagination: CompletedHistoryPagination;
}

// 獲取工作項目的所有處理人
const getWorkItemHandlers = async (workItemIds: number[]) => {
  if (workItemIds.length === 0) return {};

  const result = await query(
    `SELECT 
      wih.work_item_id,
      wih.handler_type,
      u.id as user_id,
      u.username,
      u.display_name
     FROM work_item_handlers wih
     INNER JOIN users u ON wih.user_id = u.id
     WHERE wih.work_item_id = ANY($1)
     ORDER BY wih.work_item_id, 
              CASE wih.handler_type WHEN 'primary' THEN 0 ELSE 1 END,
              u.display_name`,
    [workItemIds]
  );

  const handlersMap: Record<number, any> = {};
  
  result.rows.forEach(row => {
    if (!handlersMap[row.work_item_id]) {
      handlersMap[row.work_item_id] = {
        primary: null,
        co_handlers: []
      };
    }
    
    const handler = {
      user_id: row.user_id,
      username: row.username,
      display_name: row.display_name
    };
    
    if (row.handler_type === 'primary') {
      handlersMap[row.work_item_id].primary = handler;
    } else {
      handlersMap[row.work_item_id].co_handlers.push(handler);
    }
  });

  return handlersMap;
};

export const createWorkItem = async (
  checkinId: number,
  userId: number,
  content: string,
  itemType: string = 'task',
  sessionId?: string,
  aiSummary?: string,
  aiTitle?: string,
  priority: number = 3
) => {
  const result = await query(
    `INSERT INTO work_items (
      checkin_id,
      team_id,
      user_id,
      content,
      item_type,
      session_id,
      ai_summary,
      ai_title,
      priority
    )
    SELECT
      $1,
      c.team_id,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8
    FROM checkins c
    WHERE c.id = $1
    RETURNING *`,
    [checkinId, userId, content, itemType, sessionId, aiSummary, aiTitle, priority]
  );

  if (result.rows.length === 0) {
    throw new Error('找不到對應的打卡記錄，無法建立工作項目');
  }

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

export const getTodayUserWorkItems = async (
  userId: number,
  teamId?: number
) => {
  const today = getTodayDate();

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
      c.team_id, 
      c.checkin_date,
      COALESCE(ls.progress_status, 'in_progress') as progress_status
    FROM work_items wi
    INNER JOIN checkins c ON wi.checkin_id = c.id
    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id
    INNER JOIN work_item_handlers wih ON wi.id = wih.work_item_id
    WHERE wih.user_id = $1 AND c.checkin_date = $2
      AND (wi.is_backlog IS NULL OR wi.is_backlog = FALSE)
  `;

  const params: any[] = [userId, today];

  if (teamId) {
    queryText += ` AND c.team_id = $3`;
    params.push(teamId);
  }

  queryText += ` ORDER BY wi.priority ASC, wi.created_at`;

  const result = await query(queryText, params);
  
  // 獲取所有處理人信息
  const workItemIds = result.rows.map(row => row.id);
  const handlersMap = await getWorkItemHandlers(workItemIds);
  
  // 將處理人信息附加到每個工作項目
  const workItems = result.rows.map(row => ({
    ...row,
    handlers: handlersMap[row.id] || { primary: null, co_handlers: [] }
  }));
  
  return normalizeEstimatedDateList(workItems);
};

export const getTodayTeamWorkItems = async (teamId: number) => {
  const today = getTodayDate();

  const result = await query(
    `WITH latest_statuses AS (
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
      u.username, 
      u.display_name, 
      c.checkin_date,
      COALESCE(ls.progress_status, 'in_progress') as progress_status
    FROM work_items wi
    INNER JOIN checkins c ON wi.checkin_id = c.id
    INNER JOIN users u ON wi.user_id = u.id
    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id
    WHERE c.team_id = $1 AND c.checkin_date = $2
      AND (wi.is_backlog IS NULL OR wi.is_backlog = FALSE)
    ORDER BY wi.priority ASC, u.display_name, wi.created_at`,
    [teamId, today]
  );

  // 獲取所有處理人信息
  const workItemIds = result.rows.map(row => row.id);
  const handlersMap = await getWorkItemHandlers(workItemIds);
  
  // 將處理人信息附加到每個工作項目
  const workItems = result.rows.map(row => ({
    ...row,
    handlers: handlersMap[row.id] || { primary: null, co_handlers: [] }
  }));

  return normalizeEstimatedDateList(workItems);
};

export const updateWorkItem = async (
  itemId: number,
  userId: number,
  content?: string,
  aiSummary?: string,
  aiTitle?: string,
  priority?: number,
  estimatedDate?: string,
  sessionId?: string
) => {
  console.log('[updateWorkItem] Called with:', { itemId, userId, content, aiSummary, aiTitle, priority, estimatedDate, sessionId });
  
  // 檢查用戶是否為處理人（主要或共同）
  const handlerCheck = await query(
    `SELECT handler_type FROM work_item_handlers 
     WHERE work_item_id = $1 AND user_id = $2`,
    [itemId, userId]
  );

  if (handlerCheck.rows.length === 0) {
    throw new Error('工作項目不存在或您不是處理人');
  }

  const isPrimary = handlerCheck.rows[0].handler_type === 'primary';

  // 只有主要處理人可以修改工作項目內容、AI摘要和標題
  if (!isPrimary && (content !== undefined || aiSummary !== undefined || aiTitle !== undefined)) {
    throw new Error('只有主要處理人可以修改工作項目內容');
  }

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

  // session_id 可以更新（用於關聯 AI 對話記錄）
  if (sessionId !== undefined) {
    updates.push(`session_id = $${paramCount++}`);
    values.push(sessionId);
  }

  // 優先級和預計時間所有處理人都可以修改
  if (priority !== undefined) {
    updates.push(`priority = $${paramCount++}`);
    values.push(priority);
  }

  if (estimatedDate !== undefined) {
    // 使用 CAST 確保日期正確儲存，避免時區問題
    updates.push(`estimated_date = CAST($${paramCount++} AS DATE)`);
    values.push(estimatedDate);
  }

  if (updates.length === 0) {
    throw new Error('沒有要更新的內容');
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  
  // Add WHERE clause parameters
  const itemIdParam = paramCount++;
  values.push(itemId);

  const sql = `UPDATE work_items 
     SET ${updates.join(', ')}
     WHERE id = $${itemIdParam}
     RETURNING *`;
  
  console.log('[updateWorkItem] SQL:', sql);
  console.log('[updateWorkItem] Values:', values);

  const result = await query(sql, values);

  if (result.rows.length === 0) {
    throw new Error('工作項目不存在');
  }

  return withNormalizedEstimatedDate(result.rows[0]);
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
    `SELECT wi.id, wi.checkin_id, wi.user_id, wi.content, wi.item_type,
            wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,
            TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
            wi.is_backlog, wi.created_at, wi.updated_at,
            c.team_id, tm.role
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
  const checkinResult = await query(
    `SELECT * FROM checkins WHERE user_id = $1 AND team_id = $2 AND checkin_date = $3`,
    [newUserId, item.team_id, today]
  );

  // Check if new user has checked in today
  if (checkinResult.rows.length === 0) {
    throw new Error('目標用戶今日尚未打卡，無法分配工作項目');
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

  // Update handlers table - change the primary handler
  // First, check if there's an existing primary handler
  const existingPrimary = await query(
    `SELECT * FROM work_item_handlers 
     WHERE work_item_id = $1 AND handler_type = 'primary'`,
    [itemId]
  );

  if (existingPrimary.rows.length > 0) {
    const oldPrimaryUserId = existingPrimary.rows[0].user_id;
    
    // Remove old primary handler
    await query(
      `DELETE FROM work_item_handlers 
       WHERE work_item_id = $1 AND user_id = $2`,
      [itemId, oldPrimaryUserId]
    );
  }

  // Add new primary handler (or update if they were a co-handler)
  await query(
    `INSERT INTO work_item_handlers (work_item_id, user_id, handler_type)
     VALUES ($1, $2, 'primary')
     ON CONFLICT (work_item_id, user_id) 
     DO UPDATE SET handler_type = 'primary'`,
    [itemId, newUserId]
  );

  console.log('[reassignWorkItem] Updated handlers table');

  return withNormalizedEstimatedDate(result.rows[0]);
};

export const createWorkUpdate = async (
  workItemId: number,
  userId: number,
  updateContent: string,
  progressStatus?: string
) => {
  // 驗證用戶是否為此工作項目的處理人（主要或共同）
  const handlerCheck = await query(
    `SELECT handler_type FROM work_item_handlers 
     WHERE work_item_id = $1 AND user_id = $2`,
    [workItemId, userId]
  );

  if (handlerCheck.rows.length === 0) {
    throw new Error('工作項目不存在或您不是處理人');
  }

  const handlerType = handlerCheck.rows[0].handler_type;

  // 共同處理人不能修改狀態為 completed 或 cancelled
  if (handlerType === 'co_handler' && progressStatus && 
      (progressStatus === 'completed' || progressStatus === 'cancelled')) {
    throw new Error('共同處理人不能將工作項目標記為完成或取消');
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
    `SELECT wi.id, wi.checkin_id, wi.user_id, wi.content, wi.item_type,
            wi.session_id, wi.ai_summary, wi.ai_title, wi.priority,
            TO_CHAR(wi.estimated_date, 'YYYY-MM-DD') as estimated_date,
            wi.is_backlog, wi.created_at, wi.updated_at,
            u.username, u.display_name
     FROM work_items wi
     INNER JOIN users u ON wi.user_id = u.id
     WHERE wi.id = $1`,
    [itemId]
  );

  return result.rows[0] || null;
};

// 添加共同處理人
export const addCoHandler = async (
  workItemId: number,
  coHandlerUserId: number,
  operatorUserId: number
) => {
  console.log('[addCoHandler] Called with:', { workItemId, coHandlerUserId, operatorUserId });

  // 檢查操作者是否為主要處理人或管理員
  const permissionCheck = await query(
    `SELECT wi.*, wih.handler_type, c.team_id, tm.role
     FROM work_items wi
     INNER JOIN checkins c ON wi.checkin_id = c.id
     LEFT JOIN work_item_handlers wih ON wi.id = wih.work_item_id AND wih.user_id = $2
     LEFT JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = $2
     WHERE wi.id = $1`,
    [workItemId, operatorUserId]
  );

  if (permissionCheck.rows.length === 0) {
    throw new Error('工作項目不存在');
  }

  const item = permissionCheck.rows[0];
  
  // 只有主要處理人或管理員可以添加共同處理人
  if (item.handler_type !== 'primary' && item.role !== 'admin') {
    throw new Error('只有主要處理人或管理員可以添加共同處理人');
  }

  // 檢查共同處理人是否在同一團隊
  const teamCheck = await query(
    `SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [item.team_id, coHandlerUserId]
  );

  if (teamCheck.rows.length === 0) {
    throw new Error('共同處理人必須在同一團隊中');
  }

  // 檢查是否已經是處理人
  const existingHandler = await query(
    `SELECT * FROM work_item_handlers WHERE work_item_id = $1 AND user_id = $2`,
    [workItemId, coHandlerUserId]
  );

  if (existingHandler.rows.length > 0) {
    throw new Error('該用戶已經是此工作項目的處理人');
  }

  // 添加共同處理人
  const result = await query(
    `INSERT INTO work_item_handlers (work_item_id, user_id, handler_type)
     VALUES ($1, $2, 'co_handler')
     RETURNING *`,
    [workItemId, coHandlerUserId]
  );

  console.log('[addCoHandler] Added successfully');
  return result.rows[0];
};

// 移除共同處理人
export const removeCoHandler = async (
  workItemId: number,
  coHandlerUserId: number,
  operatorUserId: number
) => {
  console.log('[removeCoHandler] Called with:', { workItemId, coHandlerUserId, operatorUserId });

  // 檢查操作者是否為主要處理人或管理員
  const permissionCheck = await query(
    `SELECT wi.*, wih.handler_type, c.team_id, tm.role
     FROM work_items wi
     INNER JOIN checkins c ON wi.checkin_id = c.id
     LEFT JOIN work_item_handlers wih ON wi.id = wih.work_item_id AND wih.user_id = $2
     LEFT JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = $2
     WHERE wi.id = $1`,
    [workItemId, operatorUserId]
  );

  if (permissionCheck.rows.length === 0) {
    throw new Error('工作項目不存在');
  }

  const item = permissionCheck.rows[0];
  
  // 只有主要處理人或管理員可以移除共同處理人
  if (item.handler_type !== 'primary' && item.role !== 'admin') {
    throw new Error('只有主要處理人或管理員可以移除共同處理人');
  }

  // 檢查要移除的是否為共同處理人
  const handlerCheck = await query(
    `SELECT handler_type FROM work_item_handlers 
     WHERE work_item_id = $1 AND user_id = $2`,
    [workItemId, coHandlerUserId]
  );

  if (handlerCheck.rows.length === 0) {
    throw new Error('該用戶不是此工作項目的處理人');
  }

  if (handlerCheck.rows[0].handler_type === 'primary') {
    throw new Error('不能移除主要處理人');
  }

  // 移除共同處理人
  const result = await query(
    `DELETE FROM work_item_handlers 
     WHERE work_item_id = $1 AND user_id = $2 AND handler_type = 'co_handler'
     RETURNING *`,
    [workItemId, coHandlerUserId]
  );

  console.log('[removeCoHandler] Removed successfully');
  return result.rows[0];
};

// 移動未完成的工作項目到今日
export const moveWorkItemToToday = async (
  itemId: number,
  userId: number
) => {
  console.log('[moveWorkItemToToday] Called with:', { itemId, userId });
  
  // Check if user owns the work item
  const itemCheck = await query(
    `SELECT wi.*, c.team_id, c.checkin_date
     FROM work_items wi
     INNER JOIN checkins c ON wi.checkin_id = c.id
     WHERE wi.id = $1 AND wi.user_id = $2`,
    [itemId, userId]
  );

  if (itemCheck.rows.length === 0) {
    throw new Error('工作項目不存在或無權限移動');
  }

  const item = itemCheck.rows[0];
  const today = getTodayDate();
  
  // Check if already today's item
  if (item.checkin_date === today) {
    throw new Error('此項目已經是今日的工作項目');
  }

  // Get or create today's checkin
  let checkinResult = await query(
    `SELECT * FROM checkins WHERE user_id = $1 AND team_id = $2 AND checkin_date = $3`,
    [userId, item.team_id, today]
  );

  if (checkinResult.rows.length === 0) {
    checkinResult = await query(
      `INSERT INTO checkins (user_id, team_id, checkin_date, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [userId, item.team_id, today]
    );
  }

  const todayCheckinId = checkinResult.rows[0].id;

  console.log('[moveWorkItemToToday] Moving to checkin:', todayCheckinId);

  // Update work item to today's checkin
  const result = await query(
    `UPDATE work_items 
     SET checkin_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [todayCheckinId, itemId]
  );

  console.log('[moveWorkItemToToday] Moved successfully');

  return withNormalizedEstimatedDate(result.rows[0]);
};

export const moveWorkItemToBacklog = async (
  itemId: number,
  userId: number
) => {
  const itemResult = await query(
    `SELECT wi.id,
            wi.checkin_id,
            wi.team_id,
            wi.is_backlog,
            COALESCE(wi.team_id, c.team_id) as resolved_team_id,
            wih.handler_type
     FROM work_items wi
     LEFT JOIN checkins c ON wi.checkin_id = c.id
     LEFT JOIN work_item_handlers wih 
       ON wi.id = wih.work_item_id AND wih.user_id = $2
     WHERE wi.id = $1`,
    [itemId, userId]
  );

  if (itemResult.rows.length === 0) {
    throw new Error('工作項目不存在或無權限操作');
  }

  const item = itemResult.rows[0];

  if (!item.handler_type) {
    throw new Error('工作項目不存在或無權限操作');
  }

  if (item.handler_type !== 'primary') {
    throw new Error('只有主要處理人可以將項目轉回 Backlog');
  }

  if (item.is_backlog) {
    throw new Error('此工作項目已經在 Backlog 中');
  }

  const targetTeamId = item.resolved_team_id;

  if (!targetTeamId) {
    throw new Error('找不到對應的團隊，無法轉回 Backlog');
  }

  const result = await query(
    `UPDATE work_items
     SET checkin_id = NULL,
         team_id = $1,
         is_backlog = TRUE,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [targetTeamId, itemId]
  );

  return withNormalizedEstimatedDate(result.rows[0]);
};

// 獲取用戶的未完成工作項目（不限日期，但排除已完成的和今日的項目）
export const getIncompleteUserWorkItems = async (
  userId: number,
  teamId?: number
) => {
  const today = getTodayDate();
  
  // 子查詢：獲取每個工作項目的最新狀態
  let queryText = `
    WITH latest_statuses AS (
      SELECT DISTINCT ON (work_item_id)
        work_item_id,
        progress_status
      FROM work_updates
      ORDER BY work_item_id, updated_at DESC
    )
    SELECT 
      wi.*,
      c.team_id,
      c.checkin_date,
      COALESCE(ls.progress_status, 'not_started') as progress_status
    FROM work_items wi
    INNER JOIN checkins c ON wi.checkin_id = c.id
    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id
    INNER JOIN work_item_handlers wih ON wi.id = wih.work_item_id
    WHERE wih.user_id = $1
      AND COALESCE(ls.progress_status, 'not_started') NOT IN ('completed', 'cancelled')
      AND c.checkin_date < $2
      AND (wi.is_backlog IS NULL OR wi.is_backlog = FALSE)
  `;

  const params: any[] = [userId, today];
  let paramCount = 3;

  if (teamId) {
    queryText += ` AND c.team_id = $${paramCount}`;
    params.push(teamId);
    paramCount++;
  }

  queryText += ` ORDER BY wi.priority ASC, c.checkin_date DESC, wi.created_at DESC`;

  const result = await query(queryText, params);
  
  // 獲取所有處理人信息
  const workItemIds = result.rows.map(row => row.id);
  const handlersMap = await getWorkItemHandlers(workItemIds);
  
  // 將處理人信息附加到每個工作項目
  const workItems = result.rows.map(row => ({
    ...row,
    handlers: handlersMap[row.id] || { primary: null, co_handlers: [] }
  }));

  return normalizeEstimatedDateList(workItems);
};

// 獲取團隊的未完成工作項目（供管理員查看，排除今日項目）
export const getIncompleteTeamWorkItems = async (teamId: number) => {
  const today = getTodayDate();
  
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
      c.checkin_date,
      COALESCE(ls.progress_status, 'not_started') as progress_status
    FROM work_items wi
    INNER JOIN checkins c ON wi.checkin_id = c.id
    INNER JOIN users u ON wi.user_id = u.id
    LEFT JOIN latest_statuses ls ON wi.id = ls.work_item_id
    WHERE c.team_id = $1
      AND COALESCE(ls.progress_status, 'not_started') NOT IN ('completed', 'cancelled')
      AND c.checkin_date < $2
      AND (wi.is_backlog IS NULL OR wi.is_backlog = FALSE)
    ORDER BY wi.priority ASC, u.display_name, c.checkin_date DESC, wi.created_at DESC
  `;

  const result = await query(queryText, [teamId, today]);
  
  // 獲取所有處理人信息
  const workItemIds = result.rows.map(row => row.id);
  const handlersMap = await getWorkItemHandlers(workItemIds);
  
  // 將處理人信息附加到每個工作項目
  const workItems = result.rows.map(row => ({
    ...row,
    handlers: handlersMap[row.id] || { primary: null, co_handlers: [] }
  }));

  return normalizeEstimatedDateList(workItems);
};

export const getCompletedWorkHistory = async (
  userId: number,
  filters: CompletedHistoryFilters
): Promise<CompletedHistoryResult> => {
  const sanitizedLimit = Math.min(Math.max(filters.limit ?? 30, 1), 200);
  const requestedPage = Math.max(filters.page ?? 1, 1);
  const sortBy = filters.sortBy ?? 'completed_desc';
  const params: any[] = [userId];
  let paramIndex = 2;
  const conditions: string[] = [];

  if (filters.teamId) {
    conditions.push(`COALESCE(wi.team_id, c.team_id) = $${paramIndex}`);
    params.push(filters.teamId);
    paramIndex++;
  }

  if (filters.startDate) {
    conditions.push(`su.status_changed_at::date >= $${paramIndex}`);
    params.push(filters.startDate);
    paramIndex++;
  }

  if (filters.endDate) {
    conditions.push(`su.status_changed_at::date <= $${paramIndex}`);
    params.push(filters.endDate);
    paramIndex++;
  }

  if (filters.keyword) {
    const keywordParamRef = `$${paramIndex}`;
    conditions.push(`(
      LOWER(COALESCE(wi.ai_title, '')) LIKE ${keywordParamRef} OR
      LOWER(wi.content) LIKE ${keywordParamRef} OR
      LOWER(COALESCE(su.update_content, '')) LIKE ${keywordParamRef}
    )`);
    params.push(`%${filters.keyword.toLowerCase()}%`);
    paramIndex++;
  }

  if (filters.status) {
    conditions.push(`su.progress_status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }

  const statusUpdatesCte = `
    WITH status_updates AS (
      SELECT DISTINCT ON (wu.work_item_id)
        wu.work_item_id,
        wu.updated_at AS status_changed_at,
        wu.update_content,
        wu.progress_status,
        wu.user_id AS updated_by
      FROM work_updates wu
      WHERE wu.progress_status IN ('completed', 'cancelled')
      ORDER BY wu.work_item_id, wu.updated_at DESC
    )
  `;

  const baseFromClause = `
    FROM status_updates su
    INNER JOIN work_items wi ON wi.id = su.work_item_id
    LEFT JOIN checkins c ON wi.checkin_id = c.id
    LEFT JOIN teams t ON COALESCE(wi.team_id, c.team_id) = t.id
    INNER JOIN team_members tm ON tm.team_id = COALESCE(wi.team_id, c.team_id)
      AND tm.user_id = $1
  `;

  const whereClause = `
    WHERE 1=1
      ${conditions.length ? `AND ${conditions.join(' AND ')}` : ''}
  `;

  const countSql = `
    ${statusUpdatesCte}
    SELECT COUNT(*) AS total
    ${baseFromClause}
    ${whereClause}
  `;

  const countResult = await query(countSql, params);
  const total = Number(countResult.rows[0]?.total ?? 0);
  const totalPages = total === 0 ? 1 : Math.ceil(total / sanitizedLimit);
  const effectivePage = total === 0 ? 1 : Math.min(requestedPage, totalPages);
  const offset = (effectivePage - 1) * sanitizedLimit;

  const sortMap: Record<string, string> = {
    completed_desc: 'su.status_changed_at DESC, wi.id DESC',
    completed_asc: 'su.status_changed_at ASC, wi.id ASC',
    id_desc: 'wi.id DESC',
    id_asc: 'wi.id ASC'
  };
  const orderClause = sortMap[sortBy] ?? sortMap.completed_desc;

  const limitParamIndex = paramIndex;
  const offsetParamIndex = paramIndex + 1;
  const dataParams = [...params, sanitizedLimit, offset];

  const dataSql = `
    ${statusUpdatesCte}
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
      su.status_changed_at AS completed_at,
      su.update_content,
      su.progress_status AS status,
      su.updated_by AS completed_by,
      cb.display_name AS completed_by_name,
      cb.username AS completed_by_username,
      COALESCE(wi.team_id, c.team_id) AS derived_team_id,
      t.name AS team_name,
      primary_handler.display_name AS primary_handler_name,
      primary_handler.username AS primary_handler_username
    ${baseFromClause}
    LEFT JOIN (
      SELECT wih.work_item_id, u.display_name, u.username
      FROM work_item_handlers wih
      INNER JOIN users u ON wih.user_id = u.id
      WHERE wih.handler_type = 'primary'
    ) primary_handler ON primary_handler.work_item_id = wi.id
    LEFT JOIN users cb ON cb.id = su.updated_by
    ${whereClause}
    ORDER BY ${orderClause}
    LIMIT $${limitParamIndex}
    OFFSET $${offsetParamIndex}
  `;

  const result = await query(dataSql, dataParams);
  const items = normalizeEstimatedDateList(result.rows);

  return {
    items,
    pagination: {
      total,
      page: effectivePage,
      limit: sanitizedLimit,
      totalPages
    }
  };
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

  return withNormalizedEstimatedDate(result.rows[0]);
};
