import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User.js';
import {
  requireAuth,
  signToken,
  type AuthenticatedRequest,
  type AuthUser,
} from '../middleware/auth.js';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function publicUser(user: { _id: unknown; name: string; email: string; username?: string }) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    username: user.username || undefined,
  };
}

function authResponse(user: { _id: unknown; name: string; email: string; username?: string }) {
  const payload: AuthUser = {
    id: String(user._id),
    name: user.name,
    email: user.email,
  };
  return {
    token: signToken(payload),
    user: publicUser(user),
  };
}

router.post('/register', async (req, res: Response) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const username =
      typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!name || !email || !username || !password) {
      return res.status(400).json({
        error: 'Nome, e-mail, usuário e senha são obrigatórios',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
    }

    if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
      return res.status(400).json({
        error: 'Usuário inválido. Use 3–30 caracteres: letras, números, . _ -',
      });
    }

    const existing = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existing) {
      return res.status(409).json({ error: 'E-mail ou usuário já cadastrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      username,
      passwordHash,
      provider: 'local',
    });

    res.status(201).json(authResponse(user));
  } catch {
    res.status(500).json({ error: 'Erro ao criar conta' });
  }
});

router.post('/login', async (req, res: Response) => {
  try {
    const login = typeof req.body.login === 'string' ? req.body.login.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    if (!login || !password) {
      return res.status(400).json({ error: 'Usuário/e-mail e senha são obrigatórios' });
    }

    const user = await User.findOne({
      $or: [{ email: login }, { username: login }],
    });

    if (!user?.passwordHash) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    res.json(authResponse(user));
  } catch {
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.post('/google', async (req, res: Response) => {
  try {
    const credential = typeof req.body.credential === 'string' ? req.body.credential : '';
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      return res.status(503).json({
        error: 'Login com Google não configurado. Defina GOOGLE_CLIENT_ID no server/.env',
      });
    }

    if (!credential) {
      return res.status(400).json({ error: 'Token do Google não informado' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      return res.status(401).json({ error: 'Conta Google inválida' });
    }

    const email = payload.email.toLowerCase();
    const name = (payload.name || email.split('@')[0] || 'Usuário').trim();
    const googleId = payload.sub;

    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        if (user.provider === 'local') {
          // mantém local, mas vincula googleId
        }
        await user.save();
      }
    } else {
      user = await User.create({
        name,
        email,
        googleId,
        provider: 'google',
      });
    }

    res.json(authResponse(user));
  } catch {
    res.status(401).json({ error: 'Falha ao validar login com Google' });
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select('name email username');
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    res.json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

export default router;
