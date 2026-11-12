/** Vitest setup — runs before every test file.
 *
 * Adds the DOM matchers (toBeInTheDocument, toHaveAttribute, ...) and clears
 * the rendered tree between tests so one test's markup cannot satisfy the
 * next one's query.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { configure } from '@testing-library/dom';
import { afterEach } from 'vitest';

configure({ asyncUtilTimeout: 10000 });

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
