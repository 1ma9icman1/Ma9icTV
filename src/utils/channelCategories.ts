import type { Channel } from '../types';

/**
 * Fold the many upstream M3U group labels into a small, predictable set of
 * user-facing categories. Keep the original channel.group untouched so search,
 * EPG matching, and source metadata continue to work.
 */
export const BROAD_CHANNEL_CATEGORIES = [
  'US & Canada',
  'UK & Ireland',
  'Australia & New Zealand',
  'Mexico',
  'South Africa',
  'Europe (English)',
  'News & Business',
  'Movies & Drama',
  'Comedy & Entertainment',
  'Documentaries & Science',
  'Kids & Family',
  'Sports & Travel',
  'Music & Culture',
  'Other English',
] as const;

export type BroadChannelCategory = typeof BROAD_CHANNEL_CATEGORIES[number];

function normalized(value: string | undefined): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getBroadChannelCategory(channel: Pick<Channel, 'name' | 'group'>): BroadChannelCategory {
  const group = normalized(channel.group);
  const name = normalized(channel.name);
  const value = `${group} ${name}`;

  if (/\b(mexico|mexican|mx)\b/.test(group)) return 'Mexico';
  if (/\b(south africa|south african)\b/.test(group)) return 'South Africa';
  if (/\b(australia|australian|new zealand|nz)\b/.test(group)) return 'Australia & New Zealand';
  if (/\b(united states|usa|us channels|american|canada|canadian)\b/.test(group)) return 'US & Canada';
  if (/\b(united kingdom|uk channels|british|britain|england|scotland|wales|ireland|irish)\b/.test(group)) return 'UK & Ireland';
  if (/\b(europe|european|english speaking europe)\b/.test(group)) return 'Europe (English)';

  if (/\b(news|business|weather|finance|financial|market)\b/.test(value)) return 'News & Business';
  if (/\b(movie|movies|cinema|film|films|classic|classics|drama)\b/.test(value)) return 'Movies & Drama';
  if (/\b(comedy|comedies|sitcom|sitcoms|entertainment|variety)\b/.test(value)) return 'Comedy & Entertainment';
  if (/\b(documentary|documentaries|science|discovery|history|nature|technology|space)\b/.test(value)) return 'Documentaries & Science';
  if (/\b(kids|children|family|animation|cartoon|cartoons)\b/.test(value)) return 'Kids & Family';
  if (/\b(sport|sports|outdoor|travel|adventure)\b/.test(value)) return 'Sports & Travel';
  if (/\b(music|concert|concerts|culture|radio)\b/.test(value)) return 'Music & Culture';

  return 'Other English';
}

export function getBroadCategoryCounts(channels: Channel[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  channels.forEach((channel) => {
    const category = getBroadChannelCategory(channel);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
