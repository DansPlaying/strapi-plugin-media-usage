# strapi-plugin-media-usage

A Strapi v5 plugin that shows **where each media file is used** across your content types, directly inside the Media Library details modal.

## Features

- Injects a "Used in" section into the Media Library asset details dialog
- Traces images through nested Strapi components (BFS) up to their parent content-type entry
- Shows which component contains the image (e.g. "in Photo Card", "in Logo Carousel")
- Links directly to the Content Manager entry
- Zero configuration — works out of the box

## Installation

```bash
npm install strapi-plugin-media-usage
```

Add to your Strapi config (`config/plugins.ts`):

```ts
export default {
  'media-usage': { enabled: true },
};
```

## Development

```bash
npm install
npm run build   # compile with strapi-plugin build
npm test        # run unit tests
```

## How it works

1. The admin injects a React component into the Media Library details dialog via `MutationObserver`
2. On open, it fetches `GET /media-usage/files/:id/usages` (admin-only route)
3. The server queries the `files_related_mph` morph table to find all references
4. For component references, a BFS walks `*_cmps` join tables to find the parent content-type entry
5. Results include `viaComponent` — the display name of the component that holds the image

## Requirements

- Strapi v5
- Node.js 18+
