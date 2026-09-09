import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { Church } from '../models/Church.js';
import { FollowUpContact } from '../models/FollowUpContact.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { PublicAccessEvent } from '../models/PublicAccessEvent.js';
import { ReportDailySummary } from '../models/ReportDailySummary.js';
import { ReportExportAudit } from '../models/ReportExportAudit.js';
import { Service } from '../models/Service.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { VisitorFollowUp } from '../models/VisitorFollowUp.js';
import { permissionsForRole } from '../utils/permissions.js';
import {
  createReportExport,
  getReportsOverview,
  getReportsService,
} from './reports.js';
import { createPublicAccessEvent } from './publicAccess.js';
import type { GuestAccessRequest } from '../middleware/guestAccess.js';
import { aggregateVisitors } from '../services/reports.js';
import { compareCounts, previousEquivalentRange, resolveReportRange } from '../utils/reportRange.js';
import { eventTime } from '../utils/reportRange.js';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const userA = new Types.ObjectId();
const serviceA = new Types.ObjectId();
const serviceB = new Types.ObjectId();

type Stub = { restore: () => void };
const stubs: Stub[] = [];

function stubMethod(target: object, method: string, implementation: unknown): void {
  const original = (target as Record<string, unknown>)[method];
  (target as Record<string, unknown>)[method] = implementation;
  stubs.push({
    restore() {
      (target as Record<string, unknown>)[method] = original;
    },
  });
}

afterEach(() => {
  while (stubs.length) stubs.pop()?.restore();
});

function authReq(
  churchId: Types.ObjectId,
  extras: Partial<AuthenticatedRequest> = {}
): AuthenticatedRequest {
  return {
    auth: {
      userId: String(userA),
      churchId: String(churchId),
      role: 'admin',
      name: 'Ana',
      email: 'ana@example.com',
      permissions: permissionsForRole('admin'),
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
    send(payload: unknown) {
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

function stubReportReads(churchId: Types.ObjectId) {
  stubMethod(Church, 'findById', (id: unknown) => ({
    select: async () =>
      String(id) === String(churchId)
        ? { timezone: 'America/Sao_Paulo', name: 'Igreja A', visitorFollowUpEnabled: true, branding: { primaryColor: '#123456' } }
        : { timezone: 'America/Sao_Paulo', name: 'Outra', visitorFollowUpEnabled: false },
  }));
  stubMethod(Visitor, 'find', (filter: Record<string, unknown>) => ({
    select() {
      return {
        lean: async () => {
          if (String(filter.churchId) !== String(churchId)) return [];
          return [
            {
              city: 'Umuarama',
              source: 'owner',
              visitDate: new Date('2026-09-06T15:00:00.000Z'),
              createdAt: new Date('2026-09-06T15:00:00.000Z'),
              visitKind: 'unknown',
              serviceId: serviceA,
            },
          ];
        },
      };
    },
  }));
  stubMethod(PrayerRequest, 'find', (filter: Record<string, unknown>) => ({
    select() {
      return {
        lean: async () => (String(filter.churchId) === String(churchId) ? [] : []),
      };
    },
  }));
  stubMethod(VehicleNotice, 'find', (filter: Record<string, unknown>) => ({
    select() {
      return {
        lean: async () => (String(filter.churchId) === String(churchId) ? [] : []),
      };
    },
  }));
  stubMethod(Service, 'find', (filter: Record<string, unknown>) => ({
    select() {
      return {
        lean: async () => (String(filter.churchId) === String(churchId) ? [{ _id: serviceA, title: 'Culto' }] : []),
      };
    },
  }));
  stubMethod(Service, 'exists', async (filter: Record<string, unknown>) =>
    String(filter.churchId) === String(churchId) && String(filter._id) === String(serviceA)
  );
  stubMethod(Service, 'findOne', (filter: Record<string, unknown>) => ({
    lean: async () =>
      String(filter.churchId) === String(churchId) && String(filter._id) === String(serviceA)
        ? { _id: serviceA, title: 'Culto da noite', time: '19:00', hymns: [] }
        : null,
  }));
  stubMethod(ReportDailySummary, 'find', () => ({
    select() {
      return { lean: async () => [] };
    },
    lean: async () => [],
  }));
  stubMethod(VisitorFollowUp, 'countDocuments', async () => 0);
  stubMethod(VisitorFollowUp, 'find', () => ({
    select() {
      return { lean: async () => [] };
    },
    lean: async () => [],
  }));
  stubMethod(FollowUpContact, 'countDocuments', async () => 0);
  stubMethod(FollowUpContact, 'find', () => ({
    sort() {
      return { lean: async () => [] };
    },
  }));
  stubMethod(GuestAccess, 'find', () => ({
    select() {
      return { lean: async () => [] };
    },
  }));
  stubMethod(PublicAccessEvent, 'find', () => ({
    select() {
      return { lean: async () => [] };
    },
  }));
}

describe('relatórios isolados por igreja', () => {
  test('visão geral sempre filtra pela igreja da sessão', async () => {
    let seen: Record<string, unknown> | undefined;
    stubReportReads(churchA);
    stubMethod(Visitor, 'find', (filter: Record<string, unknown>) => {
      seen = filter;
      return { select: () => ({ lean: async () => [] }) };
    });
    const { res, state } = mockRes();
    await getReportsOverview(authReq(churchA, { query: { preset: 'this_month' } }), res);
    assert.equal(state.statusCode, 200);
    assert.equal(String(seen?.churchId), String(churchA));
    assert.notEqual(String(seen?.churchId), String(churchB));
  });

  test('usuário sem reports:read é bloqueado pelo middleware de permissão', () => {
    assert.equal(permissionsForRole('portaria').includes('reports:read'), false);
    assert.equal(permissionsForRole('admin').includes('reports:read'), true);
    assert.equal(permissionsForRole('owner').includes('reports:export_sensitive'), true);
  });

  test('culto de outra igreja retorna não encontrado', async () => {
    stubReportReads(churchA);
    const { res, state } = mockRes();
    await getReportsService(
      authReq(churchA, {
        params: { serviceId: String(serviceB) },
        query: { preset: 'this_month' },
      }),
      res
    );
    assert.equal(state.statusCode, 404);
  });

  test('exportação sem reports:export é recusada', async () => {
    stubReportReads(churchA);
    const { res, state } = mockRes();
    await createReportExport(
      authReq(churchA, {
        auth: {
          userId: String(userA),
          churchId: String(churchA),
          role: 'portaria',
          name: 'Portaria',
          email: 'p@example.com',
          permissions: ['reports:read'],
        },
        body: { format: 'pdf', preset: 'this_month' },
      }),
      res
    );
    assert.equal(state.statusCode, 403);
  });

  test('lista de acompanhamento exige permissão sensível e só inclui consentimento verdadeiro', async () => {
    stubReportReads(churchA);
    const { res, state } = mockRes();
    await createReportExport(
      authReq(churchA, {
        auth: {
          userId: String(userA),
          churchId: String(churchA),
          role: 'admin',
          name: 'Ana',
          email: 'ana@example.com',
          permissions: ['reports:read', 'reports:export'],
        },
        body: { format: 'follow_up_list', preset: 'this_month' },
      }),
      res
    );
    assert.equal(state.statusCode, 403);

    let followFilter: Record<string, unknown> | undefined;
    stubMethod(VisitorFollowUp, 'find', (filter: Record<string, unknown>) => {
      followFilter = filter;
      return { lean: async () => [] };
    });
    stubMethod(ReportExportAudit, 'create', async () => ({}));
    const allowed = mockRes();
    await createReportExport(
      authReq(churchA, {
        body: { format: 'follow_up_list', preset: 'this_month' },
      }),
      allowed.res
    );
    assert.equal(allowed.state.statusCode, 200);
    assert.equal(followFilter?.consent, true);
    assert.deepEqual(followFilter?.anonymizedAt, { $exists: false });
    assert.equal(String(followFilter?.churchId), String(churchA));
  });
});

describe('regras dos relatórios', () => {
  test('registros antigos sem visitKind aparecem como não informado', () => {
    const aggregated = aggregateVisitors(
      [{ city: 'Umuarama', visitDate: new Date('2026-01-01T12:00:00Z') }],
      [],
      'America/Sao_Paulo'
    );
    assert.equal(aggregated.unknown, 1);
    assert.equal(aggregated.first, 0);
  });

  test('avisos offline usam capturedAt para o horário', () => {
    const when = eventTime({
      capturedAt: new Date('2026-09-07T22:30:00.000Z'),
      createdAt: new Date('2026-09-08T03:00:00.000Z'),
    });
    assert.equal(when.toISOString(), '2026-09-07T22:30:00.000Z');
  });

  test('comparação entre períodos equivalentes não inventa porcentagem', () => {
    const current = resolveReportRange({
      preset: 'custom',
      from: '2026-09-01',
      to: '2026-09-07',
      timeZone: 'America/Sao_Paulo',
    });
    assert.ok(current.range);
    const previous = previousEquivalentRange(current.range, 'America/Sao_Paulo');
    assert.equal(previous.to.getTime() + 1, current.range.from.getTime());
    assert.equal(compareCounts(8, 0).percent, null);
  });

  test('evento de QR Code não aceita churchId do cliente e não guarda dados pessoais', async () => {
    const created: Record<string, unknown>[] = [];
    stubMethod(PublicAccessEvent, 'create', async (doc: Record<string, unknown>) => {
      created.push(doc);
      return doc;
    });
    const { res, state } = mockRes();
    await createPublicAccessEvent(
      {
        guestAccess: {
          churchId: String(churchA),
          guestAccessId: String(serviceA),
          accessName: 'Portaria',
          scope: 'visitors:create',
        },
        body: {
          type: 'opened',
          channel: 'qr',
          name: 'Maria',
          phone: '44999999999',
          churchId: String(churchB),
        },
        query: { origem: 'qr' },
      } as unknown as GuestAccessRequest,
      res
    );
    assert.equal(state.statusCode, 400);
    assert.equal(created.length, 0);

    const ok = mockRes();
    await createPublicAccessEvent(
      {
        guestAccess: {
          churchId: String(churchA),
          guestAccessId: String(serviceA),
          accessName: 'Portaria',
          scope: 'visitors:create',
        },
        body: { type: 'opened', channel: 'qr' },
        query: { origem: 'qr' },
      } as unknown as GuestAccessRequest,
      ok.res
    );
    assert.equal(ok.state.statusCode, 201);
    assert.equal(created.length, 1);
    assert.equal(String(created[0]?.churchId), String(churchA));
    assert.equal(created[0]?.type, 'opened');
    assert.equal(created[0]?.channel, 'qr');
    assert.equal('name' in (created[0] || {}), false);
    assert.equal('phone' in (created[0] || {}), false);
    assert.equal('ip' in (created[0] || {}), false);
  });
});
