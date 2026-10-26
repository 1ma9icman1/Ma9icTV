/**
 * URL builder for Ma9icTV server APIs.
 * Local/server deployments use same-origin /api paths. A separately hosted API
 * can be configured explicitly with VITE_API_BASE_URL; no provider is assumed.
 */
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();

export const isGitHubPages = typeof window !== 'undefined'
  && (window.location.hostname === 'github.io' || window.location.hostname.endsWith('.github.io'));

export const API_BASE_URL = configuredApiBase.replace(/\/+$/, '');

// When GitHub Pages is paired with a configured Node API, use the backend instead
// of browser-only fetching, which cannot bypass upstream CORS restrictions.
export const useBrowserFallback = isGitHubPages && !API_BASE_URL;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}
