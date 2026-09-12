import 'dotenv/config';
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { connectDB } from '../config/db.js';
import { PlatformAdmin } from '../models/PlatformAdmin.js';
import { getPlatformAdminJwtSecret } from '../middleware/platformAdminAuth.js';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD = 8;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value: string): boolean {
  return value.length >= MIN_PASSWORD && /[A-Za-z]/.test(value) && /\d/.test(value);
}

async function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    output.write(prompt);
    input.setRawMode?.(true);
    input.resume();
    input.setEncoding('utf8');
    let value = '';
    const finish = (result: string) => {
      input.removeListener('data', onData);
      input.setRawMode?.(Boolean(wasRaw));
      input.pause();
      output.write('\n');
      resolve(result);
    };
    const onData = (chunk: string) => {
      if (chunk === '\u0003') {
        input.removeListener('data', onData);
        input.setRawMode?.(Boolean(wasRaw));
        reject(new Error('cancelado'));
        return;
      }
      if (chunk === '\n' || chunk === '\r') {
        finish(value);
        return;
      }
      if (chunk === '\u007f' || chunk === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += chunk;
    };
    input.on('data', onData);
  });
}

async function main() {
  getPlatformAdminJwtSecret();
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/church-visitors';
  await connectDB(uri);

  const rl = readline.createInterface({ input, output });
  try {
    const name = (await rl.question('Nome: ')).trim();
    const email = (await rl.question('E-mail: ')).trim().toLowerCase();
    rl.pause();
    const password = await readHidden('Senha: ');
    const confirm = await readHidden('Confirme a senha: ');

    if (!name || !isValidEmail(email)) {
      console.error('Informe um nome e um e-mail válido.');
      process.exitCode = 1;
      return;
    }
    if (password !== confirm) {
      console.error('A confirmação não coincide com a senha.');
      process.exitCode = 1;
      return;
    }
    if (!isStrongPassword(password)) {
      console.error('A senha deve ter ao menos 8 caracteres, com letra e número.');
      process.exitCode = 1;
      return;
    }

    const existing = await PlatformAdmin.findOne({ email }, '_id');
    if (existing) {
      console.error('Já existe um administrador com este e-mail.');
      process.exitCode = 1;
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const now = new Date();
    await PlatformAdmin.create({
      name,
      email,
      passwordHash,
      role: 'platform_owner',
      active: true,
      emailVerifiedAt: now,
      tokenVersion: 0,
    });
    console.log(`Administrador ${email} criado como platform_owner.`);
  } finally {
    rl.close();
    process.exit();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'falha';
  if (message !== 'cancelado') {
    console.error('Não foi possível criar o administrador.');
  }
  process.exit(1);
});
