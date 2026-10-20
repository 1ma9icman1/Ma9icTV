# Ma9icTV maintenance notes (2026-10-20)

## Changes in this patch
- Removed the process-wide `NODE_TLS_REJECT_UNAUTHORIZED=0` override. HTTPS certificates are now validated normally; disabling TLS verification globally makes every outbound HTTPS request vulnerable to interception.
- Reduced Express JSON and URL-encoded request body limits from 50 MB to 20 MB and capped URL-encoded parameter count.
- Updated the health endpoint name to Ma9icTV.
- Fixed Reset All Data so it removes only Ma9icTV-owned storage keys instead of wiping all LocalStorage for the origin, then reinitializes and persists the default app state.
- Made active-playlist and settings/favorite persistence failures non-fatal when browser storage is unavailable or full.
- Updated package name/version metadata.

## Verification status
The archive was inspected and the source edits were reviewed. Automated build/type-check could not complete in this environment because dependencies were not installed: `npm install` timed out, and the globally available TypeScript compiler reports missing `vite/client` types. Run `npm install` (or `bun install`) in the project directory, then `npm run lint` and `npm run build` before deployment.

## Important production follow-up
The API's remote-fetch/proxy endpoints should be deployed behind appropriate network egress controls and request-rate limits. If the server is publicly reachable, restrict outbound targets to public HTTP(S) hosts and validate redirect destinations to prevent SSRF. IPTV providers sometimes require custom headers, so test any such policy against the providers you actually use.
