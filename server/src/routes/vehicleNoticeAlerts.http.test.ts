import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import { Church } from '../models/Church.js';
import { Service } from '../models/Service.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { FORBIDDEN_ERROR, requirePermission } from '../middleware/requirePermission.js';
import { permissionsForRole } from '../utils/permissions.js';
import {
  encodeVehicleAlertCursor,
  VEHICLE_ALERTS_LIMIT,
} from '../utils/vehicleAlertCursor.js';
import { listVehicleNoticeAlerts, updateVehicleNoticeStatus } from './vehicleNotices.js';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const userA = new Types.ObjectId();
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
  extras: Partial<AuthenticatedRequest> = {},
  permissions = permissionsForRole('owner')
): AuthenticatedRequest {
  return {
    auth: {
      userId: String(userA),
      churchId: String(churchId),
      role: 'owner',
      name: 'Responsável',
      email: 'owner@example.com',
      permissions,
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

function stubActiveServiceIdle() {
  stubMethod(Church, 'findById', () => ({
    select: async () => ({ timezone: 'America/Sao_Paulo' }),
  }));
  stubMethod(Service, 'find', async () => []);
}

function stubAlertQuery(rows: unknown[], onFind?: (filter: Record<string, unknown>) => void) {
  stubMethod(VehicleNotice, 'find', (filter: Record<string, unknown>) => {
    onFind?.(filter);
    return {
      sort() {
        return this;
      },
      limit() {
        return this;
      },
      select() {
        return Promise.resolve(rows);
      },
    };
  });
}

describe('alertas de avisos de veículos', () => {
  test('primeira consulta não devolve avisos antigos e informa a contagem', async () => {
    stubActiveServiceIdle();
    stubMethod(VehicleNotice, 'countDocuments', async (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchA));
      assert.equal(filter.status, 'pending');
      return 3;
    });
    stubMethod(VehicleNotice, 'findOne', () => ({
      sort() {
        return this;
      },
      select() {
        return Promise.resolve({ _id: noticeA, createdAt: new Date('2026-09-07T18:00:00.000Z') });
      },
    }));

    const { res, state } = mockRes();
    await listVehicleNoticeAlerts(authReq(churchA), res);
    const body = state.body as {
      notices: unknown[];
      pendingCount: number;
      nextCursor: string;
      serverTime: Date;
      operationalService: boolean;
    };
    assert.equal(state.statusCode, 200);
    assert.deepEqual(body.notices, []);
    assert.equal(body.pendingCount, 3);
    assert.equal(body.nextCursor, encodeVehicleAlertCursor(new Date('2026-09-07T18:00:00.000Z'), String(noticeA)));
    assert.equal(body.operationalService, false);
    assert.equal(state.headers['Cache-Control'], 'private, no-store');
  });

  test('depois do cursor devolve só avisos novos pendentes da igreja', async () => {
    stubActiveServiceIdle();
    stubMethod(VehicleNotice, 'countDocuments', async () => 1);
    const createdAt = new Date('2026-09-07T20:15:30.000Z');
    let usedFilter: Record<string, unknown> = {};
    stubAlertQuery(
      [
        {
          _id: noticeA,
          plate: 'ABC-1D23',
          vehicleModel: 'Onix',
          requestedAction: 'remove_vehicle',
          otherDescription: '',
          status: 'pending',
          createdAt,
          updatedAt: createdAt,
          serviceId: new Types.ObjectId(),
        },
      ],
      (filter) => {
        usedFilter = filter;
      }
    );

    const { res, state } = mockRes();
    await listVehicleNoticeAlerts(
      authReq(churchA, {
        query: { after: encodeVehicleAlertCursor(new Date('2026-09-07T20:15:29.000Z'), String(noticeB)) },
      }),
      res
    );
    const body = state.body as { notices: Array<{ id: string; plate: string; serviceId?: string }> };
    assert.equal(String(usedFilter.churchId), String(churchA));
    assert.equal(usedFilter.status, 'pending');
    assert.equal(usedFilter.archived && (usedFilter.archived as { $ne: boolean }).$ne, true);
    assert.equal(body.notices[0]?.id, String(noticeA));
    assert.equal(body.notices[0]?.plate, 'ABC-1D23');
    assert.ok(body.notices[0]?.serviceId);
    assert.equal('plateNormalized' in (body.notices[0] || {}), false);
  });

  test('dois avisos no mesmo instante entram em ordem pelo id', async () => {
    stubActiveServiceIdle();
    stubMethod(VehicleNotice, 'countDocuments', async () => 2);
    const createdAt = new Date('2026-09-07T20:15:30.000Z');
    const first = new Types.ObjectId('68be00000000000000000001');
    const second = new Types.ObjectId('68be00000000000000000002');
    let usedFilter: Record<string, unknown> = {};
    stubAlertQuery(
      [
        {
          _id: first,
          plate: 'AAA-1A11',
          vehicleModel: 'Gol',
          requestedAction: 'turn_off_lights',
          status: 'pending',
          createdAt,
          updatedAt: createdAt,
        },
        {
          _id: second,
          plate: 'BBB-2B22',
          vehicleModel: 'Fox',
          requestedAction: 'remove_vehicle',
          status: 'pending',
          createdAt,
          updatedAt: createdAt,
        },
      ],
      (filter) => {
        usedFilter = filter;
      }
    );

    const { res, state } = mockRes();
    await listVehicleNoticeAlerts(
      authReq(churchA, {
        query: { after: encodeVehicleAlertCursor(createdAt, '68be00000000000000000000') },
      }),
      res
    );
    const body = state.body as { notices: Array<{ id: string }>; nextCursor: string };
    assert.deepEqual(
      body.notices.map((item) => item.id),
      [String(first), String(second)]
    );
    assert.equal(body.nextCursor, encodeVehicleAlertCursor(createdAt, String(second)));
    const sameInstant = (usedFilter.$or as Array<Record<string, unknown>>)[1];
    assert.ok(sameInstant?._id);
  });

  test('anunciados, resolvidos e arquivados ficam de fora da contagem', async () => {
    stubActiveServiceIdle();
    stubMethod(VehicleNotice, 'countDocuments', async (filter: Record<string, unknown>) => {
      assert.equal(filter.status, 'pending');
      assert.deepEqual(filter.archived, { $ne: true });
      return 0;
    });
    stubMethod(VehicleNotice, 'findOne', () => ({
      sort() {
        return this;
      },
      select() {
        return Promise.resolve(null);
      },
    }));
    const { res, state } = mockRes();
    await listVehicleNoticeAlerts(authReq(churchA), res);
    assert.equal((state.body as { pendingCount: number }).pendingCount, 0);
  });

  test('consulta de outra igreja não enxerga os avisos da primeira', async () => {
    stubActiveServiceIdle();
    stubMethod(VehicleNotice, 'countDocuments', async (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchB));
      return 0;
    });
    stubAlertQuery([], (filter) => {
      assert.equal(String(filter.churchId), String(churchB));
    });
    const { res, state } = mockRes();
    await listVehicleNoticeAlerts(
      authReq(churchB, {
        query: { after: encodeVehicleAlertCursor(new Date('2026-09-07T20:00:00.000Z'), String(noticeA)) },
      }),
      res
    );
    assert.deepEqual((state.body as { notices: unknown[] }).notices, []);
  });

  test('usuário sem permissão de leitura é recusado', async () => {
    const { res, state } = mockRes();
    requirePermission('vehicle_notices:read')(
      authReq(churchA, {}, permissionsForRole('intercession')),
      res,
      () => {
        assert.fail('não deveria autorizar');
      }
    );
    assert.equal(state.statusCode, 403);
    assert.deepEqual(state.body, { error: FORBIDDEN_ERROR });
  });

  test('alterar aviso de outra igreja responde 404', async () => {
    stubMethod(VehicleNotice, 'findOne', async (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchA));
      return null;
    });
    const { res, state } = mockRes();
    await updateVehicleNoticeStatus(
      authReq(churchA, {
        params: { id: String(noticeB) },
        body: { status: 'announced', updatedAt: '2026-09-07T12:00:00.000Z' },
      }),
      res
    );
    assert.equal(state.statusCode, 404);
  });

  test('resposta é limitada', async () => {
    stubActiveServiceIdle();
    stubMethod(VehicleNotice, 'countDocuments', async () => 40);
    let limit = 0;
    stubMethod(VehicleNotice, 'find', () => ({
      sort() {
        return this;
      },
      limit(value: number) {
        limit = value;
        return this;
      },
      select() {
        return Promise.resolve([]);
      },
    }));
    const { res } = mockRes();
    await listVehicleNoticeAlerts(
      authReq(churchA, {
        query: { after: encodeVehicleAlertCursor(new Date('2026-09-07T20:00:00.000Z'), String(noticeA)) },
      }),
      res
    );
    assert.equal(limit, VEHICLE_ALERTS_LIMIT);
  });

  test('cursor inválido é recusado', async () => {
    const { res, state } = mockRes();
    await listVehicleNoticeAlerts(authReq(churchA, { query: { after: 'ontem' } }), res);
    assert.equal(state.statusCode, 400);
  });
});
