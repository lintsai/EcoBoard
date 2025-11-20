import { query } from '../database/pool';
import { getUserByUsername } from './user.service';

export const createTeam = async (
  name: string,
  description: string | undefined,
  createdBy: number
) => {
  const result = await query(
    `INSERT INTO teams (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, description, createdBy]
  );

  const team = result.rows[0];

  // Add creator as team admin
  await query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'admin')`,
    [team.id, createdBy]
  );

  return team;
};

export const getUserTeams = async (userId: number) => {
  const result = await query(
    `SELECT t.*, tm.role, tm.joined_at
     FROM teams t
     INNER JOIN team_members tm ON t.id = tm.team_id
     WHERE tm.user_id = $1
     ORDER BY tm.joined_at DESC`,
    [userId]
  );

  return result.rows;
};

export const getDiscoverableTeams = async (userId: number) => {
  const result = await query(
    `SELECT 
        t.id,
        t.name,
        t.description,
        t.created_at,
        COUNT(tm_all.user_id)::int AS member_count,
        tm_admin.user_id AS admin_user_id,
        ua.username AS admin_username,
        ua.display_name AS admin_display_name
      FROM teams t
      LEFT JOIN team_members tm_all ON tm_all.team_id = t.id
      -- 取最早加入的管理員作為主要聯繫人
      LEFT JOIN LATERAL (
        SELECT tm.user_id, tm.joined_at
        FROM team_members tm
        WHERE tm.team_id = t.id AND tm.role = 'admin'
        ORDER BY tm.joined_at ASC
        LIMIT 1
      ) tm_admin ON TRUE
      LEFT JOIN users ua ON ua.id = tm_admin.user_id
      WHERE NOT EXISTS (
        SELECT 1 
        FROM team_members tm_user 
        WHERE tm_user.team_id = t.id AND tm_user.user_id = $1
      )
      GROUP BY 
        t.id, t.name, t.description, t.created_at,
        tm_admin.user_id, tm_admin.joined_at,
        ua.username, ua.display_name
      ORDER BY t.created_at DESC
      LIMIT 50`,
    [userId]
  );

  return result.rows;
};

export const getTeamById = async (teamId: number, userId: number) => {
  const result = await query(
    `SELECT t.*, tm.role
     FROM teams t
     INNER JOIN team_members tm ON t.id = tm.team_id
     WHERE t.id = $1 AND tm.user_id = $2`,
    [teamId, userId]
  );

  return result.rows[0] || null;
};

export const updateTeam = async (
  teamId: number,
  updates: { name?: string; description?: string },
  userId: number
) => {
  // Check if user is admin
  const memberCheck = await query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  if (memberCheck.rows.length === 0 || memberCheck.rows[0].role !== 'admin') {
    throw new Error('無權限修改團隊');
  }

  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  if (updates.name) {
    setClauses.push(`name = $${paramIndex++}`);
    values.push(updates.name);
  }

  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(updates.description);
  }

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(teamId);

  const result = await query(
    `UPDATE teams SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  return result.rows[0] || null;
};

export const getTeamMembers = async (teamId: number, userId: number) => {
  // Check if user is team member
  const memberCheck = await query(
    `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  if (memberCheck.rows.length === 0) {
    throw new Error('無權限查看團隊成員');
  }

  const result = await query(
    `SELECT u.id as user_id, u.username, u.display_name, u.email, tm.role, tm.joined_at
     FROM users u
     INNER JOIN team_members tm ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at`,
    [teamId]
  );

  return result.rows;
};

export const addTeamMember = async (
  teamId: number,
  username: string,
  requesterId: number
) => {
  // Check if requester is admin
  const adminCheck = await query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, requesterId]
  );

  if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
    throw new Error('無權限新增團隊成員');
  }

  // Get user by username
  const user = await getUserByUsername(username);
  
  if (!user) {
    throw new Error('使用者不存在');
  }

  // Add member
  const result = await query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (team_id, user_id) DO NOTHING
     RETURNING *`,
    [teamId, user.id]
  );

  if (result.rows.length === 0) {
    throw new Error('使用者已是團隊成員');
  }

  return {
    ...user,
    role: 'member',
    joinedAt: result.rows[0].joined_at
  };
};

export const removeTeamMember = async (
  teamId: number,
  userIdToRemove: number,
  requesterId: number
) => {
  // Check if requester is admin
  const adminCheck = await query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, requesterId]
  );

  if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
    throw new Error('無權限移除團隊成員');
  }

  // Cannot remove yourself if you're the only admin
  if (requesterId === userIdToRemove) {
    const adminCount = await query(
      `SELECT COUNT(*) FROM team_members WHERE team_id = $1 AND role = 'admin'`,
      [teamId]
    );

    if (parseInt(adminCount.rows[0].count) === 1) {
      throw new Error('無法移除最後一位管理員');
    }
  }

  await query(
    `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userIdToRemove]
  );
};

export const deleteTeam = async (teamId: number, userId: number) => {
  // Check if user is admin
  const adminCheck = await query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId]
  );

  if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
    throw new Error('無權限刪除團隊');
  }

  // Delete in order: work_updates -> work_items -> checkins -> team_members -> teams
  await query(`
    DELETE FROM work_updates
    WHERE work_item_id IN (
      SELECT wi.id FROM work_items wi
      INNER JOIN checkins c ON wi.checkin_id = c.id
      WHERE c.team_id = $1
    )
  `, [teamId]);

  await query(`
    DELETE FROM work_items
    WHERE checkin_id IN (
      SELECT id FROM checkins WHERE team_id = $1
    )
  `, [teamId]);

  await query('DELETE FROM standup_meetings WHERE team_id = $1', [teamId]);
  await query('DELETE FROM checkins WHERE team_id = $1', [teamId]);
  await query('DELETE FROM team_members WHERE team_id = $1', [teamId]);
  await query('DELETE FROM teams WHERE id = $1', [teamId]);
};

export const updateMemberRole = async (
  teamId: number,
  userIdToUpdate: number,
  newRole: string,
  requesterId: number
) => {
  // Check if requester is admin
  const adminCheck = await query(
    `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
    [teamId, requesterId]
  );

  if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
    throw new Error('無權限修改成員角色');
  }

  // Cannot change own role
  if (requesterId === userIdToUpdate) {
    throw new Error('無法修改自己的角色');
  }

  // Update role
  const result = await query(
    `UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3 RETURNING *`,
    [newRole, teamId, userIdToUpdate]
  );

  if (result.rows.length === 0) {
    throw new Error('成員不存在');
  }

  return result.rows[0];
};
