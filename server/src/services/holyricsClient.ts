import type { HolyricsMode } from '../models/HolyricsSettings.js';

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
  const host = conn.host.trim() || '127.0.0.1';
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (conn.mode === 'local') {
      throw new Error(
        `Não foi possível conectar ao Holyrics em ${localBaseUrl(conn)}. ` +
          'Confirme que o Holyrics está aberto, a API Server ativa, e que este servidor alcança o PC da igreja. ' +
          `(${message})`
      );
    }
    throw new Error(`Falha ao conectar na API internet do Holyrics (${message})`);
  }

  const text = await response.text();
  let json: HolyricsResponse<T> | null = null;
  try {
    json = text ? (JSON.parse(text) as HolyricsResponse<T>) : null;
  } catch {
    throw new Error(`Resposta inválida do Holyrics (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(
      json?.error || json?.message || `Holyrics retornou HTTP ${response.status}`
    );
  }

  if (json?.status && json.status !== 'ok') {
    throw new Error(json.error || json.message || 'Holyrics retornou status de erro');
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
