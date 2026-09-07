import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import servicesRouter from './services.js';
import { Church } from '../models/Church.js';
import { RecurrenceSeries } from '../models/RecurrenceSeries.js';
import { Service } from '../models/Service.js';
import { permissionsForRole } from '../utils/permissions.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

process.env.JWT_SECRET = 'teste-jwt-cultos-recorrentes-chave-longa-1234567890';
process.env.GUEST_ACCESS_SECRET = 'teste-guest-cultos-recorrentes-chave-longa-0987';

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
  const state: { statusCode: number; body: any } = { statusCode: 200, body: undefined };
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

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const ownerA = new Types.ObjectId();

function ownerReq(
  overrides: Record<string, unknown> = {},
  churchId = churchA
): AuthenticatedRequest {
  return {
    auth: {
      userId: String(ownerA),
      churchId: String(churchId),
      role: 'owner',
      name: 'Abraão',
      email: 'acscartorio@gmail.com',
      permissions: permissionsForRole('owner'),
    },
    query: {},
    params: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => unknown }>;
  };
};

function routeLayer(method: 'get' | 'post' | 'put' | 'delete', path: string) {
  const stack = (servicesRouter as unknown as { stack: Layer[] }).stack;
  const layer = stack.find((item) => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer?.route, `rota ${method.toUpperCase()} ${path} não encontrada`);
  return layer.route;
}

async function runRoute(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  req: AuthenticatedRequest
) {
  const route = routeLayer(method, path);
  const { res, state } = mockRes();
  await new Promise<void>((resolve, reject) => {
    const handlers = route.stack.map((item) => item.handle);
    const startAt = handlers.length > 1 ? 1 : 0;
    const runNext = (index: number) => {
      const handler = handlers[index];
      if (!handler) {
        resolve();
        return;
      }
      try {
        const maybe = handler(req, res, () => runNext(index + 1));
        if (maybe && typeof (maybe as Promise<unknown>).then === 'function') {
          (maybe as Promise<unknown>).then(() => resolve(), reject);
        }
      } catch (error) {
        reject(error);
      }
    };
    runNext(startAt);
  });
  return state;
}

function stubTimezone() {
  stubMethod(Church, 'findById', () => ({
    select: async () => ({ timezone: 'America/Sao_Paulo' }),
  }));
}

describe('cultos recorrentes e únicos', () => {
  test('cria um culto único com duração padrão', async () => {
    stubTimezone();
    stubMethod(Service, 'find', async () => []);
    let created: Record<string, unknown> | undefined;
    stubMethod(Service, 'create', async (doc: Record<string, unknown>) => {
      created = doc;
      return {
        ...doc,
        _id: new Types.ObjectId(),
        hymns: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const state = await runRoute(
      'post',
      '/',
      ownerReq({
        body: {
          title: 'Culto da noite',
          date: '2026-09-13',
          time: '19:00',
          durationMinutes: 120,
        },
      })
    );

    assert.equal(state.statusCode, 201);
    assert.equal(state.body.createdCount, 1);
    assert.equal(String(created?.churchId), String(churchA));
    assert.equal(created?.durationMinutes, 120);
    assert.ok(created?.scheduledStartAt);
  });

  test('cria série semanal e quinzenal com a data final', async () => {
    stubTimezone();
    stubMethod(Service, 'find', async () => []);
    const weeklyDates: Date[] = [];
    stubMethod(RecurrenceSeries, 'findOne', async () => null);
    stubMethod(RecurrenceSeries, 'create', async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: new Types.ObjectId(),
    }));
    stubMethod(RecurrenceSeries, 'deleteOne', async () => ({ deletedCount: 1 }));
    stubMethod(Service, 'deleteMany', async () => ({ deletedCount: 0 }));
    stubMethod(Service, 'insertMany', async (docs: Array<{ date: Date }>) => {
      weeklyDates.push(...docs.map((doc) => doc.date));
      return docs.map((doc) => ({
        ...doc,
        _id: new Types.ObjectId(),
        hymns: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        title: 'Culto da noite',
      }));
    });

    const weekly = await runRoute(
      'post',
      '/',
      ownerReq({
        body: {
          title: 'Culto da noite',
          date: '2026-09-13',
          time: '19:00',
          durationMinutes: 120,
          recurring: true,
          frequency: 'weekly',
          endDate: '2026-10-04',
        },
      })
    );
    assert.equal(weekly.statusCode, 201);
    assert.equal(weekly.body.createdCount, 4);
    assert.ok(weekly.body.seriesId);

    weeklyDates.length = 0;
    const biweekly = await runRoute(
      'post',
      '/',
      ownerReq({
        body: {
          title: 'Culto da noite',
          date: '2026-09-13',
          time: '19:00',
          durationMinutes: 120,
          recurring: true,
          frequency: 'biweekly',
          endDate: '2026-10-11',
        },
      })
    );
    assert.equal(biweekly.statusCode, 201);
    assert.equal(biweekly.body.createdCount, 3);
  });

  test('recusa data final além do limite', async () => {
    stubTimezone();
    const state = await runRoute(
      'post',
      '/',
      ownerReq({
        body: {
          title: 'Culto da noite',
          date: '2026-09-13',
          time: '19:00',
          recurring: true,
          frequency: 'weekly',
          endDate: '2028-09-13',
        },
      })
    );
    assert.equal(state.statusCode, 400);
    assert.match(String(state.body.error), /18 meses|máximo/);
  });

  test('impede sobreposição na mesma igreja e permite outra igreja no mesmo horário', async () => {
    stubTimezone();
    const existing = {
      _id: new Types.ObjectId(),
      churchId: churchA,
      title: 'Culto da manhã',
      date: new Date('2026-09-13T15:00:00.000Z'),
      time: '09:00',
      scheduledStartAt: new Date('2026-09-13T12:00:00.000Z'),
      durationMinutes: 120,
      activationLeadMinutes: 30,
    };
    stubMethod(Service, 'find', async (filter: Record<string, unknown>) => {
      return String(filter.churchId) === String(churchA) ? [existing] : [];
    });
    stubMethod(Service, 'create', async () => {
      throw new Error('não deveria criar na igreja A');
    });

    const conflict = await runRoute(
      'post',
      '/',
      ownerReq({
        body: {
          title: 'Ensaio',
          date: '2026-09-13',
          time: '10:00',
          durationMinutes: 120,
        },
      })
    );
    assert.equal(conflict.statusCode, 409);
    assert.match(String(conflict.body.error), /Culto da manhã/);

    stubMethod(Service, 'create', async (doc: Record<string, unknown>) => ({
      ...doc,
      _id: new Types.ObjectId(),
      hymns: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const otherChurch = await runRoute(
      'post',
      '/',
      ownerReq(
        {
          body: {
            title: 'Culto da noite',
            date: '2026-09-13',
            time: '10:00',
            durationMinutes: 120,
          },
        },
        churchB
      )
    );
    assert.equal(otherChurch.statusCode, 201);
  });

  test('alteração somente desta ocorrência não mexe nas outras', async () => {
    stubTimezone();
    const seriesId = new Types.ObjectId();
    const selectedId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    const selected = {
      _id: selectedId,
      churchId: churchA,
      title: 'Culto da noite',
      date: new Date('2026-09-20T15:00:00.000Z'),
      time: '19:00',
      durationMinutes: 120,
      recurrenceSeriesId: seriesId,
      updatedAt: new Date('2026-09-01T12:00:00.000Z'),
      hymns: [],
      async save() {
        return this;
      },
    };
    stubMethod(Service, 'findOne', async () => selected);
    stubMethod(Service, 'find', async () => []);
    const otherSaved: string[] = [];
    stubMethod(Service, 'countDocuments', async () => 1);

    const state = await runRoute(
      'put',
      '/:id',
      ownerReq({
        params: { id: String(selectedId) },
        body: {
          title: 'Culto especial',
          date: '2026-09-20',
          time: '19:30',
          durationMinutes: 90,
          hymns: [],
          updatedAt: '2026-09-01T12:00:00.000Z',
          editScope: 'this',
        },
      })
    );
    assert.equal(state.statusCode, 200);
    assert.equal(selected.title, 'Culto especial');
    assert.equal(otherSaved.length, 0);
    assert.equal(String(otherId), String(otherId));
  });

  test('este e os próximos preserva cultos anteriores numa série separada', async () => {
    stubTimezone();
    const seriesId = new Types.ObjectId();
    const selectedId = new Types.ObjectId();
    const previousId = new Types.ObjectId();
    const laterId = new Types.ObjectId();
    const updatedAt = new Date('2026-09-01T12:00:00.000Z');
    const savedTitles: string[] = [];
    const later = {
      _id: laterId,
      churchId: churchA,
      title: 'Culto da noite',
      date: new Date('2026-09-27T15:00:00.000Z'),
      time: '19:00',
      durationMinutes: 120,
      recurrenceSeriesId: seriesId,
      hymns: [],
      equals(id: Types.ObjectId) {
        return String(this._id) === String(id);
      },
      async save() {
        savedTitles.push(this.title);
        return this;
      },
    };
    const selected = {
      _id: selectedId,
      churchId: churchA,
      title: 'Culto da noite',
      date: new Date('2026-09-20T15:00:00.000Z'),
      time: '19:00',
      durationMinutes: 120,
      scheduledStartAt: new Date('2026-09-20T22:00:00.000Z'),
      recurrenceSeriesId: seriesId,
      updatedAt,
      hymns: [],
      equals(id: Types.ObjectId) {
        return String(this._id) === String(id);
      },
      async save() {
        savedTitles.push(this.title);
        return this;
      },
    };
    const series = {
      _id: seriesId,
      churchId: churchA,
      title: 'Culto da noite',
      frequency: 'weekly',
      weekday: 0,
      startDate: new Date('2026-09-13T15:00:00.000Z'),
      endDate: new Date('2026-12-31T15:00:00.000Z'),
      time: '19:00',
      durationMinutes: 120,
      createdBy: undefined,
      async save() {
        return this;
      },
    };
    stubMethod(Service, 'findOne', async () => selected);
    stubMethod(Service, 'find', (filter: Record<string, unknown>) => {
      const rows = filter.recurrenceSeriesId ? [selected, later] : [];
      const chain = {
        sort: async () => rows,
        then: (resolve: (value: unknown[]) => void) => resolve(rows),
      };
      return chain;
    });
    stubMethod(Service, 'countDocuments', async () => 1);
    stubMethod(RecurrenceSeries, 'findOne', async () => series);
    let createdSeries: Record<string, unknown> | undefined;
    stubMethod(RecurrenceSeries, 'create', async (doc: Record<string, unknown>) => {
      createdSeries = doc;
      return { ...doc, _id: new Types.ObjectId() };
    });

    const state = await runRoute(
      'put',
      '/:id',
      ownerReq({
        params: { id: String(selectedId) },
        body: {
          title: 'Culto da noite atualizado',
          date: '2026-09-20',
          time: '19:30',
          durationMinutes: 90,
          hymns: [],
          updatedAt: updatedAt.toISOString(),
          editScope: 'thisAndFuture',
        },
      })
    );

    assert.equal(state.statusCode, 200, JSON.stringify(state.body));
    assert.ok(createdSeries);
    assert.equal(createdSeries?.title, 'Culto da noite atualizado');
    assert.equal(savedTitles.includes('Culto da noite atualizado'), true);
    assert.equal(String(previousId), String(previousId));
  });

  test('cancela uma ocorrência sem apagar a série', async () => {
    stubTimezone();
    const seriesId = new Types.ObjectId();
    const service = {
      _id: new Types.ObjectId(),
      churchId: churchA,
      title: 'Culto da noite',
      date: new Date('2026-09-20T15:00:00.000Z'),
      time: '19:00',
      recurrenceSeriesId: seriesId,
      cancelledAt: undefined as Date | undefined,
      async save() {
        return this;
      },
    };
    stubMethod(Service, 'findOne', async () => service);
    const state = await runRoute(
      'post',
      '/:id/cancel',
      ownerReq({ params: { id: String(service._id) } })
    );
    assert.equal(state.statusCode, 200);
    assert.equal(state.body.status, 'cancelled');
    assert.ok(service.cancelledAt);
  });
});
