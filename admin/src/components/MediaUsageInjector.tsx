import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileUsageSectionStandalone } from './FileUsageSectionStandalone';

function findDetailsDialog(): Element | null {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  for (const d of dialogs) {
    const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      if ((n as Text).textContent?.trim().toLowerCase() === 'asset id') return d;
    }
  }
  return null;
}

function getAssetId(dialog: Element): number | null {
  const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if ((n as Text).textContent?.trim().toLowerCase() === 'asset id') {
      const labelEl = (n as Text).parentElement;
      const container = labelEl?.parentElement;
      if (container) {
        const kids = Array.from(container.children);
        const idx = kids.indexOf(labelEl!);
        if (idx >= 0 && kids[idx + 1]) {
          const val = parseInt(kids[idx + 1].textContent?.trim() ?? '', 10);
          if (!Number.isNaN(val)) return val;
        }
      }
      break;
    }
  }
  return null;
}

/**
 * Find the image-preview column (left side of the Details dialog).
 *
 * Strategy: the dialog content is a two-column flex row.
 *  - Right column contains the <form> (file name, alt text, etc.)
 *  - Left column contains the <img> asset preview
 *
 * We walk up from the <form> until we find a sibling that contains an <img>.
 * That sibling IS the preview column — we append our mount inside it.
 * Falls back to appending after the form if the left column isn't found.
 */
function getOrCreateMount(dialog: Element): HTMLElement | null {
  const existing = dialog.querySelector('[data-mup]') as HTMLElement | null;
  if (existing && dialog.contains(existing)) return existing;

  const form = dialog.querySelector('form');
  if (!form) return null;

  // Walk up from <form> looking for a sibling that contains an <img>
  let candidate = form.parentElement;
  while (candidate && candidate !== dialog) {
    const parent = candidate.parentElement;
    if (parent && parent !== dialog) {
      const siblings = Array.from(parent.children);
      const previewCol = siblings.find(
        (s) => s !== candidate && s.querySelector('img')
      ) as HTMLElement | null;

      if (previewCol) {
        const mount = document.createElement('div');
        mount.setAttribute('data-mup', '');
        previewCol.appendChild(mount);
        return mount;
      }
    }
    candidate = candidate.parentElement;
  }

  // Fallback: insert after the form (right column, below Location)
  const mount = document.createElement('div');
  mount.setAttribute('data-mup', '');
  form.insertAdjacentElement('afterend', mount);
  return mount;
}

export function MediaUsageInjector() {
  const [injection, setInjection] = useState<{
    fileId: number;
    mountEl: HTMLElement;
  } | null>(null);

  useEffect(() => {
    let cur: {
      dialog: Element | null;
      fileId: number | null;
      mountEl: HTMLElement | null;
    } = { dialog: null, fileId: null, mountEl: null };
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function process() {
      const dialog = findDetailsDialog();

      if (!dialog) {
        cur.mountEl?.remove();
        cur = { dialog: null, fileId: null, mountEl: null };
        setInjection(null);
        return;
      }

      const fileId = getAssetId(dialog);
      if (!fileId) return;

      if (
        dialog === cur.dialog &&
        fileId === cur.fileId &&
        cur.mountEl &&
        dialog.contains(cur.mountEl)
      ) {
        return;
      }

      if (cur.mountEl && cur.dialog !== dialog) cur.mountEl.remove();

      const mountEl = getOrCreateMount(dialog);
      if (!mountEl) return;

      cur = { dialog, fileId, mountEl };
      setInjection({ fileId, mountEl });
    }

    function debouncedProcess() {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(process, 60);
    }

    const observer = new MutationObserver(debouncedProcess);
    observer.observe(document.body, { childList: true, subtree: true });
    process();

    return () => {
      observer.disconnect();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      cur.mountEl?.remove();
    };
  }, []);

  if (!injection) return null;

  return createPortal(
    <FileUsageSectionStandalone fileId={injection.fileId} />,
    injection.mountEl
  );
}
