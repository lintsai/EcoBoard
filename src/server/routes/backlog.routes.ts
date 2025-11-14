import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as backlogService from '../services/backlog.service';

const router = Router();

// 創建單個 backlog 項目
router.post(
  '/',
  authenticate,
  [
    body('title').notEmpty().withMessage('標題為必填'),
    body('content').notEmpty().withMessage('內容為必填'),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('優先級必須是 1-5 之間的整數'),
    body('estimatedDate').optional().isDate().withMessage('預計日期格式錯誤')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, content, priority, estimatedDate } = req.body;
      const backlogItem = await backlogService.createBacklogItem(
        req.user!.id,
        title,
        content,
        priority,
        estimatedDate
      );

      res.status(201).json(backlogItem);
    } catch (error) {
      console.error('Create backlog item error:', error);
      res.status(500).json({ error: '新增 Backlog 項目失敗' });
    }
  }
);

// 批量創建 backlog 項目（AI 解析表格後使用）
router.post(
  '/batch',
  authenticate,
  [
    body('items').isArray().withMessage('items 必須是陣列'),
    body('items.*.title').notEmpty().withMessage('標題為必填'),
    body('items.*.content').notEmpty().withMessage('內容為必填'),
    body('items.*.priority').optional().isInt({ min: 1, max: 5 }).withMessage('優先級必須是 1-5 之間的整數')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { items } = req.body;
      
      // 將 userId 添加到每個項目
      const itemsWithUserId = items.map((item: any) => ({
        userId: req.user!.id,
        title: item.title,
        content: item.content,
        priority: item.priority || 3,
        estimatedDate: item.estimatedDate
      }));

      const backlogItems = await backlogService.createBacklogItemsBatch(itemsWithUserId);

      res.status(201).json(backlogItems);
    } catch (error) {
      console.error('Batch create backlog items error:', error);
      res.status(500).json({ error: '批量新增 Backlog 項目失敗' });
    }
  }
);

// 獲取用戶的 backlog 項目
router.get(
  '/my',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { teamId } = req.query;
      const backlogItems = await backlogService.getUserBacklogItems(
        req.user!.id,
        teamId ? parseInt(teamId as string) : undefined
      );

      res.json(backlogItems);
    } catch (error) {
      console.error('Get user backlog items error:', error);
      res.status(500).json({ error: '取得 Backlog 項目失敗' });
    }
  }
);

// 獲取團隊的所有 backlog 項目
router.get(
  '/team/:teamId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      
      const backlogItems = await backlogService.getTeamBacklogItems(teamId);

      res.json(backlogItems);
    } catch (error) {
      console.error('Get team backlog items error:', error);
      res.status(500).json({ error: '取得團隊 Backlog 項目失敗' });
    }
  }
);

// 更新 backlog 項目
router.put(
  '/:itemId',
  authenticate,
  [
    body('title').optional(),
    body('content').optional(),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('優先級必須是 1-5 之間的整數'),
    body('estimatedDate').optional().isDate().withMessage('預計日期格式錯誤')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const itemId = parseInt(req.params.itemId);
      const { title, content, priority, estimatedDate } = req.body;

      const backlogItem = await backlogService.updateBacklogItem(
        itemId,
        req.user!.id,
        { title, content, priority, estimatedDate }
      );

      res.json(backlogItem);
    } catch (error: any) {
      console.error('Update backlog item error:', error);
      res.status(error.message.includes('無權限') ? 403 : 500).json({ 
        error: error.message || '更新 Backlog 項目失敗',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// 刪除 backlog 項目
router.delete(
  '/:itemId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      await backlogService.deleteBacklogItem(itemId, req.user!.id);

      res.json({ message: 'Backlog 項目已刪除' });
    } catch (error: any) {
      console.error('Delete backlog item error:', error);
      res.status(error.message.includes('無權限') ? 403 : 500).json({ 
        error: error.message || '刪除 Backlog 項目失敗' 
      });
    }
  }
);

// 將 backlog 項目移動到今日工作項目
router.post(
  '/:itemId/move-to-today',
  authenticate,
  [
    body('teamId').isInt().withMessage('團隊 ID 為必填')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const itemId = parseInt(req.params.itemId);
      const { teamId } = req.body;
      const result = await backlogService.moveBacklogToWorkItem(
        itemId,
        req.user!.id,
        teamId
      );

      res.json(result);
    } catch (error: any) {
      console.error('Move backlog to work item error:', error);
      res.status(error.message.includes('無權限') ? 403 : 500).json({ 
        error: error.message || '移動 Backlog 項目失敗' 
      });
    }
  }
);

export default router;
