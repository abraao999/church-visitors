import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { Types } from 'mongoose';
import {
  churchLogoPrefix,
  createMemoryLogoStore,
  discardUnusedLogos,
  setBrandingLogoStoreForTests,
} from './brandingLogoStore.js';

afterEach(() => {
  setBrandingLogoStoreForTests(null);
});

const churchA = new Types.ObjectId();
const churchB = new Types.ObjectId();

describe('remoção de logotipos sem uso', () => {
  test('o prefixo fica isolado por igreja e recusa identificador inválido', () => {
    assert.equal(churchLogoPrefix(String(churchA)), `church-branding/${churchA}/`);
    assert.equal(churchLogoPrefix('../outro'), null);
    assert.equal(churchLogoPrefix('church-branding/abc'), null);
  });

  test('apaga só os arquivos da igreja que deixaram de ser usados', async () => {
    const memory = createMemoryLogoStore();
    const keep = `church-branding/${churchA}/atual.png`;
    const unused = `church-branding/${churchA}/antiga.png`;
    const otherChurch = `church-branding/${churchB}/logo.png`;
    memory.files.set(keep, { url: `https://blob.test/${keep}`, deleted: false });
    memory.files.set(unused, { url: `https://blob.test/${unused}`, deleted: false });
    memory.files.set(otherChurch, { url: `https://blob.test/${otherChurch}`, deleted: false });

    await memory.deleteUnused(String(churchA), keep);

    assert.equal(memory.files.get(keep)?.deleted, false);
    assert.equal(memory.files.get(unused)?.deleted, true);
    assert.equal(memory.files.get(otherChurch)?.deleted, false);
  });

  test('sem logotipo atual remove todos os arquivos da igreja', async () => {
    const memory = createMemoryLogoStore();
    const first = `church-branding/${churchA}/um.png`;
    const second = `church-branding/${churchA}/dois.png`;
    memory.files.set(first, { url: `https://blob.test/${first}`, deleted: false });
    memory.files.set(second, { url: `https://blob.test/${second}`, deleted: false });

    await memory.deleteUnused(String(churchA));

    assert.equal(memory.files.get(first)?.deleted, true);
    assert.equal(memory.files.get(second)?.deleted, true);
  });

  test('descarta a chave anterior e os órfãos da mesma igreja', async () => {
    const memory = createMemoryLogoStore();
    setBrandingLogoStoreForTests(memory);
    const keep = `church-branding/${churchA}/nova.png`;
    const orphan = `church-branding/${churchA}/orfa.png`;
    memory.files.set(keep, { url: `https://blob.test/${keep}`, deleted: false });
    memory.files.set(orphan, { url: `https://blob.test/${orphan}`, deleted: false });
    memory.files.set('chave-antiga', { url: 'https://blob.test/old.png', deleted: false });

    await discardUnusedLogos(String(churchA), { keepKey: keep, previousKey: 'chave-antiga' });

    assert.equal(memory.files.get(keep)?.deleted, false);
    assert.equal(memory.files.get(orphan)?.deleted, true);
    assert.equal(memory.files.get('chave-antiga')?.deleted, true);
  });
});
