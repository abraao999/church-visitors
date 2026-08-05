import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import app, { ensureDb } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await ensureDb();

    // Hospedagem Node clássica (não Vercel): serve o frontend buildado
    if (process.env.NODE_ENV === 'production' && process.env.VERCEL !== '1') {
      const clientDist = path.join(__dirname, '../../client/dist');
      app.use(express.static(clientDist));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
      });
    }

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Falha ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Na Vercel o app é serverless e não chama listen()
if (process.env.VERCEL !== '1') {
  start();
}
