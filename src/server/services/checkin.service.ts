import { query } from '../database/pool';

// 統一的今日日期函數（使用台灣時區 UTC+8）
const getTodayDate = () => {
  const now = new Date();
  // 轉換為台灣時間 (UTC+8)
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  return taiwanTime.toISOString().split('T')[0];
};

export const createCheckin = async (teamId: number, userId: number) => {
  const today = getTodayDate();

  // Check if already checked in today
  const existing = await query(
    `SELECT * FROM checkins 
     WHERE team_id = $1 AND user_id = $2 AND checkin_date = $3`,
    [teamId, userId, today]
  );

  if (existing.rows.length > 0) {
    throw new Error('ALREADY_CHECKED_IN');
  }

  // Create check-in
  const result = await query(
    `INSERT INTO checkins (team_id, user_id, checkin_date, status)
     VALUES ($1, $2, $3, 'checked_in')
     RETURNING *`,
    [teamId, userId, today]
  );

  return result.rows[0];
};

export const getTodayTeamCheckins = async (teamId: number) => {
  const today = getTodayDate();

  const result = await query(
    `SELECT c.*, u.username, u.display_name
     FROM checkins c
     INNER JOIN users u ON c.user_id = u.id
     WHERE c.team_id = $1 AND c.checkin_date = $2
     ORDER BY c.checkin_time`,
    [teamId, today]
  );

  return result.rows;
};

export const getUserCheckinHistory = async (
  userId: number,
  teamId?: number,
  startDate?: string,
  endDate?: string
) => {
  let queryText = `
    SELECT c.*, t.name as team_name
    FROM checkins c
    INNER JOIN teams t ON c.team_id = t.id
    WHERE c.user_id = $1
  `;

  const params: any[] = [userId];
  let paramIndex = 2;

  if (teamId) {
    queryText += ` AND c.team_id = $${paramIndex++}`;
    params.push(teamId);
  }

  if (startDate) {
    queryText += ` AND c.checkin_date >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    queryText += ` AND c.checkin_date <= $${paramIndex++}`;
    params.push(endDate);
  }

  queryText += ` ORDER BY c.checkin_date DESC`;

  const result = await query(queryText, params);
  return result.rows;
};

export const getUserTodayCheckin = async (userId: number, teamId: number) => {
  const today = getTodayDate();

  const result = await query(
    `SELECT * FROM checkins 
     WHERE user_id = $1 AND team_id = $2 AND checkin_date = $3`,
    [userId, teamId, today]
  );

  return result.rows[0] || null;
};
