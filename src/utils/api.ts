/**
 * URL builder for server-side Ma9icTV APIs.
 * GitHub Pages can only host static assets, so its browser UI uses the dedicated
 * Fly.io Express service for playlist parsing, EPG fetching, and HLS proxying.
 * Local and same-origin deployments continue using relative /api paths.
 */
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const isGitHubPages = typeof window !== 'undefined'
  && (window.location.hostname === 'github.io' || window.location.hostname.endsWith('.github.io'));

export const API_BASE_URL = (configuredApiBase || (isGitHubPages ? 'https://ma9ictv.fly.dev' : '')).replace(/\/+$/, '');

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}
