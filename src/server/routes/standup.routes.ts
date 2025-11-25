import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import {
  forceStartStandupSession,
  forceStopStandupSession,
  handleAutoStartDecision,
  startStandupFocus,
  stopStandupFocus
} from '../websocket/standup';
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

router.post(
  '/team/:teamId/auto-start/respond',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const teamId = parseInt(req.params.teamId, 10);
      const decision = (req.body?.decision || '').toLowerCase();
      if (Number.isNaN(teamId)) {
        return res.status(400).json({ error: 'Invalid team ID' });
      }
      if (!['start', 'cancel'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid decision' });
      }

      await ensureTeamMembership(teamId, req.user!.id);

      await handleAutoStartDecision(teamId, {
        userId: req.user!.id,
        username: req.user!.username,
        displayName: req.user!.displayName
      }, decision as 'start' | 'cancel');

      return res.json({
        message: decision === 'start' ? 'Standup auto-start confirmed' : 'Standup auto-start cancelled',
        decision
      });
    } catch (error: any) {
      if (error.message === 'NOT_IN_TEAM') {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      console.error('[Standup] Auto-start respond error:', error);
      return res.status(500).json({ error: 'Unable to update auto-start decision' });
    }
  }
);

router.post(
  '/team/:teamId/focus',
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const teamId = parseInt(req.params.teamId, 10);
      const action = (req.body?.action || 'start').toLowerCase();
      const itemIdRaw = req.body?.itemId;
      const itemId = typeof itemIdRaw === 'number' ? itemIdRaw : parseInt(itemIdRaw, 10);

      if (Number.isNaN(teamId)) {
        return res.status(400).json({ error: 'Invalid team ID' });
      }

      await ensureTeamMembership(teamId, req.user!.id);

      const actor = {
        userId: req.user!.id,
        username: req.user!.username,
        displayName: req.user!.displayName
      };

      if (action === 'stop') {
        stopStandupFocus(teamId, actor);
        return res.json({ message: 'Standup focus stopped' });
      }

      startStandupFocus(teamId, actor, {
        itemId: Number.isNaN(itemId) ? undefined : itemId,
        presenterId: req.body?.presenterId ? parseInt(req.body.presenterId, 10) : undefined
      });

      return res.json({ message: 'Standup focus started' });
    } catch (error: any) {
      if (error.message === 'NOT_IN_TEAM') {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }
      console.error('[Standup] Focus switch error:', error);
      return res.status(500).json({ error: 'Unable to update standup focus state' });
    }
  }
);

export default router;
