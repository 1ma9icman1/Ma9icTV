# Ma9icTV master M3U catalog experiment

This branch is an isolated prototype. It does not change the production `main` branch or Render.

## Prototype scope

- Builds a normalized, searchable catalog from playlists already parsed by Ma9icTV.
- Deduplicates matching channel identities while preserving every distinct stream URL as a source-specific variant.
- Keeps query-string tokens on stream URLs and removes only URL fragments for duplicate checks.
- Provides in-memory filtering and an IndexedDB cache API.
- Does not fetch M3Us by itself and is not yet wired into the player or EPG startup path. This deliberate first step keeps the prototype from changing existing playback behavior before it can be built and tested locally.

## Next integration step

Wire the catalog into the app behind an explicit experimental toggle. On startup, read the last-known-good IndexedDB catalog first, then rebuild it from successfully loaded playlists in the background. Refresh each source independently and never replace a populated cache with an empty result from a failed source. Keep EPG identifiers and source-specific stream variants intact.

## Test locally

From the experimental branch:

```powershell
npm install
npm run lint
npm run build
```

Compare first startup and repeat startup separately. A catalog cache can accelerate local filtering and repeated visits, but it cannot make an upstream video host connect faster or remove the network cost of a cold first load.
