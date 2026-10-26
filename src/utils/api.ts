import { Capacitor } from '@capacitor/core';

/**
 * URL builder for Ma9icTV server APIs.
 * Local/server deployments use same-origin /api paths. A separately hosted API
 * can be configured explicitly with VITE_API_BASE_URL; no provider is assumed.
 */
const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();

export const isGitHubPages = typeof window !== 'undefined'
  && (window.location.hostname === 'github.io' || window.location.hostname.endsWith('.github.io'));

export const isNativeAndroid = Capacitor.isNativePlatform();
export const API_BASE_URL = (configuredApiBase || (isNativeAndroid ? 'http://127.0.0.1:8765' : '')).replace(/\/+$/, '');

// Android keeps parsing in the bundled frontend, but cross-origin downloads use
// the loopback API so IPTV providers do not have to enable WebView CORS.
export const isStaticClient = isGitHubPages || (isNativeAndroid && !configuredApiBase);

export function networkUrl(url: string, userAgent?: string, referer?: string): string {
  if (!isNativeAndroid) return url;
  const params = new URLSearchParams({ url });
  if (userAgent) params.set('userAgent', userAgent);
  if (referer) params.set('referer', referer);
  return `${API_BASE_URL}/api/proxy?${params.toString()}`;
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}
