import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import {
  requireGuestAccess,
  type GuestAccessRequest,
} from '../middleware/guestAccess.js';
import { createPublicVehicleNotice } from './publicAccess.js';
import {
  getVehicleNoticeStats,
  listVehicleNotices,
  listVehicleNoticesPanel,
  updateVehicleNoticeStatus,
} from './vehicleNotices.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { Church } from '../models/Church.js';
import { PublicRateLimit } from '../models/PublicRateLimit.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { createGuestPublicId, createGuestToken } from '../utils/guestToken.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

process.env.GUEST_ACCESS_SECRET = 'teste-guest-veiculos-chave-outra-654321abcdef';
process.env.JWT_SECRET = 'teste-jwt-veiculos-chave-longa-123456abcdef';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const userA = new Types.ObjectId();
const userB = new Types.ObjectId();
const noticeA = new Types.ObjectId();
const noticeB = new Types.ObjectId();

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

function authReq(
  churchId: Types.ObjectId,
  userId: Types.ObjectId,
  extras: Partial<AuthenticatedRequest> = {}
): AuthenticatedRequest {
  return {
    auth: {
      userId: String(userId),
      churchId: String(churchId),
      role: 'owner',
      name: 'Responsável',
      email: 'owner@example.com',
    },
    query: {},
    params: {},
    body: {},
    headers: {},
    ...extras,
  } as AuthenticatedRequest;
}

function mockRes() {
  const state: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 200,
    body: undefined,
    headers: {},
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    setHeader(name: string, value: string) {
      state.headers[name] = value;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

function stubPanelFind(
  implementation: (filter: Record<string, unknown>) => unknown[] | Promise<unknown[]>
) {
  stubMethod(VehicleNotice, 'find', (filter: Record<string, unknown>) => {
    const chain = {
      select() {
        return chain;
      },
      async sort(sort: Record<string, number>) {
        assert.deepEqual(sort, { createdAt: -1 });
        return implementation(filter);
      },
    };
    return chain;
  });
}

function allowRateLimit() {
  stubMethod(PublicRateLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
}

function stubGuestAccess(type: string, churchId = churchA) {
  const publicId = createGuestPublicId();
  const token = createGuestToken(publicId, 1);
  const accessId = new Types.ObjectId();

  stubMethod(GuestAccess, 'findOne', () => ({
    select() {
      return {
        lean: async () => ({
          _id: accessId,
          churchId,
          name: 'Estacionamento — domingo',
          publicId,
          type,
          version: 1,
          active: true,
        }),
      };
    },
  }));

  stubMethod(Church, 'findOne', () => ({
    select() {
      return {
        lean: async () => ({ _id: churchId, name: 'Igreja Alfa' }),
      };
    },
  }));

  return { publicId, token, accessId };
}

describe('avisos de veículos — isolamento multi-tenant', () => {
  test('proprietário A lista somente avisos da igreja A', async () => {
    let receivedFilter: Record<string, unknown> | undefined;
    stubMethod(VehicleNotice, 'find', (filter: Record<string, unknown>) => {
      receivedFilter = filter;
      return {
        sort: async () => [
          {
            _id: noticeA,
            plate: 'ABC-1D23',
            plateNormalized: 'ABC1D23',
            vehicleModel: 'Gol branco',
            requestedAction: 'remove_vehicle',
            details: '',
            status: 'pending',
            source: 'guest_access',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
    });

    const { res, state } = mockRes();
    await listVehicleNotices(authReq(churchA, userA), res);

    assert.equal(state.statusCode, 200);
    assert.equal(String((receivedFilter as { churchId: Types.ObjectId }).churchId), String(churchA));
    assert.equal((state.body as Array<{ id: string }>).length, 1);
  });

  test('proprietário A não atualiza aviso da igreja B', async () => {
    let findFilter: Record<string, unknown> | undefined;
    stubMethod(VehicleNotice, 'findOne', async (filter: Record<string, unknown>) => {
      findFilter = filter;
      return null;
    });

    const { res, state } = mockRes();
    await updateVehicleNoticeStatus(
      authReq(churchA, userA, {
        params: { id: String(noticeB) },
        body: { status: 'announced' },
      }),
      res
    );

    assert.equal(state.statusCode, 404);
    assert.equal(String((findFilter as { churchId: Types.ObjectId }).churchId), String(churchA));
    assert.equal(String((findFilter as { _id: Types.ObjectId })._id), String(noticeB));
  });

  test('acesso de veículos envia aviso apenas para a igreja do token', async () => {
    allowRateLimit();
    const { token, accessId } = stubGuestAccess('vehicle_notices:create', churchA);

    let created: Record<string, unknown> | undefined;
    stubMethod(VehicleNotice, 'exists', async () => null);
    stubMethod(VehicleNotice, 'create', async (doc: Record<string, unknown>) => {
      created = doc;
      return doc;
    });
    stubMethod(GuestAccess, 'updateOne', async () => ({ acknowledged: true }));

    const req = {
      method: 'POST',
      params: { token },
      body: {
        plate: 'abc1d23',
        vehicleModel: 'Gol branco',
        requestedAction: 'remove_vehicle',
        details: 'Bloqueando a saída',
        churchId: String(churchB),
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;
    const { res, state } = mockRes();

    await requireGuestAccess('vehicle_notices:create')(req, res, async () => {
      await createPublicVehicleNotice(req, res);
    });

    assert.equal(state.statusCode, 400);
    assert.match(String((state.body as { error: string }).error), /igreja/i);
    assert.equal(created, undefined);

    const reqOk = {
      method: 'POST',
      params: { token },
      body: {
        plate: 'abc1d23',
        vehicleModel: 'Gol branco',
        requestedAction: 'remove_vehicle',
        details: 'Bloqueando a saída',
      },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      guestAccess: {
        churchId: String(churchA),
        churchName: 'Igreja Alfa',
        guestAccessId: String(accessId),
        accessName: 'Estacionamento',
        scope: 'vehicle_notices:create' as const,
      },
    } as unknown as GuestAccessRequest;
    const second = mockRes();
    await createPublicVehicleNotice(reqOk, second.res);

    assert.equal(second.state.statusCode, 201);
    assert.equal(String((created as { churchId: Types.ObjectId } | undefined)?.churchId), String(churchA));
    assert.deepEqual(second.state.body, { success: true, message: 'Aviso enviado' });
  });

  test('acesso de visitantes não envia aviso de veículo', async () => {
    allowRateLimit();
    const { token } = stubGuestAccess('visitors:create');
    const req = {
      method: 'POST',
      params: { token },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;
    const { res, state } = mockRes();
    await requireGuestAccess('vehicle_notices:create')(req, res, () => {
      assert.fail('escopo cruzado');
    });
    assert.equal(state.statusCode, 403);
  });

  test('acesso de oração não envia aviso de veículo', async () => {
    allowRateLimit();
    const { token } = stubGuestAccess('prayers:create');
    const req = {
      method: 'POST',
      params: { token },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as GuestAccessRequest;
    const { res, state } = mockRes();
    await requireGuestAccess('vehicle_notices:create')(req, res, () => {
      assert.fail('escopo cruzado');
    });
    assert.equal(state.statusCode, 403);
  });

  test('acesso de veículos não cadastra visitantes nem oração', async () => {
    allowRateLimit();
    const { token } = stubGuestAccess('vehicle_notices:create');
    for (const scope of ['visitors:create', 'prayers:create'] as const) {
      const req = {
        method: 'POST',
        params: { token },
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as GuestAccessRequest;
      const { res, state } = mockRes();
      await requireGuestAccess(scope)(req, res, () => {
        assert.fail(`não deveria autorizar ${scope}`);
      });
      assert.equal(state.statusCode, 403, scope);
      while (stubs.length > 1) stubs.pop()?.restore();
      allowRateLimit();
      stubGuestAccess('vehicle_notices:create');
    }
  });

  test('outro aviso exige descrição e placa inválida é rejeitada', async () => {
    allowRateLimit();
    const { accessId } = stubGuestAccess('vehicle_notices:create');
    const base = {
      method: 'POST',
      params: { token: 'x' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      guestAccess: {
        churchId: String(churchA),
        churchName: 'Igreja Alfa',
        guestAccessId: String(accessId),
        accessName: 'Estacionamento',
        scope: 'vehicle_notices:create' as const,
      },
    };

    const invalidPlate = mockRes();
    await createPublicVehicleNotice(
      {
        ...base,
        body: { plate: 'XX', vehicleModel: 'Gol', requestedAction: 'other', details: 'x' },
      } as unknown as GuestAccessRequest,
      invalidPlate.res
    );
    assert.equal(invalidPlate.state.statusCode, 400);
    assert.match(String((invalidPlate.state.body as { error: string }).error), /placa/i);

    const missingDetails = mockRes();
    await createPublicVehicleNotice(
      {
        ...base,
        body: { plate: 'ABC-1D23', vehicleModel: 'Gol', requestedAction: 'other', details: '' },
      } as unknown as GuestAccessRequest,
      missingDetails.res
    );
    assert.equal(missingDetails.state.statusCode, 400);
    assert.match(String((missingDetails.state.body as { error: string }).error), /Descreva|feito/i);
  });

  test('envio repetido com o mesmo requestId é idempotente', async () => {
    let createdCount = 0;
    stubMethod(VehicleNotice, 'exists', async (filter: Record<string, unknown>) => {
      if (filter.requestId === 'req-abc-123') return { _id: noticeA };
      return null;
    });
    stubMethod(VehicleNotice, 'create', async () => {
      createdCount += 1;
      return {};
    });

    const { accessId } = stubGuestAccess('vehicle_notices:create');
    const req = {
      method: 'POST',
      params: { token: 'x' },
      body: {
        plate: 'ABC-1D23',
        vehicleModel: 'Gol branco',
        requestedAction: 'remove_vehicle',
        requestId: 'req-abc-123',
      },
      guestAccess: {
        churchId: String(churchA),
        churchName: 'Igreja Alfa',
        guestAccessId: String(accessId),
        accessName: 'Estacionamento',
        scope: 'vehicle_notices:create' as const,
      },
    } as unknown as GuestAccessRequest;
    const { res, state } = mockRes();
    await createPublicVehicleNotice(req, res);
    assert.equal(state.statusCode, 201);
    assert.equal(createdCount, 0);
  });

  test('contagem e busca por placa ficam na igreja da sessão', async () => {
    const filters: Array<Record<string, unknown>> = [];
    stubMethod(VehicleNotice, 'countDocuments', async (filter: Record<string, unknown>) => {
      filters.push(filter);
      return 1;
    });

    const stats = mockRes();
    await getVehicleNoticeStats(authReq(churchA, userA, { query: { date: '2026-09-04' } }), stats.res);
    assert.equal(stats.state.statusCode, 200);
    assert.equal(String((filters[0] as { churchId: Types.ObjectId }).churchId), String(churchA));

    stubMethod(VehicleNotice, 'find', (filter: Record<string, unknown>) => {
      filters.push(filter);
      return { sort: async () => [] };
    });
    const list = mockRes();
    await listVehicleNotices(
      authReq(churchA, userA, { query: { plate: 'ABC-1D23', status: 'pending' } }),
      list.res
    );
    const plateFilter = filters.at(-1) as { churchId: Types.ObjectId; plateNormalized: unknown; status: string };
    assert.equal(String(plateFilter.churchId), String(churchA));
    assert.equal(plateFilter.status, 'pending');
    assert.ok(plateFilter.plateNormalized);
  });

  test('status só aceita transições permitidas', async () => {
    const noticeDoc: {
      _id: Types.ObjectId;
      churchId: Types.ObjectId;
      plate: string;
      plateNormalized: string;
      vehicleModel: string;
      requestedAction: string;
      details: string;
      status: string;
      source: string;
      archived: boolean;
      updatedAt: Date;
      save: () => Promise<unknown>;
    } = {
      _id: noticeA,
      churchId: churchA,
      plate: 'ABC-1234',
      plateNormalized: 'ABC1234',
      vehicleModel: 'Onix',
      requestedAction: 'turn_off_lights',
      details: '',
      status: 'resolved',
      source: 'guest_access',
      archived: false,
      updatedAt: new Date('2026-09-07T12:00:00.000Z'),
      save: async function save() {
        return this;
      },
    };

    stubMethod(VehicleNotice, 'findOne', async () => noticeDoc);

    const { res, state } = mockRes();
    await updateVehicleNoticeStatus(
      authReq(churchA, userA, {
        params: { id: String(noticeA) },
        body: { status: 'pending', updatedAt: '2026-09-07T12:00:00.000Z' },
      }),
      res
    );
    assert.equal(state.statusCode, 200);

    noticeDoc.status = 'resolved';
    const skip = mockRes();
    await updateVehicleNoticeStatus(
      authReq(churchA, userA, {
        params: { id: String(noticeA) },
        body: { status: 'announced', updatedAt: '2026-09-07T12:00:00.000Z' },
      }),
      skip.res
    );
    assert.equal(skip.state.statusCode, 400);

    noticeDoc.status = 'pending';
    noticeDoc.updatedAt = new Date('2026-09-07T12:00:01.000Z');
    const stale = mockRes();
    await updateVehicleNoticeStatus(
      authReq(churchA, userA, {
        params: { id: String(noticeA) },
        body: { status: 'announced', updatedAt: '2026-09-07T12:00:00.000Z' },
      }),
      stale.res
    );
    assert.equal(stale.state.statusCode, 409);

    noticeDoc.status = 'pending';
    const bad = mockRes();
    await updateVehicleNoticeStatus(
      authReq(churchA, userA, {
        params: { id: String(noticeA) },
        body: { status: 'pending', updatedAt: '2026-09-07T12:00:01.000Z' },
      }),
      bad.res
    );
    assert.equal(bad.state.statusCode, 400);
  });

  test('painel da TV lista só avisos ativos da igreja da sessão', async () => {
    let receivedFilter: Record<string, unknown> | undefined;
    stubPanelFind((filter) => {
      receivedFilter = filter;
      return [
          {
            _id: noticeA,
            plate: 'ABC-1D23',
            vehicleModel: 'Gol branco',
            requestedAction: 'remove_vehicle',
            otherDescription: '',
            details: 'O carro está bloqueando a saída',
            status: 'pending',
            guestAccess: { name: 'Estacionamento' },
            createdAt: new Date(),
          },
          {
            _id: noticeB,
            plate: 'ZZZ-9999',
            vehicleModel: 'Outro',
            requestedAction: 'other',
            otherDescription: '<b>Farol</b> alto',
            details: 'telefone 9999',
            status: 'announced',
            createdAt: new Date(),
          },
      ];
    });

    const { res, state } = mockRes();
    await listVehicleNoticesPanel(
      authReq(churchA, userA, { query: { churchId: String(churchB) } }),
      res
    );

    assert.equal(state.statusCode, 200);
    assert.equal(state.headers['Cache-Control'], 'private, no-store');
    assert.equal(state.headers.Vary, 'Cookie, Authorization');
    assert.equal(String((receivedFilter as { churchId: Types.ObjectId }).churchId), String(churchA));
    assert.equal((receivedFilter as { archived: boolean }).archived, false);
    assert.deepEqual((receivedFilter as { status: { $in: string[] } }).status.$in, [
      'pending',
      'announced',
    ]);
    const body = state.body as Array<Record<string, unknown>>;
    assert.equal(body.length, 2);
    assert.equal(body[0].plate, 'ABC-1D23');
    assert.equal(body[0].instruction, 'POR FAVOR, RETIRE O VEÍCULO');
    assert.equal(body[1].instruction, 'FAROL ALTO');
    assert.equal('details' in body[0], false);
    assert.equal('guestAccessName' in body[0], false);
    assert.equal('otherDescription' in body[0], false);
  });

  test('painel da TV não mistura avisos de outra igreja', async () => {
    stubPanelFind((filter) => {
      assert.equal(String((filter as { churchId: Types.ObjectId }).churchId), String(churchB));
      return [];
    });

    const { res, state } = mockRes();
    await listVehicleNoticesPanel(authReq(churchB, userB), res);
    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body, []);
  });

  test('painel da TV vazio não inventa avisos', async () => {
    stubPanelFind(() => []);
    const { res, state } = mockRes();
    await listVehicleNoticesPanel(authReq(churchA, userA), res);
    assert.equal(state.statusCode, 200);
    assert.deepEqual(state.body, []);
  });

  test('painel da TV exige sessão autenticada e é somente leitura', async () => {
    const { res, state } = mockRes();
    await requireAuth(
      { headers: {}, query: {}, params: {}, body: {} } as AuthenticatedRequest,
      res,
      () => {
        assert.fail('não deveria autorizar');
      }
    );
    assert.equal(state.statusCode, 401);

    const token = createGuestToken(createGuestPublicId(), 1);
    const guest = mockRes();
    await requireAuth(
      {
        headers: { authorization: `Bearer ${token}` },
        query: {},
        params: {},
        body: {},
      } as unknown as AuthenticatedRequest,
      guest.res,
      () => {
        assert.fail('token de formulário público não abre o painel');
      }
    );
    assert.equal(guest.state.statusCode, 401);
  });

  test('QR Code / link público usa o token completo sem churchId', () => {
    const publicId = createGuestPublicId();
    const token = createGuestToken(publicId, 1);
    const url = `https://exemplo.app/acesso/${token}`;
    assert.match(url, new RegExp(`/acesso/${token.replace(/\./g, '\\.')}$`));
    assert.equal(url.includes(String(churchA)), false);
  });
});
