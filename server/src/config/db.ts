import dns from 'dns';
import mongoose from 'mongoose';

const ATLAS_DB_NAME = 'church-visitors';

function configureDnsForAtlas(uri: string): void {
  if (uri.startsWith('mongodb+srv://')) {
    // Alguns provedores/redes no Windows bloqueiam consultas SRV no DNS local.
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

function atlasHelpMessage(error: unknown): string {
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

  return message;
}

export async function connectDB(uri: string): Promise<void> {
  configureDnsForAtlas(uri);

  const options: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 15000,
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
}
