import { query } from '../database/pool';
import * as aiService from './ai.service';
import { getTodayTeamWorkItems } from './workitem.service';
import { getTeamMembers } from './team.service';

export const createOrGetTodayStandup = async (teamId: number) => {
  const today = new Date().toISOString().split('T')[0];

  // Try to get existing standup
  let result = await query(
    `SELECT * FROM standup_meetings 
     WHERE team_id = $1 AND meeting_date = $2`,
    [teamId, today]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Create new standup
  result = await query(
    `INSERT INTO standup_meetings (team_id, meeting_date, status)
     VALUES ($1, $2, 'in_progress')
     RETURNING *`,
    [teamId, today]
  );

  return result.rows[0];
};

export const getTodayStandup = async (teamId: number) => {
  const today = new Date().toISOString().split('T')[0];

  const result = await query(
    `SELECT * FROM standup_meetings 
     WHERE team_id = $1 AND meeting_date = $2`,
    [teamId, today]
  );

  return result.rows[0] || null;
};

export const completeStandupReview = async (
  standupId: number,
  teamId: number,
  reviewerId: number
) => {
  // Get all work items for today (exclude backlog items)
  const workItems = await getTodayTeamWorkItems(teamId);
  
  // Get team members
  const members = await getTeamMembers(teamId, reviewerId);

  // Use AI to analyze and distribute tasks
  const aiAnalysis = await aiService.analyzeWorkItems(workItems, teamId);
  const taskDistribution = await aiService.distributeTasksToTeam(
    workItems,
    members,
    teamId
  );

  // Update standup meeting
  const result = await query(
    `UPDATE standup_meetings 
     SET status = 'completed',
         ai_summary = $1,
         ai_task_distribution = $2,
         reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = $3
     WHERE id = $4
     RETURNING *`,
    [
      JSON.stringify(aiAnalysis),
      JSON.stringify(taskDistribution),
      reviewerId,
      standupId
    ]
  );

  // Create daily summary
  await query(
    `INSERT INTO daily_summaries (team_id, summary_date, standup_meeting_id, morning_summary, status)
     VALUES ($1, $2, $3, $4, 'in_progress')
     ON CONFLICT (team_id, summary_date) 
     DO UPDATE SET morning_summary = $4, standup_meeting_id = $3`,
    [
      teamId,
      new Date().toISOString().split('T')[0],
      standupId,
      JSON.stringify(aiAnalysis)
    ]
  );

  return result.rows[0];
};

export const getStandupHistory = async (
  teamId: number,
  startDate?: string,
  endDate?: string
) => {
  let queryText = `
    SELECT * FROM standup_meetings
    WHERE team_id = $1
  `;

  const params: any[] = [teamId];
  let paramIndex = 2;

  if (startDate) {
    queryText += ` AND meeting_date >= $${paramIndex++}`;
    params.push(startDate);
  }

  if (endDate) {
    queryText += ` AND meeting_date <= $${paramIndex++}`;
    params.push(endDate);
  }

  queryText += ` ORDER BY meeting_date DESC`;

  const result = await query(queryText, params);
  return result.rows;
};
