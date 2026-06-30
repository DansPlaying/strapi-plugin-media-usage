import { useEffect, useState } from 'react';

interface UsageEntry {
  contentTypeUid: string;
  contentTypeDisplayName: string;
  kind: string;
  documentId: string;
  entryTitle: string;
  fieldName: string;
  isComponent: boolean;
  viaComponent?: string;
}

function getToken(): string | null {
  try {
    const raw = localStorage.getItem('jwtToken');
    if (raw) return JSON.parse(raw);
  } catch (_e) {}
  return null;
}

async function fetchFileUsages(fileId: number): Promise<UsageEntry[]> {
  const token = getToken();
  const base =
    typeof window !== 'undefined' && (window as any).strapi?.backendURL
      ? (window as any).strapi.backendURL
      : '';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${base}/media-usage/files/${fileId}/usages`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
}

function buildCMUrl(kind: string, uid: string, documentId: string): string {
  if (kind === 'singleType') return `/admin/content-manager/single-types/${uid}`;
  return `/admin/content-manager/collection-types/${uid}/${documentId}`;
}

function dedupeUsages(usages: UsageEntry[]): UsageEntry[] {
  const seen = new Set<string>();
  return usages.filter((u) => {
    const key = `${u.contentTypeUid}::${u.documentId}::${u.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  section: {
    padding: '12px 16px 8px',
    borderTop: '1px solid var(--strapi-neutral-200, #dcdce4)',
  },
  heading: {
    margin: '0 0 8px 0',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--strapi-neutral-600, #666687)',
  },
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headingInline: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--strapi-neutral-600, #666687)',
  },
  loadBtn: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--strapi-neutral-0, #ffffff)',
    background: 'var(--strapi-primary-600, #4945ff)',
    border: '1px solid var(--strapi-primary-700, #3b38d4)',
    borderRadius: 3,
    padding: '2px 8px',
    cursor: 'pointer',
    lineHeight: '1.6',
  },
  meta: {
    margin: 0,
    fontSize: 12,
    color: 'var(--strapi-neutral-500, #8e8ea9)',
    fontStyle: 'italic',
  },
  entry: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '5px 0',
    gap: 8,
    borderBottom: '1px solid var(--strapi-neutral-150, #eaeaef)',
  },
  entryLast: { borderBottom: 'none' },
  entryInfo: { flex: 1, minWidth: 0 },
  ctName: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--strapi-neutral-700, #32324d)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  entryTitle: {
    display: 'block',
    fontSize: 11,
    color: 'var(--strapi-neutral-600, #666687)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  hint: {
    display: 'block',
    fontSize: 10,
    color: 'var(--strapi-neutral-400, #a5a5ba)',
  },
  openLink: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--strapi-primary-600, #4945ff)',
    textDecoration: 'none',
    padding: '2px 8px',
    borderRadius: 3,
    border: '1px solid var(--strapi-primary-200, #d9d8ff)',
    background: 'var(--strapi-primary-100, #f0f0ff)',
    lineHeight: '1.6',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    whiteSpace: 'nowrap',
  },
  embeddedTag: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 3,
    background: 'var(--strapi-warning-100, #fef3c7)',
    color: 'var(--strapi-warning-700, #b45309)',
  },
};

function EntryRow({
  entry,
  isLast,
}: {
  entry: UsageEntry;
  isLast: boolean;
}) {
  const cmUrl =
    !entry.isComponent
      ? buildCMUrl(entry.kind, entry.contentTypeUid, entry.documentId)
      : null;

  return (
    <div style={{ ...S.entry, ...(isLast ? S.entryLast : {}) }}>
      <div style={S.entryInfo}>
        <div style={S.ctName}>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={entry.contentTypeDisplayName}
          >
            {entry.contentTypeDisplayName}
          </span>
        </div>
        {!entry.isComponent && (
          <span style={S.entryTitle} title={entry.entryTitle}>
            {entry.entryTitle}
          </span>
        )}
        {entry.viaComponent && (
          <span style={S.hint}>in {entry.viaComponent}</span>
        )}
        {!entry.viaComponent && entry.fieldName && (
          <span style={S.hint}>via {entry.fieldName}</span>
        )}
      </div>
      {cmUrl ? (
        <a href={cmUrl} style={S.openLink} title="Open in Content Manager">
          Open →
        </a>
      ) : (
        <span style={S.embeddedTag}>component</span>
      )}
    </div>
  );
}

export function FileUsageSectionStandalone({ fileId }: { fileId: number }) {
  const [state, setState] = useState<{
    usages: UsageEntry[] | null;
    loading: boolean;
    error: string | null;
  }>({ usages: null, loading: false, error: null });

  // Reset when the file changes so stale results don't show
  useEffect(() => {
    setState({ usages: null, loading: false, error: null });
  }, [fileId]);

  function load() {
    setState({ usages: null, loading: true, error: null });
    fetchFileUsages(fileId)
      .then((usages) => setState({ usages, loading: false, error: null }))
      .catch((err) => setState({ usages: null, loading: false, error: err.message }));
  }

  const { usages, loading, error } = state;
  const deduped = usages ? dedupeUsages(usages) : [];
  const loaded = usages !== null || error !== null;

  return (
    <div style={S.section}>
      <div style={S.headingRow}>
        <p style={S.headingInline}>Used in</p>
        {!loading && (
          <button style={S.loadBtn} onClick={load}>
            {loaded ? 'Refresh' : 'Check usage'}
          </button>
        )}
      </div>
      {loading ? (
        <p style={S.meta}>Loading…</p>
      ) : error ? (
        <p style={S.meta}>Unable to load usage data.</p>
      ) : !loaded ? null : !deduped.length ? (
        <p style={S.meta}>Not referenced in any content entry.</p>
      ) : (
        <div>
          {deduped.map((entry, i) => (
            <EntryRow key={i} entry={entry} isLast={i === deduped.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}
