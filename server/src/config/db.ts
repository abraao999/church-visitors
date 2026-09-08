import dns from 'dns';
import mongoose from 'mongoose';
import { ensureRequestIdUniqueIndexes } from '../models/requestIdIndexes.js';

const ATLAS_DB_NAME = 'church-visitors';
let requestIdIndexesReady = false;

async function ensureIndexesOnce(): Promise<void> {
  if (requestIdIndexesReady) return;
  try {
    await ensureRequestIdUniqueIndexes();
    requestIdIndexesReady = true;
  } catch (error) {
    console.error('Não foi possível atualizar o índice de requestId:', error);
    throw new Error('Não foi possível atualizar os índices do banco.');
  }
}

export const GENERIC_DATABASE_ERROR =
  'Não foi possível conectar no banco. Confira MONGODB_URI e tente de novo.';

/** Só troca o DNS do processo quando pedido: na Vercel o resolver nativo já funciona. */
export function shouldOverrideAtlasDns(
  uri: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return uri.startsWith('mongodb+srv://') && env.MONGODB_DNS_OVERRIDE === '1';
}

function configureDnsForAtlas(uri: string): void {
  if (shouldOverrideAtlasDns(uri)) {
    // Alguns provedores/redes no Windows bloqueiam consultas SRV no DNS local.
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

export function atlasHelpMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('querySrv') || message.includes('ECONNREFUSED')) {
    return [
      'Falha na resolução DNS do MongoDB Atlas (SRV).',
      'Tente uma destas opções:',
      '1. No Atlas: Connect → Drivers → escolha "Standard connection string"',
      '2. Coloque essa URI em MONGODB_URI no server/.env',
      '3. Ou altere o DNS do Windows para 8.8.8.8 / 1.1.1.1',
    ].join('\n');
  }

  if (message.includes('bad auth') || message.includes('Authentication failed')) {
    return 'Usuário ou senha incorretos no MongoDB Atlas. Verifique Database Access.';
  }

  if (message.includes('IP') || message.includes('whitelist')) {
    return 'Seu IP não está liberado no Atlas. Vá em Network Access e adicione seu IP.';
  }

  return GENERIC_DATABASE_ERROR;
}

/** Mensagem segura para o navegador: nunca devolve URI, senha ou texto cru do driver. */
export function publicDatabaseError(error: unknown): string {
  return atlasHelpMessage(error);
}

export async function connectDB(uri: string): Promise<void> {
  // Reaproveita conexão em ambientes serverless (Vercel)
  if (mongoose.connection.readyState === 1) {
    await ensureIndexesOnce();
    return;
  }

  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
    await ensureIndexesOnce();
    return;
  }

  configureDnsForAtlas(uri);

  const options: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 15000,
    bufferCommands: false,
  };

  if (uri.startsWith('mongodb+srv://') && !uri.includes(`/${ATLAS_DB_NAME}`)) {
    options.dbName = ATLAS_DB_NAME;
  }

  try {
    await mongoose.connect(uri, options);
    console.log(`MongoDB conectado (${mongoose.connection.name})`);
  } catch (error) {
    const help = atlasHelpMessage(error);
    throw new Error(help);
  }

  await ensureIndexesOnce();
}
