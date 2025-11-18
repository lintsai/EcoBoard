import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { forceStartStandupSession, forceStopStandupSession } from '../websocket/standup';
import { query } from '../database/pool';

const router = Router();

const ensureTeamMembership = async (teamId: number, userId: number) => {
  const membership = await query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );

  if (membership.rows.length === 0) {
    const error = new Error('NOT_IN_TEAM');
    throw error;
  }

  return membership.rows[0].role;
};

router.post(
  '/team/:teamId/force-start',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const teamId = parseInt(req.params.teamId, 10);
      if (Number.isNaN(teamId)) {
        return res.status(400).json({ error: 'Invalid team ID' });
      }

      await ensureTeamMembership(teamId, req.user!.id);

      await forceStartStandupSession(teamId, {
        userId: req.user!.id,
        username: req.user!.username,
        displayName: req.user!.displayName
      });

      return res.json({ message: 'Standup meeting started' });
    } catch (error: any) {
      if (error.message === 'NOT_IN_TEAM') {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      console.error('[Standup] Force start error:', error);
      return res.status(500).json({ error: 'Unable to force start standup meeting' });
    }
  }
);

router.post(
  '/team/:teamId/force-stop',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const teamId = parseInt(req.params.teamId, 10);
      if (Number.isNaN(teamId)) {
        return res.status(400).json({ error: 'Invalid team ID' });
      }

      await ensureTeamMembership(teamId, req.user!.id);

      await forceStopStandupSession(teamId, {
        userId: req.user!.id,
        username: req.user!.username,
        displayName: req.user!.displayName
      });

      return res.json({ message: 'Standup meeting stopped' });
    } catch (error: any) {
      if (error.message === 'NOT_IN_TEAM') {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      console.error('[Standup] Force stop error:', error);
      return res.status(500).json({ error: 'Unable to force stop standup meeting' });
    }
  }
);

export default router;
