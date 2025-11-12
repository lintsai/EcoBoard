import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as checkinService from '../services/checkin.service';

const router = Router();

// 每日打卡
router.post(
  '/',
  authenticate,
  [body('teamId').isInt().withMessage('團隊 ID 為必填')],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { teamId } = req.body;
      const checkin = await checkinService.createCheckin(
        teamId,
        req.user!.id
      );

      res.status(201).json(checkin);
    } catch (error: any) {
      console.error('Check-in error:', error);
      if (error.message === 'ALREADY_CHECKED_IN') {
        return res.status(400).json({ error: '今日已打卡' });
      }
      res.status(500).json({ error: '打卡失敗' });
    }
  }
);

// 取得使用者今日打卡狀態
router.get(
  '/today',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.query.teamId as string);
      const checkin = await checkinService.getUserTodayCheckin(req.user!.id, teamId);
      res.json(checkin);
    } catch (error) {
      console.error('Get user today checkin error:', error);
      res.status(500).json({ error: '取得打卡記錄失敗' });
    }
  }
);

// 取得今日團隊打卡狀態
router.get(
  '/team/:teamId/today',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const checkins = await checkinService.getTodayTeamCheckins(teamId);
      res.json(checkins);
    } catch (error) {
      console.error('Get checkins error:', error);
      res.status(500).json({ error: '取得打卡記錄失敗' });
    }
  }
);

// 取得使用者打卡歷史
router.get(
  '/history',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { teamId, startDate, endDate } = req.query;
      const checkins = await checkinService.getUserCheckinHistory(
        req.user!.id,
        teamId ? parseInt(teamId as string) : undefined,
        startDate as string,
        endDate as string
      );
      res.json(checkins);
    } catch (error) {
      console.error('Get checkin history error:', error);
      res.status(500).json({ error: '取得打卡歷史失敗' });
    }
  }
);

export default router;
