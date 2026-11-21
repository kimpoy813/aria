/**
 * Server-renders a real page component so the markup itself can be asserted on.
 *
 * There is no browser in here, and a page's JSX is the one thing the rest of the
 * suite never sees: `lru.ts` can be right and the page can still render the wrong
 * field. So the page is bundled with esbuild and run through `react-dom/server`,
 * with the four things that need a browser stubbed out — the router, the store,
 * the API, and one hook. Everything else is the shipped code: the real `lru.ts`,
 * the real `chords.ts`, the real components.
 *
 *   const render = await pageRenderer('./src/pages/LineupViewPage', 'LineupViewPage');
 *   const html = await render({ store, route: { id: 'L1' }, hooks: { 5: true } });
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/*
 * The real React with `useState` intercepted. `renderToStaticMarkup` only ever
 * sees initial state, so a panel that starts collapsed cannot be asserted on
 * unless one hook is forced. The index is the page's own hook order; add a hook
 * above it and the render test fails loudly instead of asserting on the wrong
 * thing, which is the point.
 */
const REACT_STUB = `import * as R from 'react';
let n = 0;
export function useState(init) {
  const i = n++;
  const forced = globalThis.__FORCE_HOOKS__;
  if (forced && Object.prototype.hasOwnProperty.call(forced, i)) return [forced[i], () => {}];
  return R.useState(init);
}
globalThis.__RESET_HOOKS__ = () => { n = 0; };
export const useMemo = R.useMemo;
export const useEffect = R.useEffect;
export const useRef = R.useRef;
export const useCallback = R.useCallback;
export const useId = R.useId;
export const useContext = R.useContext;
export const createContext = R.createContext;
export const createElement = R.createElement;
export const Fragment = R.Fragment;
export const forwardRef = R.forwardRef;
export default R;
`;

const ROUTER_STUB = `export const useParams = () => globalThis.__ROUTE__ || {};
export const useNavigate = () => () => {};
export const useLocation = () => ({ state: null, pathname: '/' });
export const Link = (p) => p.children;
`;

const STORE_STUB = 'export const useStore = () => globalThis.__STORE__;\n';
const API_STUB = 'const noop = async () => ({});\nexport const api = new Proxy({}, { get: () => noop });\n';

const STUBS = {
  react: REACT_STUB,
  'react-router-dom': ROUTER_STUB,
  '../lib/store': STORE_STUB,
  '../lib/api': API_STUB,
};

/**
 * Bundles one page and returns a function that renders it to an HTML string.
 *
 * @param {string} page  module path relative to the repo root, e.g. `./src/pages/LineupViewPage`
 * @param {string} exportName  the component's export
 */
export async function pageRenderer(page, exportName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-render-'));
  const files = new Map();
  for (const [specifier, source] of Object.entries(STUBS)) {
    const file = path.join(dir, `${specifier.replace(/[^a-z]/gi, '_')}.mjs`);
    fs.writeFileSync(file, source);
    files.set(specifier, file);
  }

  const build = await esbuild.build({
    stdin: {
      contents: `import { renderToStaticMarkup } from 'react-dom/server';
import { ${exportName} } from '${page}';
export const renderPage = () => renderToStaticMarkup(<${exportName} />);
`,
      resolveDir: root,
      loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    nodePaths: [path.join(root, 'node_modules')],
    // react-dom/server is CommonJS and reaches for node builtins at load time.
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    plugins: [
      {
        name: 'aria-page-stubs',
        setup(b) {
          b.onResolve({ filter: /^(react|react-router-dom|\.\.\/lib\/(store|api))$/ }, (args) => {
            // Only the app's own imports are stubbed — react-dom needs real React.
            if (args.path === 'react' && !args.importer.includes(`${path.sep}src${path.sep}`)) {
              return null;
            }
            return { path: files.get(args.path) };
          });
        },
      },
    ],
  });

  const bundle = path.join(dir, 'bundle.mjs');
  fs.writeFileSync(bundle, build.outputFiles[0].text);
  const mod = await import(`file://${bundle}`);

  /**
   * @param {{ store?: object, route?: object, hooks?: object }} [options]
   * @returns {string} the rendered markup
   */
  return function render(options = {}) {
    globalThis.__STORE__ = {
      teams: [],
      refresh: async () => {},
      notify: () => {},
      ...options.store,
    };
    globalThis.__ROUTE__ = options.route || {};
    globalThis.__FORCE_HOOKS__ = options.hooks || null;
    // A page reads window.location while it renders; SSR has no window.
    globalThis.window = {
      location: { origin: 'https://aria.test' },
      print() {},
      addEventListener() {},
      removeEventListener() {},
    };
    globalThis.__RESET_HOOKS__();
    return mod.renderPage();
  };
}

/** Convenience readers for the markup these pages produce. */
export const songBlocksOf = (html) =>
  [...html.matchAll(/song-group-title[^>]*>([^<]*)</g)].map((m) => m[1]);
export const partLabelsOf = (html) =>
  [...html.matchAll(/song-section-label">([^<]*)</g)].map((m) => m[1]);
export const keyBadgesOf = (html) =>
  [...html.matchAll(/song-key-badge[^>]*>([^<]*)</g)].map((m) => m[1]);
export const keyPickersOf = (html) =>
  [...html.matchAll(/aria-label="(Key for [^"]*)"/g)].map((m) => m[1]);
/** The markup of one row of the key panel, found by text inside it. */
export const panelRowOf = (html, needle) =>
  html.split('running-order-row').slice(1).find((chunk) => chunk.includes(needle)) || '';
export const firstOptionOf = (chunk) => (chunk.match(/<option value=""[^>]*>([^<]*)</) || [, ''])[1];
