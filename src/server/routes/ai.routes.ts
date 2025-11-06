import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as aiService from '../services/ai.service';
import * as standupService from '../services/standup.service';

const router = Router();

// AI 對話 - 輔助填寫工作項目
router.post(
  '/chat',
  authenticate,
  [
    body('message').notEmpty().withMessage('訊息內容為必填'),
    body('sessionId').optional(),
    body('context').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { message, sessionId, context } = req.body;
      
      const response = await aiService.chat(
        message,
        req.user!.id,
        sessionId,
        context
      );

      res.json(response);
    } catch (error) {
      console.error('AI chat error:', error);
      res.status(500).json({ error: 'AI 對話失敗' });
    }
  }
);

// AI 分析並產生工作項目摘要
router.post(
  '/analyze-workitems',
  authenticate,
  [
    body('teamId').isInt().withMessage('團隊 ID 為必填'),
    body('workItems').isArray().withMessage('工作項目列表為必填')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId, workItems } = req.body;
      
      const analysis = await aiService.analyzeWorkItems(
        workItems,
        teamId
      );

      res.json(analysis);
    } catch (error) {
      console.error('AI analyze error:', error);
      res.status(500).json({ error: 'AI 分析失敗' });
    }
  }
);

// AI 智能分配工作任務
router.post(
  '/distribute-tasks',
  authenticate,
  [
    body('teamId').isInt().withMessage('團隊 ID 為必填'),
    body('workItems').isArray().withMessage('工作項目列表為必填'),
    body('teamMembers').isArray().withMessage('團隊成員列表為必填')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId, workItems, teamMembers } = req.body;
      
      const distribution = await aiService.distributeTasksToTeam(
        workItems,
        teamMembers,
        teamId
      );

      res.json(distribution);
    } catch (error) {
      console.error('AI distribute tasks error:', error);
      res.status(500).json({ error: 'AI 分配任務失敗' });
    }
  }
);

// 完成早會 Review（AI 總結）
router.post(
  '/standup/review',
  authenticate,
  [
    body('teamId').isInt().withMessage('團隊 ID 為必填'),
    body('standupId').isInt().withMessage('站立會議 ID 為必填')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId, standupId } = req.body;
      
      const review = await standupService.completeStandupReview(
        standupId,
        teamId,
        req.user!.id
      );

      res.json(review);
    } catch (error) {
      console.error('Standup review error:', error);
      res.status(500).json({ error: '完成會議 Review 失敗' });
    }
  }
);

// 取得站立會議資訊
router.get(
  '/standup/team/:teamId/today',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const standup = await standupService.getTodayStandup(teamId);
      res.json(standup);
    } catch (error) {
      console.error('Get standup error:', error);
      res.status(500).json({ error: '取得站立會議資訊失敗' });
    }
  }
);

// AI 產生每日總結
router.post(
  '/daily-summary',
  authenticate,
  [
    body('teamId').isInt().withMessage('團隊 ID 為必填'),
    body('summaryDate').optional(),
    body('forceRegenerate').optional().isBoolean()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId, summaryDate, forceRegenerate } = req.body;
      
      const summary = await aiService.generateDailySummary(
        teamId,
        summaryDate || new Date().toISOString().split('T')[0],
        req.user!.id,
        forceRegenerate || false
      );

      res.json(summary);
    } catch (error) {
      console.error('Generate daily summary error:', error);
      res.status(500).json({ error: '產生每日總結失敗' });
    }
  }
);

// 儲存每日總結
router.post(
  '/daily-summary/save',
  authenticate,
  [
    body('teamId').isInt().withMessage('團隊 ID 為必填'),
    body('summaryDate').notEmpty().withMessage('日期為必填'),
    body('summaryContent').notEmpty().withMessage('總結內容為必填')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId, summaryDate, summaryContent } = req.body;
      
      const result = await aiService.saveDailySummary(
        teamId,
        summaryDate,
        summaryContent,
        req.user!.id
      );

      res.json(result);
    } catch (error) {
      console.error('Save daily summary error:', error);
      res.status(500).json({ error: '儲存每日總結失敗' });
    }
  }
);

// 取得歷史每日總結
router.get(
  '/daily-summary/team/:teamId/history',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const limit = parseInt(req.query.limit as string) || 30;
      
      const history = await aiService.getDailySummaryHistory(teamId, limit);
      res.json(history);
    } catch (error) {
      console.error('Get summary history error:', error);
      res.status(500).json({ error: '取得歷史總結失敗' });
    }
  }
);

// 取得特定日期的每日總結
router.get(
  '/daily-summary/team/:teamId/date/:date',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const date = req.params.date;
      
      const summary = await aiService.getDailySummaryByDate(teamId, date);
      
      if (!summary) {
        return res.status(404).json({ error: '找不到該日期的總結' });
      }
      
      res.json(summary);
    } catch (error) {
      console.error('Get summary by date error:', error);
      res.status(500).json({ error: '取得總結失敗' });
    }
  }
);

// 取得聊天歷史記錄（依 sessionId）
router.get(
  '/chat/history/:sessionId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const sessionId = req.params.sessionId;
      const result = await aiService.getChatHistory(sessionId);
      res.json(result);
    } catch (error) {
      console.error('Get chat history error:', error);
      res.status(500).json({ error: '取得聊天記錄失敗' });
    }
  }
);

// 生成工作項目摘要（從對話生成標題和內容）
router.post(
  '/generate-work-summary',
  authenticate,
  [
    body('sessionId').notEmpty().withMessage('Session ID 為必填')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { sessionId } = req.body;
      
      const summary = await aiService.generateWorkItemSummary(
        sessionId,
        req.user!.id
      );

      res.json(summary);
    } catch (error) {
      console.error('Generate work summary error:', error);
      res.status(500).json({ error: '生成工作摘要失敗' });
    }
  }
);

export default router;
