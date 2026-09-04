import type { HolyricsSettings, HolyricsSyncResponse, HolyricsSyncResultItem, Service } from '../types';

interface HolyricsSong {
  id: string;
  title: string;
  artist?: string;
  author?: string;
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

function pickBestSongMatch(
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

async function holyricsLocalRequest<T>(
  settings: HolyricsSettings,
  action: string,
  body: Record<string, unknown>
): Promise<T> {
  const host = settings.host.trim() || '127.0.0.1';
  const port = settings.port || 8091;
  const url = `http://${host}:${port}/api/${action}?token=${encodeURIComponent(settings.token)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      `Não foi possível alcançar o Holyrics em http://${host}:${port}. ` +
        'Abra este app no PC da igreja (com Holyrics ligado) ou use o modo internet.'
    );
  }

  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json.status && json.status !== 'ok')) {
    throw new Error(json.error || json.message || `Holyrics HTTP ${response.status}`);
  }

  return (json.data ?? json) as T;
}

/** Sync direto do navegador → Holyrics local (útil com app na Vercel). */
export async function syncServiceToHolyricsBrowser(
  service: Service,
  settings: HolyricsSettings
): Promise<HolyricsSyncResponse> {
  if (settings.mode !== 'local') {
    throw new Error('Sync pelo navegador só está disponível no modo local');
  }
  if (!settings.token) {
    throw new Error('Configure o token do Holyrics primeiro');
  }
  if (!service.hymns.length) {
    throw new Error('Este culto não tem louvores para enviar');
  }

  const results: HolyricsSyncResultItem[] = [];
  const idsToAdd: string[] = [];

  for (const hymn of service.hymns) {
    try {
      const query = [hymn.title, hymn.artist].filter(Boolean).join(' ');
      const songs = await holyricsLocalRequest<HolyricsSong[]>(settings, 'SearchLyrics', {
        text: query || hymn.title,
        title: true,
        artist: true,
        note: false,
        lyrics: false,
      });

      const match = pickBestSongMatch(Array.isArray(songs) ? songs : [], hymn.title, hymn.artist);
      if (!match?.id) {
        results.push({
          title: hymn.title,
          artist: hymn.artist,
          status: 'not_found',
          message: 'Não encontrada na biblioteca do Holyrics',
        });
        continue;
      }

      idsToAdd.push(String(match.id));
      results.push({
        title: hymn.title,
        artist: hymn.artist,
        status: 'added',
        holyricsId: String(match.id),
        holyricsTitle: match.title,
      });
    } catch (error) {
      results.push({
        title: hymn.title,
        artist: hymn.artist,
        status: 'error',
        message: error instanceof Error ? error.message : 'Erro ao buscar música',
      });
    }
  }

  const uniqueIds = [...new Set(idsToAdd)];
  if (uniqueIds.length > 0) {
    await holyricsLocalRequest(settings, 'AddLyricsToPlaylist', {
      ids: uniqueIds,
      media_playlist: false,
    });
  }

  const added = results.filter((r) => r.status === 'added').length;
  const notFound = results.filter((r) => r.status === 'not_found').length;
  const errors = results.filter((r) => r.status === 'error').length;

  return {
    serviceId: service._id,
    serviceTitle: service.title,
    added,
    notFound,
    errors,
    results,
    message:
      errors > 0 && added === 0
        ? 'Não foi possível enviar as músicas. Verifique a conexão com o Holyrics.'
        : `${added} enviada(s), ${notFound} não encontrada(s)${errors ? `, ${errors} com erro` : ''}.`,
  };
}
