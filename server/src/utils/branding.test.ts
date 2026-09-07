import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  contrastRatio,
  detectLogoImageType,
  parseHexColor,
  publicAccessMetadata,
  publicChurchBranding,
  PUBLIC_BRANDING_KEYS,
  readableOnColor,
  rejectsClientChurchId,
  validateBrandColor,
} from './branding.js';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

describe('cores da identidade visual', () => {
  test('aceita somente hexadecimal #RRGGBB e rejeita inválidas', () => {
    assert.equal(parseHexColor('#2563eb'), '#2563EB');
    assert.equal(parseHexColor('#FFF'), null);
    assert.equal(parseHexColor('2563eb'), null);
    assert.equal(parseHexColor('#GGGGGG'), null);
    const valid = validateBrandColor('#2563EB');
    assert.equal('hex' in valid && valid.hex, '#2563EB');
    const short = validateBrandColor('#12');
    assert.equal('error' in short, true);
    assert.match('error' in short ? short.error : '', /hexadecimal/i);
    const named = validateBrandColor('azul');
    assert.match('error' in named ? named.error : '', /hexadecimal/i);
  });

  test('rejeita cor sem contraste suficiente para texto no botão', () => {
    const rejected = validateBrandColor('#777777');
    assert.equal('hex' in rejected, false);
    assert.match('error' in rejected ? rejected.error : '', /contraste/i);
    assert.equal(readableOnColor('#2563EB'), '#FFFFFF');
    assert.ok(contrastRatio('#2563EB', '#FFFFFF') >= 4.5);
  });

  test('igreja antiga sem branding devolve só o nome padrão', () => {
    assert.deepEqual(publicChurchBranding({ name: 'Igreja Esperança' }), {
      name: 'Igreja Esperança',
    });
  });
});

describe('campos públicos e churchId do cliente', () => {
  test('a resposta pública não inclui dados internos', () => {
    const publicFields = publicChurchBranding({
      name: 'Igreja Alfa',
      branding: {
        logoUrl: 'https://blob.test/logo.png',
        primaryColor: '#112233',
        accentColor: '#AABBCC',
        logoStorageKey: 'secret-key',
        address: 'Rua A',
      } as never,
    });
    assert.deepEqual(Object.keys(publicFields).sort(), [...PUBLIC_BRANDING_KEYS].sort());
    assert.equal('logoStorageKey' in publicFields, false);
    assert.equal('address' in publicFields, false);
    assert.equal('churchId' in publicFields, false);
  });

  test('acesso público recebe somente nome, logotipo e cores', () => {
    const payload = publicAccessMetadata({
      churchName: 'Igreja Alfa',
      accessName: 'Portaria',
      scope: 'visitors:create',
      scopes: ['visitors:create'],
      logoUrl: 'https://blob.test/logo.png',
      primaryColor: '#2563EB',
      accentColor: '#B45309',
    });
    assert.deepEqual(Object.keys(payload).sort(), [
      'accessName',
      'accentColor',
      'churchName',
      'logoUrl',
      'primaryColor',
      'type',
      'types',
      'valid',
    ].sort());
    assert.equal('churchId' in payload, false);
    assert.equal('address' in payload, false);
    assert.equal('phone' in payload, false);
    assert.equal('logoStorageKey' in payload, false);
  });

  test('churchId enviado pelo cliente é detectado para recusa', () => {
    assert.equal(rejectsClientChurchId({ churchId: 'abc' }), true);
    assert.equal(rejectsClientChurchId({ primaryColor: '#2563EB' }), false);
  });
});

describe('arquivo do logotipo', () => {
  test('reconhece PNG, JPEG e WebP reais e rejeita SVG', () => {
    assert.equal(detectLogoImageType(PNG), 'image/png');
    assert.equal(detectLogoImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x00])), 'image/jpeg');
    assert.equal(
      detectLogoImageType(Buffer.from('RIFF....WEBP', 'ascii')),
      'image/webp'
    );
    assert.equal(detectLogoImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(detectLogoImageType(Buffer.from('<?xml version="1.0"?><svg></svg>')), null);
    assert.equal(detectLogoImageType(Buffer.from('not-an-image')), null);
  });
});
