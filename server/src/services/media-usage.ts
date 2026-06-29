import type { Core } from '@strapi/strapi';

const MORPH_TABLE = 'files_related_mph';
const TITLE_CANDIDATES = ['title', 'name', 'headline', 'label', 'subject', 'slug'];

function findTitleField(attributes: Record<string, any>): string {
  return (
    TITLE_CANDIDATES.find(
      (f) => f in attributes && ['string', 'text', 'uid'].includes(attributes[f]?.type)
    ) ?? 'documentId'
  );
}

interface UsageResult {
  contentTypeUid: string;
  contentTypeDisplayName: string;
  kind: string;
  documentId: string;
  entryTitle: string;
  fieldName: string;
  isComponent: boolean;
  viaComponent?: string;
}

async function traceToContentEntries(
  strapi: Core.Strapi,
  startUid: string,
  startIds: number[]
): Promise<UsageResult[]> {
  const knex = strapi.db.connection;

  type CmpsInfo = { uid: string; isComponent: boolean; schema: any };
  const cmpsMap = new Map<string, CmpsInfo>();

  for (const [uid, schema] of Object.entries(strapi.contentTypes)) {
    const cn = (schema as any).collectionName;
    if (cn) cmpsMap.set(`${cn}_cmps`, { uid, isComponent: false, schema });
  }
  for (const [uid, schema] of Object.entries(strapi.components)) {
    const cn = (schema as any).collectionName;
    if (cn) cmpsMap.set(`${cn}_cmps`, { uid, isComponent: true, schema });
  }

  const finalResults: UsageResult[] = [];
  const queue: Array<{ uid: string; ids: number[]; via: string }> = [
    { uid: startUid, ids: startIds, via: '' },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const { uid: searchUid, ids: searchIds, via } = queue.shift()!;

    for (const [cmpsTable, info] of cmpsMap.entries()) {
      try {
        const links: any[] = await knex(cmpsTable)
          .whereIn('cmp_id', searchIds)
          .where('component_type', searchUid)
          .select('entity_id', 'cmp_id', 'field');

        if (!links.length) continue;

        if (!info.isComponent) {
          const ct = info.schema;
          const entityIds = [...new Set(links.map((l) => Number(l.entity_id)))];
          const titleField = findTitleField(ct.attributes);

          let entries: any[] = [];
          try {
            entries = await strapi.db.query(info.uid).findMany({
              where: { id: { $in: entityIds } },
            });
          } catch {
            continue;
          }

          for (const link of links) {
            const entry = entries.find((e) => e.id === Number(link.entity_id));
            if (!entry) continue;
            finalResults.push({
              contentTypeUid: info.uid,
              contentTypeDisplayName: ct.info?.displayName ?? info.uid,
              kind: ct.kind ?? 'collectionType',
              documentId: entry.documentId ?? String(entry.id),
              entryTitle: entry[titleField] ?? `#${entry.documentId ?? entry.id}`,
              fieldName: link.field ?? searchUid,
              isComponent: false,
              viaComponent: via || (strapi.components[searchUid] as any)?.info?.displayName || undefined,
            });
          }
        } else {
          const entityIds = [...new Set(links.map((l) => Number(l.entity_id)))];
          const key = `${info.uid}:${entityIds.join(',')}`;
          if (!visited.has(key)) {
            visited.add(key);
            const componentDisplayName =
              (info.schema as any).info?.displayName ?? info.uid;
            queue.push({
              uid: info.uid,
              ids: entityIds,
              via: via || componentDisplayName,
            });
          }
        }
      } catch {
        // table doesn't exist or has no component_type column — skip
      }
    }
  }

  return finalResults;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getFileUsages(fileId: number) {
    const knex = strapi.db.connection;

    const morphs = await knex(MORPH_TABLE)
      .where('file_id', fileId)
      .select('related_id', 'related_type', 'field');

    if (!morphs.length) return [];

    const byType = morphs.reduce<Record<string, typeof morphs>>((acc, row) => {
      (acc[row.related_type] ??= []).push(row);
      return acc;
    }, {});

    const results: UsageResult[] = [];

    for (const [uid, rows] of Object.entries(byType)) {
      const isComponent = !strapi.contentTypes[uid] && !!strapi.components[uid];
      const schema = strapi.contentTypes[uid] ?? strapi.components[uid];
      if (!schema) continue;

      const uniqueIds = [...new Set(rows.map((r) => r.related_id))];

      if (isComponent) {
        const traced = await traceToContentEntries(strapi, uid, uniqueIds);

        if (traced.length > 0) {
          results.push(...traced);
        } else {
          // Fallback: show the component itself (no parent found)
          const titleField = findTitleField(schema.attributes);
          let entries: any[] = [];
          try {
            entries = await strapi.db.query(uid).findMany({
              where: { id: { $in: uniqueIds } },
            });
          } catch {
            continue;
          }
          for (const entry of entries) {
            const morph = rows.find((r) => r.related_id === entry.id);
            results.push({
              contentTypeUid: uid,
              contentTypeDisplayName: (schema as any).info?.displayName ?? uid,
              kind: 'component',
              documentId: entry.documentId ?? String(entry.id),
              entryTitle: entry[titleField] ?? `#${entry.documentId ?? entry.id}`,
              fieldName: morph?.field ?? '',
              isComponent: true,
            });
          }
        }
      } else {
        const titleField = findTitleField(schema.attributes);
        let entries: any[] = [];
        try {
          entries = await strapi.db.query(uid).findMany({
            where: { id: { $in: uniqueIds } },
          });
        } catch {
          continue;
        }
        const entryById = new Map(entries.map((e: any) => [e.id, e]));
        for (const morph of rows) {
          const entry = entryById.get(morph.related_id);
          if (!entry) continue;
          results.push({
            contentTypeUid: uid,
            contentTypeDisplayName: (schema as any).info?.displayName ?? uid,
            kind: (schema as any).kind ?? 'collectionType',
            documentId: entry.documentId ?? String(entry.id),
            entryTitle: entry[titleField] ?? `#${entry.documentId ?? entry.id}`,
            fieldName: morph.field ?? '',
            isComponent: false,
          });
        }
      }
    }

    return results;
  },
});
