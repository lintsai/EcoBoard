import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as backlogService from '../services/backlog.service';
import { notifyStandupUpdateForCheckin } from '../websocket/standup';

const router = Router();

router.post(
  '/',
  authenticate,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('content').notEmpty().withMessage('Content is required'),
    body('priority')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('Priority must be 1-5'),
    body('teamId').isInt().withMessage('teamId is required'),
    body('estimatedDate').optional().isDate().withMessage('estimatedDate must be ISO date')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, content, priority, estimatedDate, teamId } = req.body;
      const parsedTeamId = Number(teamId);
      const backlogItem = await backlogService.createBacklogItem(
        req.user!.id,
        parsedTeamId,
        title,
        content,
        priority,
        estimatedDate
      );

      res.status(201).json(backlogItem);
    } catch (error) {
      console.error('Create backlog item error:', error);
      res.status(500).json({ error: 'Failed to create backlog item' });
    }
  }
);

router.post(
  '/batch',
  authenticate,
  [
    body('items').isArray().withMessage('items must be an array'),
    body('items.*.title').notEmpty().withMessage('title is required'),
    body('items.*.content').notEmpty().withMessage('content is required'),
    body('items.*.priority')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('priority must be 1-5'),
    body('teamId').isInt().withMessage('teamId is required')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { items, teamId } = req.body;
      const parsedTeamId = Number(teamId);
      const normalizedItems = items.map((item: any) => ({
        title: item.title,
        content: item.content,
        priority: item.priority || 3,
        estimatedDate: item.estimatedDate
      }));

      const backlogItems = await backlogService.createBacklogItemsBatch(
        req.user!.id,
        parsedTeamId,
        normalizedItems
      );

      res.status(201).json(backlogItems);
    } catch (error) {
      console.error('Batch create backlog items error:', error);
      res.status(500).json({ error: 'Failed to create backlog items' });
    }
  }
);

router.get(
  '/my',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { teamId } = req.query;
      const parsedTeamId = teamId ? Number(teamId) : undefined;
      const backlogItems = await backlogService.getUserBacklogItems(
        req.user!.id,
        Number.isNaN(parsedTeamId) ? undefined : parsedTeamId
      );

      res.json(backlogItems);
    } catch (error) {
      console.error('Get user backlog items error:', error);
      res.status(500).json({ error: 'Failed to load backlog items' });
    }
  }
);

router.get(
  '/team/:teamId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = Number(req.params.teamId);
      if (Number.isNaN(teamId)) {
        return res.status(400).json({ error: 'Invalid teamId' });
      }

      const backlogItems = await backlogService.getTeamBacklogItems(teamId, req.user!.id);
      res.json(backlogItems);
    } catch (error) {
      console.error('Get team backlog items error:', error);
      res.status(500).json({ error: 'Failed to load team backlog items' });
    }
  }
);

router.put(
  '/:itemId',
  authenticate,
  [
    body('title').optional(),
    body('content').optional(),
    body('priority')
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage('priority must be 1-5'),
    body('estimatedDate').optional().isDate().withMessage('estimatedDate must be ISO date'),
    body('teamId').optional().isInt().withMessage('teamId must be an integer')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const itemId = Number(req.params.itemId);
      const { title, content, priority, estimatedDate, teamId } = req.body;

      const backlogItem = await backlogService.updateBacklogItem(
        itemId,
        req.user!.id,
        { title, content, priority, estimatedDate, teamId: teamId !== undefined ? Number(teamId) : undefined }
      );

      res.json(backlogItem);
    } catch (error: any) {
      console.error('Update backlog item error:', error);
      res.status(error.message?.includes('無權限') ? 403 : 500).json({
        error: error.message || 'Failed to update backlog item',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

router.delete(
  '/:itemId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = Number(req.params.itemId);
      await backlogService.deleteBacklogItem(itemId, req.user!.id);
      res.json({ message: 'Backlog item deleted' });
    } catch (error: any) {
      console.error('Delete backlog item error:', error);
      res.status(error.message?.includes('無權限') ? 403 : 500).json({
        error: error.message || 'Failed to delete backlog item'
      });
    }
  }
);

router.post(
  '/:itemId/move-to-today',
  authenticate,
  [body('teamId').isInt().withMessage('teamId is required')],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const itemId = Number(req.params.itemId);
      const teamId = Number(req.body.teamId);
      const actorName = req.user?.displayName || req.user?.username || 'Member';

      const result = await backlogService.moveBacklogToWorkItem(
        itemId,
        req.user!.id,
        teamId
      );

      if (result?.checkin_id) {
        notifyStandupUpdateForCheckin(result.checkin_id, {
          action: 'backlog-promoted',
          actorId: req.user!.id,
          itemId: result.id,
          metadata: { actorName }
        });
      }

      res.json(result);
    } catch (error: any) {
      console.error('Move backlog to work item error:', error);
      res.status(error.message?.includes('無權限') ? 403 : 500).json({
        error: error.message || 'Failed to promote backlog item'
      });
    }
  }
);

export default router;
