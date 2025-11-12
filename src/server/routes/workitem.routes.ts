import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as workItemService from '../services/workitem.service';

const router = Router();

// 新增工作項目
router.post(
  '/',
  authenticate,
  [
    body('checkinId').isInt().withMessage('打卡 ID 為必填'),
    body('content').notEmpty().withMessage('工作內容為必填'),
    body('itemType').optional(),
    body('sessionId').optional(),
    body('aiSummary').optional(),
    body('aiTitle').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { checkinId, content, itemType, sessionId, aiSummary, aiTitle } = req.body;
      const workItem = await workItemService.createWorkItem(
        checkinId,
        req.user!.id,
        content,
        itemType,
        sessionId,
        aiSummary,
        aiTitle
      );

      res.status(201).json(workItem);
    } catch (error) {
      console.error('Create work item error:', error);
      res.status(500).json({ error: '新增工作項目失敗' });
    }
  }
);

// 取得使用者今日工作項目
router.get(
  '/today',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { teamId } = req.query;
      const workItems = await workItemService.getTodayUserWorkItems(
        req.user!.id,
        teamId ? parseInt(teamId as string) : undefined
      );
      res.json(workItems);
    } catch (error) {
      console.error('Get work items error:', error);
      res.status(500).json({ error: '取得工作項目失敗' });
    }
  }
);

// 取得使用者的未完成工作項目（不限日期）
router.get(
  '/incomplete',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { teamId } = req.query;
      const workItems = await workItemService.getIncompleteUserWorkItems(
        req.user!.id,
        teamId ? parseInt(teamId as string) : undefined
      );
      res.json(workItems);
    } catch (error) {
      console.error('Get incomplete work items error:', error);
      res.status(500).json({ error: '取得未完成工作項目失敗' });
    }
  }
);

// 更新工作項目
router.put(
  '/:itemId',
  authenticate,
  [
    body('content').optional(),
    body('aiSummary').optional(),
    body('aiTitle').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const { content, aiSummary, aiTitle } = req.body;
      
      const workItem = await workItemService.updateWorkItem(
        itemId,
        req.user!.id,
        content,
        aiSummary,
        aiTitle
      );

      res.json(workItem);
    } catch (error: any) {
      console.error('Update work item error:', error);
      res.status(500).json({ 
        error: error.message || '更新工作項目失敗',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// 重新分配工作項目給其他成員
router.put(
  '/:itemId/assign',
  authenticate,
  [
    body('userId').isInt().withMessage('用戶 ID 為必填')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const itemId = parseInt(req.params.itemId);
      const { userId } = req.body;
      
      const workItem = await workItemService.reassignWorkItem(
        itemId,
        userId,
        req.user!.id
      );

      res.json(workItem);
    } catch (error: any) {
      console.error('Reassign work item error:', error);
      res.status(error.message.includes('無權限') ? 403 : 500).json({ 
        error: error.message || '重新分配工作項目失敗',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// 新增工作更新
router.post(
  '/:itemId/updates',
  authenticate,
  [
    body('updateContent').notEmpty().withMessage('更新內容為必填'),
    body('progressStatus').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const itemId = parseInt(req.params.itemId);
      const { updateContent, progressStatus } = req.body;
      
      const update = await workItemService.createWorkUpdate(
        itemId,
        req.user!.id,
        updateContent,
        progressStatus
      );

      res.status(201).json(update);
    } catch (error) {
      console.error('Create work update error:', error);
      res.status(500).json({ error: '新增工作更新失敗' });
    }
  }
);

// 取得工作項目的更新歷史
router.get(
  '/:itemId/updates',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const updates = await workItemService.getWorkItemUpdates(itemId);
      res.json(updates);
    } catch (error) {
      console.error('Get work updates error:', error);
      res.status(500).json({ error: '取得更新歷史失敗' });
    }
  }
);

// 取得團隊今日所有工作項目
router.get(
  '/team/:teamId/today',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const workItems = await workItemService.getTodayTeamWorkItems(teamId);
      res.json(workItems);
    } catch (error) {
      console.error('Get team work items error:', error);
      res.status(500).json({ error: '取得團隊工作項目失敗' });
    }
  }
);

// 取得團隊所有未完成工作項目
router.get(
  '/team/:teamId/incomplete',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const workItems = await workItemService.getIncompleteTeamWorkItems(teamId);
      res.json(workItems);
    } catch (error) {
      console.error('Get team incomplete work items error:', error);
      res.status(500).json({ error: '取得團隊未完成工作項目失敗' });
    }
  }
);

// 移動未完成項目到今日
router.put(
  '/:itemId/move-to-today',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      
      const workItem = await workItemService.moveWorkItemToToday(
        itemId,
        req.user!.id
      );

      res.json(workItem);
    } catch (error: any) {
      console.error('Move work item to today error:', error);
      res.status(error.message.includes('無權限') || error.message.includes('已經是今日') ? 400 : 500).json({ 
        error: error.message || '移動工作項目失敗',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// 刪除工作項目
router.delete(
  '/:itemId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      await workItemService.deleteWorkItem(itemId, req.user!.id);
      res.json({ message: '工作項目已刪除' });
    } catch (error: any) {
      console.error('Delete work item error:', error);
      res.status(error.message.includes('無權限') ? 403 : 500).json({ 
        error: error.message || '刪除工作項目失敗' 
      });
    }
  }
);

export default router;
