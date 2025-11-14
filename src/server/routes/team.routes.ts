import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import * as teamService from '../services/team.service';
import * as userService from '../services/user.service';

const router = Router();

// 搜尋使用者（從資料庫）
router.get('/search-users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const searchTerm = req.query.q as string;
    
    if (!searchTerm || searchTerm.trim().length === 0) {
      return res.status(400).json({ error: '搜尋關鍵字不能為空' });
    }

    const users = await userService.searchUsers(searchTerm.trim());
    
    // 轉換格式以符合前端期望
    const formattedUsers = users.map(user => ({
      username: user.username,
      displayName: user.displayName || user.username,
      email: user.email,
      dn: user.ldapDn || ''
    }));
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: '搜尋使用者失敗' });
  }
});

// 取得使用者的所有團隊
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const teams = await teamService.getUserTeams(req.user!.id);
    res.json(teams);
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: '取得團隊列表失敗' });
  }
});

// 建立新團隊
router.post(
  '/',
  authenticate,
  [
    body('name').notEmpty().withMessage('團隊名稱為必填'),
    body('description').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description } = req.body;
      const team = await teamService.createTeam(
        name,
        description,
        req.user!.id
      );

      res.status(201).json(team);
    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({ error: '建立團隊失敗' });
    }
  }
);

// 取得團隊詳情
router.get('/:teamId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const team = await teamService.getTeamById(teamId, req.user!.id);
    
    if (!team) {
      return res.status(404).json({ error: '團隊不存在或無權限查看' });
    }

    res.json(team);
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: '取得團隊資訊失敗' });
  }
});

// 更新團隊
router.put(
  '/:teamId',
  authenticate,
  [
    body('name').optional(),
    body('description').optional()
  ],
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const updates = req.body;
      
      const team = await teamService.updateTeam(teamId, updates, req.user!.id);
      
      if (!team) {
        return res.status(404).json({ error: '團隊不存在或無權限修改' });
      }

      res.json(team);
    } catch (error) {
      console.error('Update team error:', error);
      res.status(500).json({ error: '更新團隊失敗' });
    }
  }
);

// 取得團隊成員
router.get('/:teamId/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const members = await teamService.getTeamMembers(teamId, req.user!.id);
    res.json(members);
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: '取得團隊成員失敗' });
  }
});

// 新增團隊成員
router.post(
  '/:teamId/members',
  authenticate,
  [body('username').notEmpty().withMessage('使用者名稱為必填')],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const teamId = parseInt(req.params.teamId);
      const { username } = req.body;
      
      const member = await teamService.addTeamMember(
        teamId,
        username,
        req.user!.id
      );

      res.status(201).json(member);
    } catch (error) {
      console.error('Add team member error:', error);
      res.status(500).json({ error: '新增團隊成員失敗' });
    }
  }
);

// 移除團隊成員
router.delete(
  '/:teamId/members/:userId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      const userId = parseInt(req.params.userId);
      
      await teamService.removeTeamMember(teamId, userId, req.user!.id);
      res.json({ message: '成員已移除' });
    } catch (error) {
      console.error('Remove team member error:', error);
      res.status(500).json({ error: '移除團隊成員失敗' });
    }
  }
);

// 更新成員角色
router.put(
  '/:teamId/members/:userId/role',
  authenticate,
  [body('role').isIn(['admin', 'member']).withMessage('角色必須是 admin 或 member')],
  async (req: AuthRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const teamId = parseInt(req.params.teamId);
      const userId = parseInt(req.params.userId);
      const { role } = req.body;
      
      await teamService.updateMemberRole(teamId, userId, role, req.user!.id);
      res.json({ message: '角色已更新' });
    } catch (error: any) {
      console.error('Update member role error:', error);
      res.status(error.message.includes('無權限') ? 403 : 500).json({ 
        error: error.message || '更新角色失敗' 
      });
    }
  }
);

// 刪除團隊
router.delete(
  '/:teamId',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const teamId = parseInt(req.params.teamId);
      await teamService.deleteTeam(teamId, req.user!.id);
      res.json({ message: '團隊已刪除' });
    } catch (error: any) {
      console.error('Delete team error:', error);
      res.status(error.message.includes('無權限') ? 403 : 500).json({ 
        error: error.message || '刪除團隊失敗' 
      });
    }
  }
);

export default router;
