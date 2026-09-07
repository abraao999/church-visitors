import { Router, Response } from 'express';
import { HolyricsSettings, type HolyricsMode } from '../models/HolyricsSettings.js';
import { Service } from '../models/Service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { tenantRecordFilter, withChurch } from '../utils/tenant.js';
import {
  addSongsToHolyricsPlaylist,
  holyricsPublicError,
  searchHolyricsSong,
  testHolyricsConnection,
  type HolyricsConnection,
} from '../services/holyricsClient.js';
import { HolyricsHostError, normalizeHolyricsHost } from '../services/holyricsHost.js';

const router = Router();

async function getOrCreateSettings(churchId: string) {
  const settings = await HolyricsSettings.findOneAndUpdate(
    withChurch(churchId),
    { $setOnInsert: { churchId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  if (!settings) {
    throw new Error('Não foi possível carregar as configurações');
  }

  return settings;
}

function toConnection(settings: {
  mode: HolyricsMode;
  host: string;
  port: number;
  token: string;
  apiKey: string;
}): HolyricsConnection {
  return {
    mode: settings.mode,
    host: settings.host,
    port: settings.port,
    token: settings.token,
    apiKey: settings.apiKey,
  };
}

/** Nunca devolve token nem apiKey: o navegador só precisa saber se já existem. */
function publicSettings(settings: {
  mode: HolyricsMode;
  host: string;
  port: number;
  token: string;
  apiKey: string;
  updatedAt?: Date;
}) {
  return {
    mode: settings.mode,
    host: settings.host,
    port: settings.port,
    hasToken: Boolean(settings.token),
    hasApiKey: Boolean(settings.apiKey),
    updatedAt: settings.updatedAt,
  };
}

router.get('/settings', requireAuth, requirePermission('holyrics:read'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await getOrCreateSettings(req.auth!.churchId);
    res.json(publicSettings(settings));
  } catch {
    res.status(500).json({ error: 'Erro ao carregar configurações do Holyrics' });
  }
});

router.put('/settings', requireAuth, requirePermission('holyrics:configure'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const mode = req.body.mode === 'internet' ? 'internet' : 'local';
    const port = Number(req.body.port);
    const token = typeof req.body.token === 'string' ? req.body.token.trim() : '';
    const apiKey = typeof req.body.apiKey === 'string' ? req.body.apiKey.trim() : '';

    let host: string;
    try {
      host = normalizeHolyricsHost(req.body.host ?? '127.0.0.1');
    } catch (error) {
      if (error instanceof HolyricsHostError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }

    if (mode === 'local' && (!Number.isFinite(port) || port <= 0)) {
      return res.status(400).json({ error: 'Host e porta válidos são obrigatórios no modo local' });
    }

    const settings = await getOrCreateSettings(req.auth!.churchId);

    // O navegador não recebe mais os segredos, então campo vazio significa
    // "manter o que já está salvo" em vez de apagar.
    const nextToken = token || settings.token;
    const nextApiKey = apiKey || settings.apiKey;

    if (!nextToken) {
      return res.status(400).json({ error: 'Token do Holyrics é obrigatório' });
    }

    if (mode === 'internet' && !nextApiKey) {
      return res.status(400).json({ error: 'API Key é obrigatória no modo internet' });
    }

    settings.mode = mode;
    settings.host = host;
    settings.port = Number.isFinite(port) && port > 0 ? port : 8091;
    settings.token = nextToken;
    settings.apiKey = nextApiKey;
    await settings.save();

    res.json(publicSettings(settings));
  } catch {
    res.status(500).json({ error: 'Erro ao salvar configurações do Holyrics' });
  }
});

/**
 * O sync pelo navegador é o único caminho quando o servidor não alcança a rede
 * da igreja, e ele precisa do token. Fica num endpoint separado para o token
 * sair apenas nesse momento, e nunca no carregamento da tela de configurações.
 */
router.get('/local-token', requireAuth, requirePermission('holyrics:sync'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await getOrCreateSettings(req.auth!.churchId);

    if (settings.mode !== 'local') {
      return res.status(409).json({ error: 'Este token só é usado no modo local' });
    }

    if (!settings.token) {
      return res.status(400).json({ error: 'Configure o token do Holyrics antes de sincronizar' });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ host: settings.host, port: settings.port, token: settings.token });
  } catch {
    res.status(500).json({ error: 'Erro ao carregar o token do Holyrics' });
  }
});

router.post('/test', requireAuth, requirePermission('holyrics:configure'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await getOrCreateSettings(req.auth!.churchId);
    if (!settings.token) {
      return res.status(400).json({ error: 'Configure o token do Holyrics antes de testar' });
    }

    const songsCount = await testHolyricsConnection(toConnection(settings));
    res.json({
      ok: true,
      message: `Conexão OK. ${songsCount} música(s) encontradas na biblioteca do Holyrics.`,
      songsCount,
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: holyricsPublicError(error),
    });
  }
});

router.post('/sync', requireAuth, requirePermission('holyrics:sync'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const serviceId = typeof req.body.serviceId === 'string' ? req.body.serviceId : '';
    if (!serviceId) {
      return res.status(400).json({ error: 'Informe o culto (serviceId)' });
    }

    const settings = await getOrCreateSettings(req.auth!.churchId);
    if (!settings.token) {
      return res.status(400).json({
        error: 'Configure o Holyrics em Configurações antes de enviar as músicas',
      });
    }

    const serviceFilter = tenantRecordFilter(req.auth!.churchId, serviceId);
    if (!serviceFilter) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    const service = await Service.findOne(serviceFilter);
    if (!service) {
      return res.status(404).json({ error: 'Culto não encontrado' });
    }

    if (!service.hymns.length) {
      return res.status(400).json({ error: 'Este culto não tem louvores para enviar' });
    }

    const conn = toConnection(settings);
    const results: Array<{
      title: string;
      artist: string;
      status: 'added' | 'not_found' | 'error';
      holyricsId?: string;
      holyricsTitle?: string;
      message?: string;
    }> = [];

    const idsToAdd: string[] = [];

    for (const hymn of service.hymns) {
      try {
        const match = await searchHolyricsSong(conn, hymn.title, hymn.artist);
        if (!match?.id) {
          results.push({
            title: hymn.title,
            artist: hymn.artist,
            status: 'not_found',
            message: 'Não encontrada na biblioteca do Holyrics',
          });
          continue;
        }

        idsToAdd.push(String(match.id));
        results.push({
          title: hymn.title,
          artist: hymn.artist,
          status: 'added',
          holyricsId: String(match.id),
          holyricsTitle: match.title,
        });
      } catch (error) {
        results.push({
          title: hymn.title,
          artist: hymn.artist,
          status: 'error',
          message: holyricsPublicError(error),
        });
      }
    }

    const uniqueIds = [...new Set(idsToAdd)];
    if (uniqueIds.length > 0) {
      await addSongsToHolyricsPlaylist(conn, uniqueIds);
    }

    const added = results.filter((r) => r.status === 'added').length;
    const notFound = results.filter((r) => r.status === 'not_found').length;
    const errors = results.filter((r) => r.status === 'error').length;

    res.json({
      serviceId: service._id,
      serviceTitle: service.title,
      added,
      notFound,
      errors,
      results,
      message:
        errors > 0 && added === 0
          ? 'Não foi possível enviar as músicas. Verifique a conexão com o Holyrics.'
          : `${added} enviada(s), ${notFound} não encontrada(s)${errors ? `, ${errors} com erro` : ''}.`,
    });
  } catch (error) {
    res.status(400).json({
      error: holyricsPublicError(error),
    });
  }
});

export default router;
