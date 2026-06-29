import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MediaUsageInjector } from './MediaUsageInjector';

let injDiv: HTMLElement | null = null;

function startInjector() {
  if (injDiv && document.body.contains(injDiv)) return;
  injDiv = document.createElement('div');
  injDiv.setAttribute('data-mup-root', '');
  document.body.appendChild(injDiv);
  const root = createRoot(injDiv);
  root.render(<MediaUsageInjector />);
}

export const Initializer = ({ setPlugin }: { setPlugin: (id: string) => void }) => {
  useEffect(() => {
    setPlugin('media-usage');
    startInjector();
  }, [setPlugin]);
  return null;
};
