import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import type { Response } from 'express';
import { Types } from 'mongoose';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { Church } from '../models/Church.js';
import { FollowUpContact } from '../models/FollowUpContact.js';
import { User } from '../models/User.js';
import { Visitor } from '../models/Visitor.js';
import { VisitorFollowUp } from '../models/VisitorFollowUp.js';
import { createVisitors } from './visitors.js';
import {
  createFollowUp,
  createFollowUpContact,
  listFollowUps,
  patchFollowUp,
} from './visitorFollowUp.js';
import { createPublicVisitors } from './publicAccess.js';
import type { GuestAccessRequest } from '../middleware/guestAccess.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { Service } from '../models/Service.js';
import { FAMILY_CITY_ERROR } from '../utils/familyCity.js';
import { FOLLOW_UP_DISABLED_ERROR } from '../utils/visitorFollowUp.js';
import { permissionsForRole } from '../utils/permissions.js';

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();
const userA = new Types.ObjectId();
const visitorA = new Types.ObjectId();
const visitorB = new Types.ObjectId();
const followUpA = new Types.ObjectId();

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

function stubEnabledChurch(churchId: Types.ObjectId, enabled: boolean) {
  stubMethod(Church, 'findById', (id: unknown) => ({
    select: async () =>
      String(id) === String(churchId)
        ? { visitorFollowUpEnabled: enabled, timezone: 'America/Sao_Paulo', active: true }
        : null,
  }));
}

function stubPublicVisitorWrite() {
  stubMethod(Service, 'find', async () => []);
  stubMethod(Service, 'updateOne', async () => ({ modifiedCount: 0 }));
  stubMethod(GuestAccess, 'updateOne', async () => ({ modifiedCount: 0 }));
  stubMethod(Church, 'findById', () => ({
    select: async () => ({ timezone: 'America/Sao_Paulo', visitorFollowUpEnabled: true, active: true }),
  }));
}

describe('acompanhamento isolado por igreja', () => {
  test('igreja com a função desativada não lista acompanhamentos', async () => {
    stubEnabledChurch(churchA, false);
    const { res, state } = mockRes();
    await listFollowUps(authReq(churchA), res);
    assert.equal(state.statusCode, 403);
    assert.deepEqual(state.body, { error: FOLLOW_UP_DISABLED_ERROR });
  });

  test('listagem sempre filtra pela igreja da sessão', async () => {
    stubEnabledChurch(churchA, true);
    let received: Record<string, unknown> | undefined;
    stubMethod(VisitorFollowUp, 'find', (filter: Record<string, unknown>) => {
      received = filter;
      return {
        sort() {
          return [];
        },
      };
    });
    stubMethod(VisitorFollowUp, 'countDocuments', async () => 0);
    const { res, state } = mockRes();
    await listFollowUps(authReq(churchA), res);
    assert.equal(state.statusCode, 200);
    assert.equal(String(received?.churchId), String(churchA));
    assert.notEqual(String(received?.churchId), String(churchB));
  });

  test('criação recusa visitante de outra igreja', async () => {
    stubEnabledChurch(churchA, true);
    stubMethod(Visitor, 'findOne', (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchA));
      return {
        select: async () => null,
      };
    });
    const { res, state } = mockRes();
    await createFollowUp(
      authReq(churchA, { body: { visitorId: String(visitorB), phone: '44999990000' } }),
      res
    );
    assert.equal(state.statusCode, 404);
  });

  test('cadastro com acompanhamento cria o registro na mesma igreja', async () => {
    stubEnabledChurch(churchA, true);
    const visitor = {
      _id: visitorA,
      name: 'Maria',
      city: 'Umuarama',
      visitDate: new Date('2026-09-08T12:00:00.000Z'),
      anonymizedAt: undefined,
    };
    stubMethod(Visitor, 'findOne', (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchA));
      return {
        select: async () => visitor,
      };
    });
    stubMethod(VisitorFollowUp, 'findOne', () => ({
      select: async () => null,
    }));
    let created: Record<string, unknown> | undefined;
    stubMethod(VisitorFollowUp, 'create', async (doc: Record<string, unknown>) => {
      created = doc;
      return { ...doc, _id: followUpA };
    });

    const { res, state } = mockRes();
    await createFollowUp(
      authReq(churchA, {
        body: { visitorId: String(visitorA), phone: '44999990000', firstContact: 'tomorrow' },
      }),
      res
    );
    assert.equal(state.statusCode, 201);
    assert.equal(String(created?.churchId), String(churchA));
    assert.equal(created?.phone, '44999990000');
  });

  test('histórico de contato fica preso à igreja e ao acompanhamento', async () => {
    stubEnabledChurch(churchA, true);
    stubMethod(VisitorFollowUp, 'findOne', async (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchA));
      return {
        _id: followUpA,
        churchId: churchA,
        visitorId: visitorA,
        status: 'awaiting',
        save: async () => undefined,
      };
    });
    let contactDoc: Record<string, unknown> | undefined;
    stubMethod(FollowUpContact, 'create', async (doc: Record<string, unknown>) => {
      contactDoc = doc;
      return { ...doc, _id: new Types.ObjectId(), createdAt: new Date() };
    });
    const { res, state } = mockRes();
    await createFollowUpContact(
      authReq(churchA, {
        params: { id: String(followUpA) },
        body: {
          type: 'whatsapp',
          result: 'Conversou com a família',
          status: 'contacted',
        },
      }),
      res
    );
    assert.equal(state.statusCode, 201);
    assert.equal(String(contactDoc?.churchId), String(churchA));
    assert.equal(String(contactDoc?.visitorId), String(visitorA));
  });

  test('usuário sem permissão de criar não inclui acompanhamento no cadastro', async () => {
    const req = authReq(churchA, {
      body: {
        visitors: [{ name: 'João', city: 'Umuarama', relationship: 'outro', followUp: { include: true } }],
      },
    });
    req.auth!.permissions = permissionsForRole('intercession');
    stubMethod(Visitor, 'insertMany', async () => {
      throw new Error('não deveria criar visitante neste teste de permissão');
    });
    const { res, state } = mockRes();
    await createVisitors(req, res);
    assert.equal(state.statusCode, 403);
  });

  test('cadastro interno recusa cidades diferentes na mesma família', async () => {
    stubMethod(Visitor, 'insertMany', async () => {
      throw new Error('não deveria criar visitantes com cidades diferentes');
    });
    const { res, state } = mockRes();
    await createVisitors(
      authReq(churchA, {
        body: {
          visitors: [
            { name: 'João', city: 'Umuarama', relationship: 'outro', visitKind: 'first' },
            { name: 'Maria', city: 'Maria Helena', relationship: 'outro', visitKind: 'first' },
          ],
        },
      }),
      res
    );
    assert.equal(state.statusCode, 400);
    assert.deepEqual(state.body, { error: FAMILY_CITY_ERROR });
  });

  test('token público não troca de igreja nem aceita responsável interno', async () => {
    stubPublicVisitorWrite();
    let createdFollowUp = 0;
    stubMethod(Visitor, 'exists', async () => null);
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) => {
      assert.equal(String(docs[0]?.churchId), String(churchA));
      return docs.map((doc) => ({ ...doc, _id: new Types.ObjectId() }));
    });
    stubMethod(VisitorFollowUp, 'create', async () => {
      createdFollowUp += 1;
      return { _id: followUpA };
    });
    const { res, state } = mockRes();
    await createPublicVisitors(
      {
        body: {
          churchId: String(churchB),
          visitors: [{ name: 'João', city: 'Umuarama', relationship: 'outro' }],
          contactConsent: true,
          phone: '44988887777',
          assignedToId: String(userA),
        },
        guestAccess: {
          churchId: String(churchA),
          churchName: 'Alfa',
          guestAccessId: String(new Types.ObjectId()),
          accessName: 'Portaria',
          scope: 'visitors:create',
          scopes: ['visitors:create'],
          visitorFollowUpEnabled: true,
          timezone: 'America/Sao_Paulo',
        },
      } as unknown as GuestAccessRequest,
      res
    );
    assert.equal(state.statusCode, 400);
    assert.equal(createdFollowUp, 0);
  });

  test('cadastro público sem consentimento não cria acompanhamento', async () => {
    stubPublicVisitorWrite();
    let createdFollowUp = 0;
    stubMethod(Visitor, 'exists', async () => null);
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) =>
      docs.map((doc) => ({ ...doc, _id: new Types.ObjectId() }))
    );
    stubMethod(VisitorFollowUp, 'create', async () => {
      createdFollowUp += 1;
    });
    const { res, state } = mockRes();
    await createPublicVisitors(
      {
        body: {
          visitors: [{ name: 'João', city: 'Umuarama', relationship: 'outro' }],
        },
        guestAccess: {
          churchId: String(churchA),
          churchName: 'Alfa',
          guestAccessId: String(new Types.ObjectId()),
          accessName: 'Portaria',
          scope: 'visitors:create',
          scopes: ['visitors:create'],
          visitorFollowUpEnabled: true,
          timezone: 'America/Sao_Paulo',
        },
      } as unknown as GuestAccessRequest,
      res
    );
    assert.equal(state.statusCode, 201);
    assert.equal(createdFollowUp, 0);
  });

  test('família no acesso público compartilha um telefone e um consentimento', async () => {
    stubPublicVisitorWrite();
    const phones: string[] = [];
    stubMethod(Visitor, 'exists', async () => null);
    stubMethod(Visitor, 'insertMany', async (docs: Array<Record<string, unknown>>) =>
      docs.map((doc) => ({ ...doc, _id: new Types.ObjectId() }))
    );
    stubMethod(Visitor, 'findOne', () => ({
      select: async () => ({ _id: new Types.ObjectId(), name: 'João' }),
    }));
    stubMethod(VisitorFollowUp, 'findOne', () => ({
      select: async () => null,
    }));
    stubMethod(VisitorFollowUp, 'create', async (doc: Record<string, unknown>) => {
      phones.push(String(doc.phone || ''));
      return { _id: new Types.ObjectId() };
    });
    const { res, state } = mockRes();
    await createPublicVisitors(
      {
        body: {
          visitors: [
            { name: 'João', city: 'Umuarama', relationship: 'outro' },
            { name: 'Maria', city: 'Umuarama', relationship: 'esposa' },
          ],
          contactConsent: true,
          phone: '44988887777',
        },
        guestAccess: {
          churchId: String(churchA),
          churchName: 'Alfa',
          guestAccessId: String(new Types.ObjectId()),
          accessName: 'Portaria',
          scope: 'visitors:create',
          scopes: ['visitors:create'],
          visitorFollowUpEnabled: true,
          timezone: 'America/Sao_Paulo',
        },
      } as unknown as GuestAccessRequest,
      res
    );
    assert.equal(state.statusCode, 201);
    assert.deepEqual(phones, ['44988887777', '44988887777']);
  });

  test('intercessão pode assumir o responsável do acompanhamento', async () => {
    stubEnabledChurch(churchA, true);
    const item = {
      _id: followUpA,
      churchId: churchA,
      visitorId: visitorA,
      status: 'awaiting',
      assignedTo: undefined as Types.ObjectId | undefined,
      assignedToName: '',
      anonymizedAt: undefined,
      save: async () => undefined,
    };
    stubMethod(VisitorFollowUp, 'findOne', async (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchA));
      return item;
    });
    stubMethod(User, 'findOne', (filter: Record<string, unknown>) => {
      assert.equal(String(filter.churchId), String(churchA));
      assert.equal(filter.role, 'intercession');
      return {
        select: async () => ({ _id: userA, name: 'Lia' }),
      };
    });
    stubMethod(Visitor, 'findOne', () => ({
      select: async () => ({ _id: visitorA, name: 'Maria', city: 'Umuarama' }),
    }));
    const req = authReq(churchA, {
      params: { id: String(followUpA) },
      body: { assignedToId: String(userA) },
    });
    req.auth!.role = 'intercession';
    req.auth!.permissions = permissionsForRole('intercession');
    const { res, state } = mockRes();
    await patchFollowUp(req, res);
    assert.equal(state.statusCode, 200);
    assert.equal(String(item.assignedTo), String(userA));
    assert.equal(item.assignedToName, 'Lia');
  });
});
