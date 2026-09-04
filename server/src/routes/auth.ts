import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { User, type IUser } from '../models/User.js';
import {
  requireAuth,
  signToken,
  type AuthenticatedRequest,
  type AuthContext,
} from '../middleware/auth.js';
import { createChurchSlug, normalizeChurchName } from '../utils/church.js';

const router = Router();

function publicUser(
  user: { _id: unknown; name: string; email: string; username?: string },
  churchName: string
) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    username: user.username || undefined,
    churchName,
  };
}

function authResponse(
  user: {
    _id: unknown;
    name: string;
    email: string;
    username?: string;
    churchId: Types.ObjectId;
    role: 'owner';
  },
  churchName: string
) {
  const payload: AuthContext = {
    userId: String(user._id),
    churchId: String(user.churchId),
    role: user.role,
    name: user.name,
    email: user.email,
  };
  return {
    token: signToken(payload),
    user: publicUser(user, churchName),
  };
}

router.post('/register', async (req, res: Response) => {
  try {
    if (req.body?.churchId !== undefined) {
      return res.status(400).json({
        error: 'O identificador da igreja não deve ser enviado.',
      });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const username =
      typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const churchName = normalizeChurchName(
      typeof req.body.churchName === 'string' ? req.body.churchName : ''
    );

    if (!name || !email || !username || !password || !churchName) {
      return res.status(400).json({
        error: 'Igreja, nome, e-mail, usuário e senha são obrigatórios',
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
    const session = await mongoose.startSession();
    let user: IUser | undefined;
    let churchId: Types.ObjectId | undefined;

    try {
      await session.withTransaction(async () => {
        const [church] = await Church.create(
          [{ name: churchName, slug: createChurchSlug(churchName), active: true }],
          { session }
        );
        churchId = church._id as Types.ObjectId;

        const [createdUser] = await User.create(
          [{ name, email, username, passwordHash, churchId, role: 'owner' }],
          { session }
        );
        user = createdUser;
      });
    } finally {
      await session.endSession();
    }

    if (!user || !churchId) {
      throw new Error('Cadastro não concluído');
    }

    res.status(201).json(
      authResponse(user as IUser & { churchId: Types.ObjectId }, churchName)
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ error: 'E-mail ou usuário já cadastrado' });
    }
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

    if (!user.churchId) {
      return res.status(409).json({
        error: 'Esta conta ainda precisa ser vinculada a uma igreja. Fale com o administrador.',
      });
    }

    const church = await Church.findOne({ _id: user.churchId, active: true }).select('name');
    if (!church) {
      return res.status(403).json({ error: 'O acesso desta igreja está indisponível.' });
    }

    res.json(authResponse(user as IUser & { churchId: Types.ObjectId }, church.name));
  } catch {
    res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await User.findOne({
      _id: req.auth!.userId,
      churchId: req.auth!.churchId,
      role: req.auth!.role,
    }).select('name email username churchId role');
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const church = await Church.findOne({ _id: req.auth!.churchId, active: true }).select('name');
    if (!church) {
      return res.status(403).json({ error: 'O acesso desta igreja está indisponível.' });
    }

    res.json({ user: publicUser(user, church.name) });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
});

export default router;
