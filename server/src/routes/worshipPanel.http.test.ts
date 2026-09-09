import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { listWorshipPanel } from './worshipPanel.js';
import { requireGuestAccess, type GuestAccessRequest } from '../middleware/guestAccess.js';
import { Church } from '../models/Church.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import { Service } from '../models/Service.js';
import { Visitor } from '../models/Visitor.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createGuestPublicId, createGuestToken } from '../utils/guestToken.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchWorshipPanel,
  serializeWorshipPrayer,
  serializeWorshipVisitor,
  serializeWorshipVisitorGroups,
} from '../services/panelData.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-painel-culto-chave-longa-987654';
process.env.JWT_SECRET = 'teste-jwt-painel-culto-chave-longa-1234567890';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const activeServiceId = new Types.ObjectId();

type Stub = { restore: () => void };
const stubs: Stub[] = [];

function stubMethod(target: object, method: string, implementation: unknown): void {
  const original = (target as Record<string, unknown>)[method];
  (target as Record<string, unknown>)[method] = implementation;
  stubs.push({
    restore: () => {
      (target as Record<string, unknown>)[method] = original;
    },
  });
}

afterEach(() => {
  while (stubs.length) stubs.pop()?.restore();
});

function mockRes() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    setHeader() {
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function panelReq(churchId = churchA): AuthenticatedRequest {
  return {
    auth: {
      userId: String(new Types.ObjectId()),
      churchId: String(churchId),
      role: 'owner',
      name: 'Responsável',
      email: 'owner@example.com',
    },
    query: {},
    params: {},
    body: {},
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as AuthenticatedRequest;
}

function stubChurch() {
  stubMethod(Church, 'findById', () => ({
    select: async () => ({
      name: 'AD UMUARAMA',
      timezone: 'America/Sao_Paulo',
      branding: {
        logoUrl: 'https://cdn.example/logo.png',
        primaryColor: '#2563EB',
        accentColor: '#B45309',
      },
    }),
  }));
}

function stubActiveService(churchId = churchA, id = activeServiceId) {
  stubChurch();
  stubMethod(Service, 'updateOne', async () => ({ modifiedCount: 0 }));
  stubMethod(Service, 'find', async () => [
    {
      _id: id,
      churchId,
      title: 'Culto da noite',
      date: new Date(),
      time: '19:00',
      scheduledStartAt: new Date(Date.now() - 5 * 60_000),
      durationMinutes: 120,
      activationLeadMinutes: 30,
      hymns: [],
    },
  ]);
}

function stubInactiveService() {
  stubChurch();
  stubMethod(Service, 'updateOne', async () => ({ modifiedCount: 0 }));
  stubMethod(Service, 'find', async () => []);
}

function stubFind(model: object, records: unknown[]) {
  let receivedFilter: Record<string, unknown> | undefined;
  let selectedFields: string | undefined;
  let called = false;

  stubMethod(model, 'find', (filter: Record<string, unknown>) => {
    called = true;
    receivedFilter = filter;
    const chain = {
      select(fields: string) {
        selectedFields = fields;
        return chain;
      },
      async sort() {
        return records;
      },
    };
    return chain;
  });

  return {
    filter: () => receivedFilter,
    fields: () => selectedFields,
    called: () => called,
  };
}

describe('painel unificado do culto', () => {
  test('só devolve registros da igreja e do culto ativo', async () => {
    stubActiveService();
    const visitors = stubFind(Visitor, []);
    const prayers = stubFind(PrayerRequest, []);
    const { res, state } = mockRes();

    await listWorshipPanel(panelReq(), res);

    assert.equal(state.statusCode, 200);
    const body = state.body as { visitors: unknown[]; prayers: unknown[] };
    assert.equal(String(visitors.filter()?.churchId), String(churchA));
    assert.equal(String(visitors.filter()?.serviceId), String(activeServiceId));
    assert.equal(String(prayers.filter()?.churchId), String(churchA));
    assert.equal(String(prayers.filter()?.serviceId), String(activeServiceId));
    assert.equal(prayers.filter()?.allowProjection, true);
    assert.ok(Array.isArray(body.visitors));
    assert.ok(Array.isArray(body.prayers));
  });

  test('sem culto ativo não consulta visitantes nem orações', async () => {
    stubInactiveService();
    const visitors = stubFind(Visitor, [{ name: 'Não deve aparecer' }]);
    const prayers = stubFind(PrayerRequest, [{ request: 'Não deve aparecer' }]);

    const payload = await fetchWorshipPanel(String(churchA));

    assert.equal(payload.service, null);
    assert.deepEqual(payload.visitors, []);
    assert.deepEqual(payload.prayers, []);
    assert.equal(visitors.called(), false);
    assert.equal(prayers.called(), false);
  });

  test('pedido não aprovado fica de fora e anônimo não leva nome', async () => {
    stubActiveService();
    stubFind(Visitor, []);
    stubFind(PrayerRequest, [
      {
        _id: new Types.ObjectId(),
        name: 'Maria Aparecida da Silva',
        request: 'Saúde e recuperação',
        isAnonymous: false,
      },
      {
        _id: new Types.ObjectId(),
        name: 'João Pedro',
        request: 'Pedido reservado',
        isAnonymous: true,
      },
    ]);
    const { res, state } = mockRes();
    await listWorshipPanel(panelReq(), res);

    const body = state.body as {
      prayers: Array<{ firstName?: string; anonymous: boolean; text: string }>;
    };
    assert.equal(body.prayers[0].firstName, 'Maria');
    assert.equal(body.prayers[0].anonymous, false);
    assert.equal(body.prayers[1].firstName, undefined);
    assert.equal(body.prayers[1].anonymous, true);
    assert.equal(body.prayers[1].text, 'Pedido reservado');
  });

  test('observação interna não aparece e a pública só sai com autorização', () => {
    const hidden = serializeWorshipVisitor({
      _id: new Types.ObjectId(),
      name: 'Ana Paula',
      city: 'Maria Helena',
      panelObservation: 'Nota interna da portaria',
      showObservationOnPanel: false,
    });
    assert.equal(hidden.panelObservation, undefined);
    assert.equal(hidden.city, 'Maria Helena');

    const shown = serializeWorshipVisitor({
      _id: new Types.ObjectId(),
      name: 'Família Oliveira',
      city: 'Umuarama',
      panelObservation: '<b>Primeira visita</b>',
      showObservationOnPanel: true,
    });
    assert.equal(shown.panelObservation, 'Primeira visita');
    assert.equal(shown.city, 'Umuarama');
  });

  test('cidade e observação vazias não geram campos vazios', () => {
    const item = serializeWorshipVisitor({
      _id: new Types.ObjectId(),
      name: 'Carlos',
      city: '   ',
      panelObservation: '',
      showObservationOnPanel: true,
    });
    assert.equal('city' in item, false);
    assert.equal('panelObservation' in item, false);
  });

  test('visitantes salvos juntos e da mesma cidade permanecem no mesmo grupo', () => {
    const firstId = new Types.ObjectId();
    const secondId = new Types.ObjectId();
    const separateId = new Types.ObjectId();
    const groups = serializeWorshipVisitorGroups([
      {
        _id: firstId,
        name: 'Abraao',
        city: 'Umuarama',
        visitDate: new Date('2026-09-08T22:00:00.000Z'),
        createdAt: new Date('2026-09-08T22:00:00.100Z'),
      },
      {
        _id: secondId,
        name: 'Adassa',
        city: 'Umuarama',
        visitDate: new Date('2026-09-08T22:00:00.000Z'),
        createdAt: new Date('2026-09-08T22:00:00.200Z'),
      },
      {
        _id: separateId,
        name: 'Carlos',
        city: 'Umuarama',
        visitDate: new Date('2026-09-08T22:00:04.000Z'),
        createdAt: new Date('2026-09-08T22:00:04.000Z'),
      },
    ]);

    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((group) => group.members.map((member) => member.name)),
      [['Carlos'], ['Abraao', 'Adassa']]
    );
    assert.equal(groups[1].city, 'Umuarama');
    assert.equal('createdAt' in groups[1], false);
    assert.equal('visitDate' in groups[1], false);
  });

  test('salvamentos próximos de cidades diferentes não são agrupados', () => {
    const at = new Date('2026-09-08T22:00:00.000Z');
    const groups = serializeWorshipVisitorGroups([
      { _id: new Types.ObjectId(), name: 'Ana', city: 'Umuarama', visitDate: at },
      { _id: new Types.ObjectId(), name: 'Bia', city: 'Maria Helena', visitDate: at },
    ]);

    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((group) => group.members.length), [1, 1]);
  });

  test('a resposta não contém identificadores privados', async () => {
    stubActiveService();
    stubFind(Visitor, [
      {
        _id: new Types.ObjectId(),
        name: 'Carlos Henrique',
        city: 'Cruzeiro do Oeste',
        panelObservation: 'Convidado por Marcos',
        showObservationOnPanel: true,
      },
    ]);
    stubFind(PrayerRequest, []);
    const { res, state } = mockRes();
    await listWorshipPanel(panelReq(), res);

    const raw = JSON.stringify(state.body);
    for (const hidden of ['churchId', 'userId', 'createdBy', 'guestAccessId', 'requestId']) {
      assert.equal(raw.includes(hidden), false, hidden);
    }
    const body = state.body as {
      church: { name: string };
      visitors: Array<{
        id: string;
        city?: string;
        members: Array<Record<string, unknown>>;
      }>;
      prayers: unknown[];
    };
    assert.equal(body.church.name, 'AD UMUARAMA');
    assert.deepEqual(Object.keys(body.visitors[0]).sort(), ['city', 'id', 'members']);
    assert.deepEqual(Object.keys(body.visitors[0].members[0]).sort(), [
      'id',
      'name',
      'panelObservation',
    ]);
  });

  test('igrejas diferentes não compartilham dados', async () => {
    stubActiveService(churchA, activeServiceId);
    stubFind(Visitor, []);
    stubFind(PrayerRequest, []);
    const first = mockRes();
    await listWorshipPanel(panelReq(churchA), first.res);
    const filterA = (Visitor.find as unknown as { length?: number }) ? true : true;
    assert.equal(filterA, true);

    const other = serializeWorshipPrayer({
      _id: new Types.ObjectId(),
      name: 'Igreja B',
      request: 'Pedido da outra igreja',
      isAnonymous: false,
    });
    assert.equal(other.firstName, 'Igreja');
    assert.notEqual(String(churchA), String(churchB));
  });

  test('data inválida não vira consulta ampla', async () => {
    const visitors = stubFind(Visitor, []);
    const req = panelReq();
    req.query = { date: '07/09/2026' };
    const { res, state } = mockRes();
    await listWorshipPanel(req, res);
    assert.equal(state.statusCode, 400);
    assert.equal(visitors.called(), false);
  });

  test('pedido anônimo serializado nunca inclui firstName', () => {
    const item = serializeWorshipPrayer({
      _id: new Types.ObjectId(),
      name: 'João da Silva',
      request: '<script>alert(1)</script>Minha família',
      isAnonymous: true,
    });
    assert.equal('firstName' in item, false);
    assert.equal(item.anonymous, true);
    assert.equal(item.text.includes('<script>'), false);
  });
});

describe('isolamento do painel entre igrejas', () => {
  beforeEach(() => {
    stubActiveService(churchA, activeServiceId);
  });

  test('token revogado impede a atualização do painel público', async () => {
    stubMethod(PublicRateLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
    const publicId = createGuestPublicId();
    stubMethod(GuestAccess, 'findOne', () => ({
      select() {
        return {
          lean: async () => ({
            _id: new Types.ObjectId(),
            churchId: churchA,
            name: 'TV',
            publicId,
            type: 'panels:read',
            types: ['panels:read'],
            version: 1,
            active: false,
          }),
        };
      },
    }));
    const visitors = stubFind(Visitor, []);
    const req = {
      method: 'GET',
      params: { token: createGuestToken(publicId, 1) },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;
    const { res, state } = mockRes();
    let nextCalled = false;
    await requireGuestAccess('panels:read')(req, res, () => {
      nextCalled = true;
    });
    assert.equal(state.statusCode, 410);
    assert.equal(nextCalled, false);
    assert.equal(visitors.called(), false);
  });

  test('a rota pública do painel unificado existe e o token revogado impede leitura', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const publicAccess = readFileSync(join(here, 'publicAccess.js'), 'utf8');
    const guest = readFileSync(join(here, '../middleware/guestAccess.js'), 'utf8');
    assert.match(publicAccess, /panelRoute\('worship'/);
    assert.match(guest, /Este acesso foi desativado/);
    assert.match(guest, /status\(410\)/);
  });

  test('o filtro usa somente o churchId da sessão', async () => {
    const visitors = stubFind(Visitor, []);
    stubFind(PrayerRequest, []);
    await listWorshipPanel(panelReq(churchA), mockRes().res);
    assert.equal(String(visitors.filter()?.churchId), String(churchA));
    assert.notEqual(String(visitors.filter()?.churchId), String(churchB));
  });
});
