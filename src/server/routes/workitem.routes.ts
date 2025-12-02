import { Router, Response } from 'express';
import { body, validationResult, query as expressQuery, param as expressParam } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as workItemService from '../services/workitem.service';
import { notifyStandupUpdateForCheckin, notifyStandupUpdateForWorkItem } from '../websocket/standup';

const router = Router();
const getActorName = (req: AuthRequest) => req.user?.displayName || req.user?.username || '成員';
const preventCache = (res: Response) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
};

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
    body('aiTitle').optional(),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('優先級必須是 1-5 之間的整數')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const actorName = getActorName(req);
      const { checkinId, content, itemType, sessionId, aiSummary, aiTitle, priority } = req.body;
      const workItem = await workItemService.createWorkItem(
        checkinId,
        req.user!.id,
        content,
        itemType,
        sessionId,
        aiSummary,
        aiTitle,
        priority
      );

      notifyStandupUpdateForCheckin(workItem.checkin_id, {
        action: 'workitem-created',
        actorId: req.user!.id,
        itemId: workItem.id,
        metadata: {
          actorName,
          itemType: itemType || 'task'
        }
      });

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
      preventCache(res);
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
      preventCache(res);
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
    body('aiTitle').optional(),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('優先級必須是 1-5 之間的整數'),
    body('estimatedDate')
      .optional({ nullable: true, checkFalsy: true })
      .isDate()
      .withMessage('預計日期格式錯誤')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const actorName = getActorName(req);
      const { content, aiSummary, aiTitle, priority, estimatedDate, sessionId } = req.body;
      const normalizedEstimatedDate =
        Object.prototype.hasOwnProperty.call(req.body, 'estimatedDate') && (estimatedDate === null || estimatedDate === '')
          ? null
          : estimatedDate;
      
      const workItem = await workItemService.updateWorkItem(
        itemId,
        req.user!.id,
        content,
        aiSummary,
        aiTitle,
        priority,
        normalizedEstimatedDate,
        sessionId
      );

      notifyStandupUpdateForCheckin(workItem.checkin_id, {
        action: 'workitem-updated',
        actorId: req.user!.id,
        itemId: workItem.id,
        metadata: {
          actorName
        }
      });

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

// 部分更新工作項目（PATCH）
router.patch(
  '/:itemId',
  authenticate,
  [
    body('content').optional(),
    body('aiSummary').optional(),
    body('aiTitle').optional(),
    body('priority').optional().isInt({ min: 1, max: 5 }).withMessage('優先級必須是 1-5 之間的整數'),
    body('estimated_date').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const actorName = getActorName(req);
      const { content, aiSummary, aiTitle, priority, estimated_date, sessionId } = req.body;
      const normalizedEstimatedDate =
        Object.prototype.hasOwnProperty.call(req.body, 'estimated_date') && (estimated_date === null || estimated_date === '')
          ? null
          : estimated_date;
      
      const workItem = await workItemService.updateWorkItem(
        itemId,
        req.user!.id,
        content,
        aiSummary,
        aiTitle,
        priority,
        normalizedEstimatedDate,
        sessionId
      );

      notifyStandupUpdateForCheckin(workItem.checkin_id, {
        action: 'workitem-updated',
        actorId: req.user!.id,
        itemId: workItem.id,
        metadata: {
          actorName
        }
      });

      res.json(workItem);
    } catch (error: any) {
      console.error('Patch work item error:', error);
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
      const actorName = getActorName(req);
      
      const workItem = await workItemService.reassignWorkItem(
        itemId,
        userId,
        req.user!.id
      );

      notifyStandupUpdateForCheckin(workItem.checkin_id, {
        action: 'workitem-reassigned',
        actorId: req.user!.id,
        itemId: workItem.id,
        metadata: {
          actorName,
          newOwnerId: userId
        }
      });

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
      const actorName = getActorName(req);
      
      const update = await workItemService.createWorkUpdate(
        itemId,
        req.user!.id,
        updateContent,
        progressStatus
      );

      notifyStandupUpdateForWorkItem(itemId, {
        action: 'workitem-progress',
        actorId: req.user!.id,
        metadata: {
          actorName,
          progressStatus
        }
      });

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
      preventCache(res);
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
      preventCache(res);
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
      preventCache(res);
      res.json(workItems);
    } catch (error) {
      console.error('Get team incomplete work items error:', error);
      res.status(500).json({ error: '取得團隊未完成工作項目失敗' });
    }
  }
);

router.get(
  '/completed/history',
  authenticate,
  [
    expressQuery('teamId').optional().isInt().withMessage('teamId 必須是整數'),
    expressQuery('startDate').optional().isISO8601().withMessage('開始日期格式錯誤'),
    expressQuery('endDate').optional().isISO8601().withMessage('結束日期格式錯誤'),
    expressQuery('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit 需在 1-200 之間'),
    expressQuery('page').optional().isInt({ min: 1 }).withMessage('page 必須大於 0'),
    expressQuery('status').optional().isIn(['completed', 'cancelled']).withMessage('狀態參數無效'),
    expressQuery('sortBy')
      .optional()
      .isIn(['completed_desc', 'completed_asc', 'id_desc', 'id_asc'])
      .withMessage('排序參數無效'),
    expressQuery('keyword').optional().isString().withMessage('關鍵字格式錯誤')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId, startDate, endDate, limit, keyword, page, status, sortBy } = req.query;
      const history = await workItemService.getCompletedWorkHistory(req.user!.id, {
        teamId: teamId ? parseInt(teamId as string, 10) : undefined,
        startDate: startDate ? String(startDate) : undefined,
        endDate: endDate ? String(endDate) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        keyword: keyword ? String(keyword) : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        status: status ? (status as 'completed' | 'cancelled') : undefined,
        sortBy: sortBy ? (sortBy as 'completed_desc' | 'completed_asc' | 'id_desc' | 'id_asc') : undefined
      });

      preventCache(res);
      res.json(history);
    } catch (error) {
      console.error('Get completed work history error:', error);
      res.status(500).json({ error: '取得已完成工作項目失敗' });
    }
  }
);

router.get(
  '/completed/history/:historyId',
  authenticate,
  [
    expressParam('historyId').isInt().withMessage('historyId 必須是整數'),
    expressQuery('teamId').optional().isInt().withMessage('teamId 必須是整數')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const historyId = parseInt(req.params.historyId, 10);
      const teamId = req.query.teamId ? parseInt(req.query.teamId as string, 10) : undefined;
      const item = await workItemService.getCompletedHistoryItemById(req.user!.id, historyId, teamId);

      if (!item) {
        return res.status(404).json({ error: '完成項目不存在或無權限查看' });
      }

      preventCache(res);
      res.json(item);
    } catch (error) {
      console.error('Get completed history item error:', error);
      res.status(500).json({ error: '取得完成項目失敗' });
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
      const actorName = getActorName(req);
      
      const workItem = await workItemService.moveWorkItemToToday(
        itemId,
        req.user!.id
      );

      notifyStandupUpdateForCheckin(workItem.checkin_id, {
        action: 'workitem-moved-to-today',
        actorId: req.user!.id,
        itemId: workItem.id,
        metadata: {
          actorName
        }
      });

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

router.put(
  '/:itemId/move-to-backlog',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId, 10);
      const workItem = await workItemService.moveWorkItemToBacklog(itemId, req.user!.id);
      res.json(workItem);
    } catch (error: any) {
      console.error('Move work item to backlog error:', error);
      const status = error.message?.includes('無權限') ? 403 : 400;
      res.status(status).json({
        error: error.message || '轉回 Backlog 失敗',
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
      const actorName = getActorName(req);
      const deletedItem = await workItemService.deleteWorkItem(itemId, req.user!.id);

      if (deletedItem?.checkin_id) {
        notifyStandupUpdateForCheckin(deletedItem.checkin_id, {
          action: 'workitem-deleted',
          actorId: req.user!.id,
          itemId,
          metadata: { actorName }
        });
      }

      res.json({ message: "工作項目已刪除" });
    } catch (error: any) {
      console.error('Delete work item error:', error);
      res.status(error.message.includes("無權限") ? 403 : 500).json({ 
        error: error.message || "刪除工作項目失敗" 
      });
    }
  }
);

router.post(
  '/:itemId/co-handlers',
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
      const actorName = getActorName(req);
      
      const handler = await workItemService.addCoHandler(
        itemId,
        userId,
        req.user!.id
      );

      notifyStandupUpdateForWorkItem(itemId, {
        action: 'workitem-cohandler-added',
        actorId: req.user!.id,
        metadata: {
          actorName,
          targetUserId: userId
        }
      });

      res.status(201).json(handler);
    } catch (error: any) {
      console.error('Add co-handler error:', error);
      res.status(error.message.includes('無權限') || error.message.includes('已經是') ? 400 : 500).json({ 
        error: error.message || '添加共同處理人失敗',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

// 移除共同處理人
router.delete(
  '/:itemId/co-handlers/:userId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const userId = parseInt(req.params.userId);
      const actorName = getActorName(req);
      
      await workItemService.removeCoHandler(
        itemId,
        userId,
        req.user!.id
      );

      notifyStandupUpdateForWorkItem(itemId, {
        action: 'workitem-cohandler-removed',
        actorId: req.user!.id,
        metadata: {
          actorName,
          targetUserId: userId
        }
      });

      res.json({ message: '共同處理人已移除' });
    } catch (error: any) {
      console.error('Remove co-handler error:', error);
      res.status(error.message.includes('無權限') || error.message.includes('不能移除') ? 403 : 500).json({ 
        error: error.message || '移除共同處理人失敗',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
);

export default router;
