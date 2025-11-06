import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateLDAP } from '../services/ldap.service';
import { createOrGetUser } from '../services/user.service';
import jwt from 'jsonwebtoken';

const router = Router();

// LDAP 登入
router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('使用者名稱為必填'),
    body('password').notEmpty().withMessage('密碼為必填')
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { username, password } = req.body;

      // Authenticate with LDAP
      const ldapUser = await authenticateLDAP(username, password);
      
      if (!ldapUser) {
        return res.status(401).json({ error: '使用者名稱或密碼錯誤' });
      }

      // Create or get user from database
      const user = await createOrGetUser({
        username: ldapUser.username,
        displayName: ldapUser.displayName,
        email: ldapUser.email,
        ldapDn: ldapUser.dn
      });

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          displayName: user.displayName
        },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as jwt.SignOptions
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: '登入失敗，請稍後再試' });
    }
  }
);

// 驗證 token
router.get('/verify', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未提供認證令牌' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    res.json({
      valid: true,
      user: {
        id: decoded.id,
        username: decoded.username,
        displayName: decoded.displayName
      }
    });
  } catch (error) {
    res.status(401).json({ error: '無效的認證令牌', valid: false });
  }
});

export default router;
