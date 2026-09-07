import type { HolyricsMode } from '../models/HolyricsSettings.js';
import { HolyricsHostError, normalizeHolyricsHost } from './holyricsHost.js';

/** O modo local costuma estar em rede lenta; sem teto a função fica pendurada. */
const REQUEST_TIMEOUT_MS = 10_000;

export const HOLYRICS_LOCAL_UNREACHABLE =
  'Não foi possível conectar ao Holyrics neste computador. Confirme que o Holyrics está aberto e a API Server ativa.';
export const HOLYRICS_INTERNET_UNREACHABLE =
  'Não foi possível conectar à API internet do Holyrics.';
export const HOLYRICS_REJECTED =
  'O Holyrics recusou a requisição. Confira o token e tente de novo.';
export const HOLYRICS_INVALID_RESPONSE = 'O Holyrics devolveu uma resposta inválida.';
export const HOLYRICS_GENERIC_FAILURE =
  'Não foi possível falar com o Holyrics agora. Confira se ele está aberto e tente de novo.';

const PUBLIC_HOLYRICS_ERRORS = new Set([
  'Token do Holyrics não configurado',
  'API Key do Holyrics é obrigatória no modo internet',
  HOLYRICS_LOCAL_UNREACHABLE,
  HOLYRICS_INTERNET_UNREACHABLE,
  HOLYRICS_REJECTED,
  HOLYRICS_INVALID_RESPONSE,
]);

/** Mensagem segura para o navegador: sem URL, sem texto do fetch e sem corpo interno. */
export function holyricsPublicError(error: unknown): string {
  if (error instanceof HolyricsHostError) return error.message;
  if (error instanceof Error && PUBLIC_HOLYRICS_ERRORS.has(error.message)) {
    return error.message;
  }
  return HOLYRICS_GENERIC_FAILURE;
}

function holyricsFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  const cause = error.cause;
  if (cause && typeof cause === 'object' && cause !== null && 'code' in cause) {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string' && code) return `${error.name}:${code}`;
  }
  return error.name || 'Error';
}

export interface HolyricsConnection {
  mode: HolyricsMode;
  host: string;
  port: number;
  token: string;
  apiKey: string;
}

export interface HolyricsSong {
  id: string;
  title: string;
  artist?: string;
  author?: string;
}

interface HolyricsResponse<T> {
  status?: string;
  data?: T;
  error?: string;
  message?: string;
}

function localBaseUrl(conn: HolyricsConnection): string {
  // Revalida na hora de montar a URL: protege registros já salvos no banco.
  const host = normalizeHolyricsHost(conn.host || '127.0.0.1');
  const port = conn.port || 8091;
  return `http://${host}:${port}`;
}

export function buildHolyricsActionUrl(conn: HolyricsConnection, action: string): string {
  if (conn.mode === 'internet') {
    return `https://api.holyrics.com.br/request/${action}`;
  }
  return `${localBaseUrl(conn)}/api/${action}?token=${encodeURIComponent(conn.token)}`;
}

export async function holyricsRequest<T>(
  conn: HolyricsConnection,
  action: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  if (!conn.token.trim()) {
    throw new Error('Token do Holyrics não configurado');
  }

  if (conn.mode === 'internet' && !conn.apiKey.trim()) {
    throw new Error('API Key do Holyrics é obrigatória no modo internet');
  }

  const url = buildHolyricsActionUrl(conn, action);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (conn.mode === 'internet') {
    headers.token = conn.token;
    headers.API_KEY = conn.apiKey;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      // Sem isso um redirecionamento da resposta levaria a requisição para
      // outro endereço, contornando a validação do host.
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Não registra URL nem message: a URL local carrega o token, e o fetch
    // costuma repetir host/IP (oráculo de SSRF).
    console.error('Holyrics indisponível', {
      mode: conn.mode,
      action,
      code: holyricsFailureCode(error),
    });
    if (conn.mode === 'local') {
      throw new Error(HOLYRICS_LOCAL_UNREACHABLE);
    }
    throw new Error(HOLYRICS_INTERNET_UNREACHABLE);
  }

  const text = await response.text();
  let json: HolyricsResponse<T> | null;
  try {
    json = text ? (JSON.parse(text) as HolyricsResponse<T>) : null;
  } catch {
    throw new Error(HOLYRICS_INVALID_RESPONSE);
  }

  if (!response.ok) {
    throw new Error(HOLYRICS_REJECTED);
  }

  if (json?.status && json.status !== 'ok') {
    throw new Error(HOLYRICS_REJECTED);
  }

  return (json?.data ?? json) as T;
}

function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pickBestSongMatch(
  songs: HolyricsSong[],
  title: string,
  artist?: string
): HolyricsSong | null {
  if (!songs.length) return null;

  const targetTitle = normalizeTitle(title);
  const targetArtist = artist ? normalizeTitle(artist) : '';

  const scored = songs.map((song) => {
    const songTitle = normalizeTitle(song.title || '');
    const songArtist = normalizeTitle(song.artist || song.author || '');
    let score = 0;

    if (songTitle === targetTitle) score += 100;
    else if (songTitle.includes(targetTitle) || targetTitle.includes(songTitle)) score += 60;

    if (targetArtist) {
      if (songArtist === targetArtist) score += 40;
      else if (songArtist.includes(targetArtist) || targetArtist.includes(songArtist)) score += 20;
    }

    return { song, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].score >= 60 ? scored[0].song : null;
}

export async function searchHolyricsSong(
  conn: HolyricsConnection,
  title: string,
  artist?: string
): Promise<HolyricsSong | null> {
  const query = [title, artist].filter(Boolean).join(' ').trim();
  const data = await holyricsRequest<HolyricsSong[]>(conn, 'SearchLyrics', {
    text: query || title,
    title: true,
    artist: true,
    note: false,
    lyrics: false,
  });

  const songs = Array.isArray(data) ? data : [];
  return pickBestSongMatch(songs, title, artist);
}

export async function addSongsToHolyricsPlaylist(
  conn: HolyricsConnection,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  await holyricsRequest(conn, 'AddLyricsToPlaylist', {
    ids,
    media_playlist: false,
  });
}

export async function testHolyricsConnection(conn: HolyricsConnection): Promise<number> {
  const data = await holyricsRequest<unknown[]>(conn, 'GetSongs', {});
  return Array.isArray(data) ? data.length : 0;
}
