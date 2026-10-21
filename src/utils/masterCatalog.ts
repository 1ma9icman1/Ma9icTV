import type { Channel, Playlist } from '../types';

export interface MasterCatalogEntry {
  /** Stable catalog identity. A channel may have several source-specific stream variants. */
  id: string;
  name: string;
  group: string;
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  isRadio?: boolean;
  variants: Array<{
    playlistId: string;
    playlistTitle: string;
    channelId: string;
    url: string;
    userAgent?: string;
    referrer?: string;
  }>;
}

export interface MasterCatalog {
  version: 1;
  builtAt: number;
  sourcePlaylistIds: string[];
  entries: MasterCatalogEntry[];
}

const DB_NAME = 'ma9ictv-master-catalog';
const DB_VERSION = 1;
const STORE_NAME = 'catalogs';
const CATALOG_KEY = 'master-v1';

/** Normalize labels for matching only; original display labels are retained. */
function normalizeLabel(value: string | undefined): string {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Remove URL fragments, but preserve query parameters because they may be stream tokens. */
function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value.trim();
  }
}

/** Exclude the two confirmed-dead channels from the combined Master Catalog only. */
export function isExcludedMasterCatalogLabel(...labels: Array<string | undefined>): boolean {
  return labels.some((label) => {
    const normalized = normalizeLabel(label);
    return normalized === 'kanali 7' || normalized === 'cnn albania' || normalized === 'cnn albanadnia';
  });
}

function entryIdentity(channel: Channel): string {
  const tvgId = normalizeLabel(channel.tvgId);
  if (tvgId) return `tvg:${tvgId}`;
  // Only group by name + group when a reliable XMLTV ID is absent.
  return `label:${normalizeLabel(channel.name)}|group:${normalizeLabel(channel.group)}`;
}

/**
 * Build an in-memory master catalog from already-parsed playlists.
 * This function does no network I/O and never discards alternative stream URLs.
 */
export function buildMasterCatalog(playlists: Playlist[]): MasterCatalog {
  const entriesByIdentity = new Map<string, MasterCatalogEntry>();
  const sourcePlaylistIds = new Set<string>();

  for (const playlist of playlists) {
    sourcePlaylistIds.add(playlist.id);
    for (const channel of playlist.channels || []) {
      if (isExcludedMasterCatalogLabel(channel.name, channel.tvgName, channel.tvgId)) continue;
      const url = String(channel.url || '').trim();
      if (!/^https?:\/\//i.test(url)) continue;

      const identity = entryIdentity(channel);
      let entry = entriesByIdentity.get(identity);
      if (!entry) {
        entry = {
          id: identity,
          name: channel.name || 'Unknown channel',
          group: channel.group || 'Uncategorized',
          logo: channel.logo,
          tvgId: channel.tvgId,
          tvgName: channel.tvgName,
          isRadio: channel.isRadio,
          variants: [],
        };
        entriesByIdentity.set(identity, entry);
      } else {
        // Fill missing metadata only; do not overwrite useful metadata already chosen.
        entry.logo ||= channel.logo;
        entry.tvgId ||= channel.tvgId;
        entry.tvgName ||= channel.tvgName;
        entry.isRadio ??= channel.isRadio;
        if (entry.group === 'Uncategorized' && channel.group) entry.group = channel.group;
      }

      const normalizedUrl = normalizeUrl(url);
      const alreadyAdded = entry.variants.some((variant) =>
        normalizeUrl(variant.url) === normalizedUrl
      );
      if (!alreadyAdded) {
        entry.variants.push({
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          channelId: channel.id,
          url,
          userAgent: channel.httpUserAgent || playlist.userAgent,
          referrer: channel.httpReferrer,
        });
      }
    }
  }

  return {
    version: 1,
    builtAt: Date.now(),
    sourcePlaylistIds: [...sourcePlaylistIds],
    entries: [...entriesByIdentity.values()],
  };
}

export interface MasterCatalogFilters {
  query?: string;
  group?: string;
  playlistId?: string;
  country?: string;
  radio?: boolean;
}

/** Filter the in-memory index; does not fetch or parse M3U files. */
export function filterMasterCatalog(
  catalog: MasterCatalog,
  filters: MasterCatalogFilters = {},
): MasterCatalogEntry[] {
  const query = normalizeLabel(filters.query);
  const group = normalizeLabel(filters.group);
  const country = normalizeLabel(filters.country);

  return catalog.entries.filter((entry) => {
    if (query) {
      const haystack = normalizeLabel([
        entry.name,
        entry.group,
        entry.tvgId,
        entry.tvgName,
        ...entry.variants.map((variant) => variant.playlistTitle),
      ].join(' '));
      if (!haystack.includes(query)) return false;
    }
    if (group && normalizeLabel(entry.group) !== group) return false;
    if (country && !normalizeLabel(entry.group).includes(country)) return false;
    if (typeof filters.radio === 'boolean' && Boolean(entry.isRadio) !== filters.radio) return false;
    if (filters.playlistId && !entry.variants.some((v) => v.playlistId === filters.playlistId)) return false;
    return true;
  });
}

function openCatalogDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open master catalog cache'));
  });
}

/** Read the last successfully saved catalog. Returns null when no cache exists. */
export async function readCachedMasterCatalog(): Promise<MasterCatalog | null> {
  let db: IDBDatabase | undefined;
  try {
    db = await openCatalogDb();
    return await new Promise((resolve, reject) => {
      const request = db!.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(CATALOG_KEY);
      request.onsuccess = () => {
        const value = request.result as MasterCatalog | undefined;
        resolve(value?.version === 1 && Array.isArray(value.entries) ? value : null);
      };
      request.onerror = () => reject(request.error || new Error('Could not read master catalog cache'));
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** Save atomically; callers should only replace the cache after a successful refresh/build. */
export async function writeCachedMasterCatalog(catalog: MasterCatalog): Promise<boolean> {
  let db: IDBDatabase | undefined;
  try {
    db = await openCatalogDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(catalog, CATALOG_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not write master catalog cache'));
      transaction.onabort = () => reject(transaction.error || new Error('Master catalog cache write was aborted'));
    });
    return true;
  } catch (error) {
    console.warn('Ma9icTV master catalog cache unavailable; continuing without it.', error);
    return false;
  } finally {
    db?.close();
  }
}
