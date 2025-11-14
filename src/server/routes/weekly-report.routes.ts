import { Router, Response } from 'express';
import { body, param, query as expressQuery, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as weeklyReportService from '../services/weekly-report.service';

const router = Router();

// 取得團隊週報列表
router.get(
  '/team/:teamId',
  authenticate,
  [
    param('teamId').isInt().withMessage('團隊 ID 必須是整數')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const teamId = parseInt(req.params.teamId);
      const limit = parseInt(req.query.limit as string) || 50;

      const reports = await weeklyReportService.getWeeklyReports(teamId, limit);
      res.json(reports);
    } catch (error) {
      console.error('Get weekly reports error:', error);
      res.status(500).json({ error: '取得週報列表失敗' });
    }
  }
);

// 取得特定週報詳情
router.get(
  '/:reportId/team/:teamId',
  authenticate,
  [
    param('reportId').isInt().withMessage('報表 ID 必須是整數'),
    param('teamId').isInt().withMessage('團隊 ID 必須是整數')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const reportId = parseInt(req.params.reportId);
      const teamId = parseInt(req.params.teamId);

      const report = await weeklyReportService.getWeeklyReportById(reportId, teamId);
      
      if (!report) {
        return res.status(404).json({ error: '找不到該報表' });
      }

      res.json(report);
    } catch (error) {
      console.error('Get weekly report error:', error);
      res.status(500).json({ error: '取得週報詳情失敗' });
    }
  }
);

// 產生新的週報
router.post(
  '/generate',
  authenticate,
  [
    body('teamId').isInt().withMessage('團隊 ID 必須是整數'),
    body('startDate').isDate({ format: 'YYYY-MM-DD' }).withMessage('起始日期格式錯誤（需要 YYYY-MM-DD）'),
    body('endDate').isDate({ format: 'YYYY-MM-DD' }).withMessage('結束日期格式錯誤（需要 YYYY-MM-DD）'),
    body('reportType')
      .isIn(['statistics', 'analysis', 'burndown', 'productivity', 'task_distribution'])
      .withMessage('報表類型錯誤')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId, startDate, endDate, reportType } = req.body;

      // 驗證日期範圍
      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: '結束日期不能早於起始日期' });
      }

      const report = await weeklyReportService.generateWeeklyReport({
        teamId,
        startDate,
        endDate,
        reportType,
        userId: req.user!.id
      });

      res.json(report);
    } catch (error: any) {
      console.error('Generate weekly report error:', error);
      res.status(500).json({ error: error.message || '產生週報失敗' });
    }
  }
);

// 重新產生週報
router.post(
  '/:reportId/regenerate',
  authenticate,
  [
    param('reportId').isInt().withMessage('報表 ID 必須是整數'),
    body('teamId').isInt().withMessage('團隊 ID 必須是整數')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const reportId = parseInt(req.params.reportId);
      const { teamId } = req.body;

      const report = await weeklyReportService.regenerateWeeklyReport(
        reportId,
        teamId,
        req.user!.id
      );

      res.json(report);
    } catch (error: any) {
      console.error('Regenerate weekly report error:', error);
      res.status(500).json({ error: error.message || '重新產生週報失敗' });
    }
  }
);

// 刪除週報
router.delete(
  '/:reportId/team/:teamId',
  authenticate,
  [
    param('reportId').isInt().withMessage('報表 ID 必須是整數'),
    param('teamId').isInt().withMessage('團隊 ID 必須是整數')
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const reportId = parseInt(req.params.reportId);
      const teamId = parseInt(req.params.teamId);

      const result = await weeklyReportService.deleteWeeklyReport(reportId, teamId);
      res.json(result);
    } catch (error: any) {
      console.error('Delete weekly report error:', error);
      res.status(500).json({ error: error.message || '刪除週報失敗' });
    }
  }
);

export default router;
