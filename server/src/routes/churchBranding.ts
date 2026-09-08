import type { Response } from 'express';
import multer from 'multer';
import { Church } from '../models/Church.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { discardUnusedLogos, getBrandingLogoStore } from '../services/brandingLogoStore.js';
import {
  detectLogoImageType,
  LOGO_FIELD,
  MAX_LOGO_BYTES,
  publicChurchBranding,
  rejectsClientChurchId,
  validateBrandColor,
} from '../utils/branding.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const name = file.originalname.toLowerCase();
    if (file.mimetype === 'image/svg+xml' || name.endsWith('.svg')) {
      cb(new Error('SVG_REJECTED'));
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) {
      cb(new Error('TYPE_REJECTED'));
      return;
    }
    cb(null, true);
  },
});

export function brandingResponse(church: {
  name: string;
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    updatedAt?: Date;
  } | null;
}) {
  return {
    ...publicChurchBranding(church),
    updatedAt: church.branding?.updatedAt?.toISOString(),
  };
}

function clientChurchIdError(res: Response) {
  return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
}

export async function getChurchBranding(req: AuthenticatedRequest, res: Response) {
  try {
    const church = await Church.findById(req.auth!.churchId);
    if (!church || !church.active) {
      return res.status(404).json({ error: 'Igreja não encontrada.' });
    }
    return res.json(brandingResponse(church));
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar a identidade visual.' });
  }
}

export async function patchChurchBranding(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (rejectsClientChurchId(body)) return clientChurchIdError(res);

    const church = await Church.findById(req.auth!.churchId);
    if (!church || !church.active) {
      return res.status(404).json({ error: 'Igreja não encontrada.' });
    }

    if (body.restoreDefault === true) {
      const previousKey = church.branding?.logoStorageKey;
      church.branding = undefined;
      church.markModified('branding');
      await church.save();
      await discardUnusedLogos(String(church._id), { previousKey });
      return res.json(brandingResponse(church));
    }

    const next = { ...(church.branding || {}) };

    if ('primaryColor' in body) {
      if (body.primaryColor === '' || body.primaryColor === null) {
        delete next.primaryColor;
      } else {
        const parsed = validateBrandColor(body.primaryColor);
        if ('error' in parsed) return res.status(400).json({ error: parsed.error });
        next.primaryColor = parsed.hex;
      }
    }

    if ('accentColor' in body) {
      if (body.accentColor === '' || body.accentColor === null) {
        delete next.accentColor;
      } else {
        const parsed = validateBrandColor(body.accentColor);
        if ('error' in parsed) return res.status(400).json({ error: parsed.error });
        next.accentColor = parsed.hex;
      }
    }

    next.updatedAt = new Date();
    church.branding = next;
    church.markModified('branding');
    await church.save();
    return res.json(brandingResponse(church));
  } catch {
    return res.status(500).json({ error: 'Não foi possível salvar a identidade visual.' });
  }
}

export function uploadChurchLogo(req: AuthenticatedRequest, res: Response, next: () => void) {
  upload.single(LOGO_FIELD)(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    const message = error instanceof Error ? error.message : '';
    if (code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'O logotipo deve ter no máximo 2 MB.' });
    }
    if (message === 'SVG_REJECTED') {
      return res.status(400).json({ error: 'Não aceitamos arquivos SVG.' });
    }
    return res.status(400).json({ error: 'Envie um PNG, JPEG ou WebP de até 2 MB.' });
  });
}

export async function postChurchLogo(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (rejectsClientChurchId(body)) return clientChurchIdError(res);

    const file = req.file;
    if (!file?.buffer?.length) {
      return res.status(400).json({ error: 'Envie um PNG, JPEG ou WebP de até 2 MB.' });
    }
    if (file.size > MAX_LOGO_BYTES || file.buffer.length > MAX_LOGO_BYTES) {
      return res.status(400).json({ error: 'O logotipo deve ter no máximo 2 MB.' });
    }

    const type = detectLogoImageType(file.buffer);
    if (!type) {
      if (file.mimetype === 'image/svg+xml' || file.originalname.toLowerCase().endsWith('.svg')) {
        return res.status(400).json({ error: 'Não aceitamos arquivos SVG.' });
      }
      return res.status(400).json({ error: 'Envie um PNG, JPEG ou WebP de até 2 MB.' });
    }

    const church = await Church.findById(req.auth!.churchId);
    if (!church || !church.active) {
      return res.status(404).json({ error: 'Igreja não encontrada.' });
    }

    const churchId = String(church._id);
    const stored = await getBrandingLogoStore().put({
      churchId,
      buffer: file.buffer,
      contentType: type,
    });

    const previousKey = church.branding?.logoStorageKey;
    church.branding = {
      ...(church.branding || {}),
      logoUrl: stored.url,
      logoStorageKey: stored.key,
      updatedAt: new Date(),
    };
    church.markModified('branding');
    try {
      await church.save();
    } catch (error) {
      await getBrandingLogoStore().delete(stored.key).catch(() => undefined);
      throw error;
    }

    await discardUnusedLogos(churchId, { keepKey: stored.key, previousKey });

    return res.json(brandingResponse(church));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'BLOB_UNAVAILABLE') {
      return res.status(503).json({
        error: 'O armazenamento de imagens não está configurado. Defina BLOB_READ_WRITE_TOKEN.',
      });
    }
    if (/private store|public access/i.test(message)) {
      return res.status(503).json({
        error:
          'O store do Vercel Blob está privado. Crie outro store com acesso público e use o novo BLOB_READ_WRITE_TOKEN.',
      });
    }
    console.error('Falha ao enviar logotipo:', message || error);
    return res.status(500).json({ error: 'Não foi possível enviar o logotipo.' });
  }
}

export async function deleteChurchLogo(req: AuthenticatedRequest, res: Response) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (rejectsClientChurchId(body)) return clientChurchIdError(res);

    const church = await Church.findById(req.auth!.churchId);
    if (!church || !church.active) {
      return res.status(404).json({ error: 'Igreja não encontrada.' });
    }

    const previousKey = church.branding?.logoStorageKey;
    if (church.branding) {
      delete church.branding.logoUrl;
      delete church.branding.logoStorageKey;
      church.branding.updatedAt = new Date();
      church.markModified('branding');
    }
    await church.save();

    await discardUnusedLogos(String(church._id), { previousKey });

    return res.json(brandingResponse(church));
  } catch {
    return res.status(500).json({ error: 'Não foi possível remover o logotipo.' });
  }
}
