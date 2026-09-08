import { Router, type Response } from 'express';
import {
  requireAuth,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { RetentionPolicy, type IRetentionPolicy } from '../models/RetentionPolicy.js';
import { RetentionRun } from '../models/RetentionRun.js';
import {
  defaultRetentionPolicy,
  parseRetentionPolicy,
  policyValues,
  previewRetention,
  runAutomaticRetention,
  runRetentionPolicy,
} from '../services/retention.js';
import { sendPrivateJson } from '../utils/publicRecord.js';
import { isPlaceholderSecret } from '../utils/configuredSecret.js';
import { validCronAuthorization } from '../utils/cronSecret.js';
import { withChurch } from '../utils/tenant.js';
import { requirePermission } from '../middleware/requirePermission.js';

const router = Router();

function serializePolicy(policy: IRetentionPolicy | null) {
  return {
    ...policyValues(policy),
    activatedAt: policy?.activatedAt,
    lastRunAt: policy?.lastRunAt,
    lastRunStatus: policy?.lastRunStatus,
    updatedAt: policy?.updatedAt,
  };
}

async function retentionOverview(churchId: string) {
  const policy = await RetentionPolicy.findOne(withChurch(churchId));
  const values = policy ? policyValues(policy) : defaultRetentionPolicy();
  const [preview, history] = await Promise.all([
    previewRetention(churchId, values),
    RetentionRun.find(withChurch(churchId))
      .select('trigger status summary startedAt completedAt')
      .sort({ startedAt: -1 })
      .limit(10),
  ]);

  return {
    policy: serializePolicy(policy),
    preview,
    history: history.map((run) => ({
      id: String(run._id),
      trigger: run.trigger,
      status: run.status,
      summary: run.summary,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    })),
  };
}

/** Endpoint exclusivo do agendador. Nunca aceita chamadas sem segredo configurado. */
router.get('/cron', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || isPlaceholderSecret(secret)) {
    return res.status(503).json({ error: 'CRON_SECRET não configurado.' });
  }
  if (!validCronAuthorization(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }

  try {
    const result = await runAutomaticRetention();
    return res.json({ ok: result.failed === 0, ...result });
  } catch {
    return res.status(500).json({ error: 'A rotina automática não pôde ser concluída.' });
  }
});

router.use(requireAuth, requirePermission('retention:manage'));

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    return sendPrivateJson(res, await retentionOverview(req.auth!.churchId));
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar a política de retenção.' });
  }
});

router.put('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body && typeof req.body === 'object' && 'churchId' in req.body) {
      return res.status(400).json({ error: 'O identificador da igreja não deve ser enviado.' });
    }

    const parsed = parseRetentionPolicy(req.body);
    if (!parsed.data) {
      return res.status(400).json({ error: parsed.error });
    }

    const churchFilter = withChurch(req.auth!.churchId);
    const current = await RetentionPolicy.findOne(churchFilter).select('enabled');
    if (parsed.data.enabled && current?.enabled !== true && req.body?.confirmActivation !== true) {
      return res.status(400).json({
        error: 'Confirme que os dados vencidos serão anonimizados ou excluídos automaticamente.',
      });
    }

    const now = new Date();
    await RetentionPolicy.findOneAndUpdate(
      churchFilter,
      {
        $set: {
          ...parsed.data,
          ...(parsed.data.enabled && current?.enabled !== true ? { activatedAt: now } : {}),
        },
        $setOnInsert: { churchId: req.auth!.churchId },
      },
      { upsert: true, new: true, runValidators: true }
    );

    return sendPrivateJson(res, await retentionOverview(req.auth!.churchId));
  } catch {
    return res.status(500).json({ error: 'Não foi possível salvar a política de retenção.' });
  }
});

router.post('/run', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.body?.confirmation !== 'EXCLUIR DADOS VENCIDOS') {
      return res.status(400).json({ error: 'Confirme a execução da limpeza.' });
    }

    const policy = await RetentionPolicy.findOne(
      withChurch(req.auth!.churchId, { enabled: true })
    ).select('_id');
    if (!policy) {
      return res.status(409).json({ error: 'Ative e salve a política antes de executar a limpeza.' });
    }

    const summary = await runRetentionPolicy(policy._id, 'owner');
    if (!summary) {
      return res.status(409).json({ error: 'Já existe uma limpeza em andamento para esta igreja.' });
    }

    return sendPrivateJson(res, {
      message: 'Limpeza concluída.',
      summary,
      overview: await retentionOverview(req.auth!.churchId),
    });
  } catch {
    return res.status(500).json({ error: 'A limpeza não pôde ser concluída.' });
  }
});

export default router;
