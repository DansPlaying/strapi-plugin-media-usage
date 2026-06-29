import { describe, it, expect, vi } from 'vitest';
import createService from '../../server/src/services/media-usage';

const MORPH_TABLE = 'files_related_mph';

// Chainable Knex builder mock that actually applies WHERE conditions.
// This lets each test control exactly which rows each table returns,
// without worrying about false positives from unfiltered data.
function makeKnexMock(tableData: Record<string, any[]>) {
  return vi.fn().mockImplementation((table: string) => {
    const tableRows = [...(tableData[table] ?? [])];
    const filters: Array<(row: any) => boolean> = [];

    const builder: any = {
      where: vi.fn().mockImplementation((col: string, val: any) => {
        filters.push((row: any) => String(row[col]) === String(val));
        return builder;
      }),
      whereIn: vi.fn().mockImplementation((col: string, vals: any[]) => {
        const strVals = vals.map(String);
        filters.push((row: any) => strVals.includes(String(row[col])));
        return builder;
      }),
      select: vi.fn().mockImplementation(() =>
        Promise.resolve(tableRows.filter((row) => filters.every((f) => f(row))))
      ),
    };
    return builder;
  });
}

function makeStrapi({
  tableData = {},
  contentTypes = {},
  components = {},
  entriesByUid = {},
}: {
  tableData?: Record<string, any[]>;
  contentTypes?: Record<string, any>;
  components?: Record<string, any>;
  entriesByUid?: Record<string, any[]>;
}) {
  return {
    db: {
      connection: makeKnexMock(tableData),
      query: vi.fn().mockImplementation((uid: string) => ({
        findMany: vi.fn().mockResolvedValue(entriesByUid[uid] ?? []),
      })),
    },
    contentTypes,
    components,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
}

// ─── getFileUsages ────────────────────────────────────────────────────────────

describe('getFileUsages', () => {
  it('returns empty array when image is not referenced anywhere', async () => {
    const strapi = makeStrapi({ tableData: { [MORPH_TABLE]: [] } });
    const result = await createService({ strapi } as any).getFileUsages(1);
    expect(result).toEqual([]);
  });

  it('skips rows whose uid is unknown (not in contentTypes or components)', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [{ file_id: 1, related_id: 1, related_type: 'unknown::ghost', field: 'img' }],
      },
    });
    const result = await createService({ strapi } as any).getFileUsages(1);
    expect(result).toEqual([]);
  });

  it('resolves a direct content-type reference', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 10, related_type: 'api::blog-post.blog-post', field: 'featuredImage' },
        ],
      },
      contentTypes: {
        'api::blog-post.blog-post': {
          collectionName: 'blog_posts',
          kind: 'collectionType',
          info: { displayName: 'Blog Post' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::blog-post.blog-post': [{ id: 10, documentId: 'doc-abc', title: 'My Post' }],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contentTypeUid: 'api::blog-post.blog-post',
      contentTypeDisplayName: 'Blog Post',
      kind: 'collectionType',
      documentId: 'doc-abc',
      entryTitle: 'My Post',
      fieldName: 'featuredImage',
      isComponent: false,
    });
    expect(result[0].viaComponent).toBeUndefined();
  });

  it('picks the best title field (name over documentId fallback)', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [{ file_id: 1, related_id: 5, related_type: 'api::work.work', field: 'image' }],
      },
      contentTypes: {
        'api::work.work': {
          collectionName: 'works',
          kind: 'collectionType',
          info: { displayName: 'Work' },
          attributes: { name: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::work.work': [{ id: 5, documentId: 'work-1', name: 'Project Alpha' }],
      },
    });

    const [entry] = await createService({ strapi } as any).getFileUsages(1);
    expect(entry.entryTitle).toBe('Project Alpha');
  });

  it('falls back to documentId in title when no title field exists', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [{ file_id: 1, related_id: 3, related_type: 'api::item.item', field: 'img' }],
      },
      contentTypes: {
        'api::item.item': {
          collectionName: 'items',
          kind: 'collectionType',
          info: { displayName: 'Item' },
          attributes: { price: { type: 'decimal' } },
        },
      },
      entriesByUid: {
        'api::item.item': [{ id: 3, documentId: 'doc-xyz' }],
      },
    });

    const [entry] = await createService({ strapi } as any).getFileUsages(1);
    expect(entry.entryTitle).toBe('doc-xyz');
  });

  it('returns multiple entries when same image is used in several content entries', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 1, related_type: 'api::blog-post.blog-post', field: 'image' },
          { file_id: 1, related_id: 2, related_type: 'api::blog-post.blog-post', field: 'image' },
        ],
      },
      contentTypes: {
        'api::blog-post.blog-post': {
          collectionName: 'blog_posts',
          kind: 'collectionType',
          info: { displayName: 'Blog Post' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::blog-post.blog-post': [
          { id: 1, documentId: 'post-1', title: 'First Post' },
          { id: 2, documentId: 'post-2', title: 'Second Post' },
        ],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result).toHaveLength(2);
    const titles = result.map((r) => r.entryTitle);
    expect(titles).toContain('First Post');
    expect(titles).toContain('Second Post');
  });

  it('returns separate rows when same entry uses the image in two different fields', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 10, related_type: 'api::blog-post.blog-post', field: 'thumbnail' },
          { file_id: 1, related_id: 10, related_type: 'api::blog-post.blog-post', field: 'coverImage' },
        ],
      },
      contentTypes: {
        'api::blog-post.blog-post': {
          collectionName: 'blog_posts',
          kind: 'collectionType',
          info: { displayName: 'Blog Post' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::blog-post.blog-post': [{ id: 10, documentId: 'post-1', title: 'My Post' }],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result).toHaveLength(2);
    const fields = result.map((r) => r.fieldName);
    expect(fields).toContain('thumbnail');
    expect(fields).toContain('coverImage');
  });
});

// ─── BFS: component tracing ───────────────────────────────────────────────────

describe('getFileUsages — component BFS tracing', () => {
  it('traces a component (1 level deep) to its parent page', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 100, related_type: 'blocks.photo-card', field: 'image' },
        ],
        pages_cmps: [
          { entity_id: 10, cmp_id: 100, component_type: 'blocks.photo-card', field: 'blocks' },
        ],
      },
      contentTypes: {
        'api::page.page': {
          collectionName: 'pages',
          kind: 'collectionType',
          info: { displayName: 'Page' },
          attributes: { title: { type: 'string' } },
        },
      },
      components: {
        'blocks.photo-card': {
          collectionName: 'components_blocks_photo_cards',
          info: { displayName: 'Photo Card' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::page.page': [{ id: 10, documentId: 'page-xyz', title: 'Home' }],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contentTypeUid: 'api::page.page',
      contentTypeDisplayName: 'Page',
      documentId: 'page-xyz',
      entryTitle: 'Home',
      isComponent: false,
      viaComponent: 'Photo Card',
    });
  });

  it('traces a nested component (2 levels deep) to its parent page', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 50, related_type: 'shared.logo-item', field: 'logo' },
        ],
        components_blocks_logo_carousels_cmps: [
          { entity_id: 200, cmp_id: 50, component_type: 'shared.logo-item', field: 'items' },
        ],
        pages_cmps: [
          { entity_id: 10, cmp_id: 200, component_type: 'blocks.logo-carousel', field: 'blocks' },
        ],
      },
      contentTypes: {
        'api::page.page': {
          collectionName: 'pages',
          kind: 'collectionType',
          info: { displayName: 'Page' },
          attributes: { title: { type: 'string' } },
        },
      },
      components: {
        'shared.logo-item': {
          collectionName: 'components_shared_logo_items',
          info: { displayName: 'Logo Item' },
          attributes: {},
        },
        'blocks.logo-carousel': {
          collectionName: 'components_blocks_logo_carousels',
          info: { displayName: 'Logo Carousel' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::page.page': [{ id: 10, documentId: 'page-xyz', title: 'Home' }],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contentTypeUid: 'api::page.page',
      entryTitle: 'Home',
      isComponent: false,
      viaComponent: 'Logo Carousel',
    });
  });

  it('sets viaComponent to the direct component name (not field name) for 1-level components', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 100, related_type: 'blocks.copy-and-photo', field: 'image' },
        ],
        pages_cmps: [
          { entity_id: 10, cmp_id: 100, component_type: 'blocks.copy-and-photo', field: 'blocks' },
        ],
      },
      contentTypes: {
        'api::page.page': {
          collectionName: 'pages',
          kind: 'collectionType',
          info: { displayName: 'Page' },
          attributes: { title: { type: 'string' } },
        },
      },
      components: {
        'blocks.copy-and-photo': {
          collectionName: 'components_blocks_copy_and_photos',
          info: { displayName: 'Copy & Photo' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::page.page': [{ id: 10, documentId: 'page-1', title: 'Services' }],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result[0].viaComponent).toBe('Copy & Photo');
    // fieldName is the page's field ('blocks') — viaComponent is what the UI displays
    expect(result[0].fieldName).toBe('blocks');
  });

  it('falls back to showing the component when BFS finds no parent content-type', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 100, related_type: 'blocks.photo-card', field: 'image' },
        ],
        // no _cmps table maps this component to a content type
      },
      contentTypes: {},
      components: {
        'blocks.photo-card': {
          collectionName: 'components_blocks_photo_cards',
          info: { displayName: 'Photo Card' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'blocks.photo-card': [{ id: 100, documentId: 'cmp-1', title: 'Standalone Card' }],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      contentTypeUid: 'blocks.photo-card',
      contentTypeDisplayName: 'Photo Card',
      isComponent: true,
    });
  });

  it('does not follow cycles in the component graph', async () => {
    // Component A references component B, which references component A back.
    // Without cycle protection the BFS would loop forever.
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 1, related_type: 'blocks.a', field: 'img' },
        ],
        // A appears inside B
        components_blocks_bs_cmps: [
          { entity_id: 2, cmp_id: 1, component_type: 'blocks.a', field: 'child' },
        ],
        // B appears inside A (cycle)
        components_blocks_as_cmps: [
          { entity_id: 1, cmp_id: 2, component_type: 'blocks.b', field: 'child' },
        ],
      },
      contentTypes: {},
      components: {
        'blocks.a': {
          collectionName: 'components_blocks_as',
          info: { displayName: 'Block A' },
          attributes: {},
        },
        'blocks.b': {
          collectionName: 'components_blocks_bs',
          info: { displayName: 'Block B' },
          attributes: {},
        },
      },
      entriesByUid: {},
    });

    // Should complete without hanging and return the fallback (no content-type parent found)
    const result = await createService({ strapi } as any).getFileUsages(1);
    // result can be empty or show fallback component — the key thing is it terminates
    expect(Array.isArray(result)).toBe(true);
  });

  it('resolves the same component used in multiple pages', async () => {
    const strapi = makeStrapi({
      tableData: {
        [MORPH_TABLE]: [
          { file_id: 1, related_id: 101, related_type: 'blocks.photo-card', field: 'image' },
          { file_id: 1, related_id: 102, related_type: 'blocks.photo-card', field: 'image' },
        ],
        pages_cmps: [
          { entity_id: 10, cmp_id: 101, component_type: 'blocks.photo-card', field: 'blocks' },
          { entity_id: 20, cmp_id: 102, component_type: 'blocks.photo-card', field: 'blocks' },
        ],
      },
      contentTypes: {
        'api::page.page': {
          collectionName: 'pages',
          kind: 'collectionType',
          info: { displayName: 'Page' },
          attributes: { title: { type: 'string' } },
        },
      },
      components: {
        'blocks.photo-card': {
          collectionName: 'components_blocks_photo_cards',
          info: { displayName: 'Photo Card' },
          attributes: { title: { type: 'string' } },
        },
      },
      entriesByUid: {
        'api::page.page': [
          { id: 10, documentId: 'page-home', title: 'Home' },
          { id: 20, documentId: 'page-about', title: 'About' },
        ],
      },
    });

    const result = await createService({ strapi } as any).getFileUsages(1);

    expect(result).toHaveLength(2);
    const titles = result.map((r) => r.entryTitle);
    expect(titles).toContain('Home');
    expect(titles).toContain('About');
  });
});
