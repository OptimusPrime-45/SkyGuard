import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve, dirname, extname } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { brotliCompress } from 'zlib';
import { promisify } from 'util';
import pkg from './package.json';
import { VARIANT_META } from './src/config/variant-meta';

const isE2E = process.env.VITE_E2E === '1';
const isDesktopBuild = process.env.VITE_DESKTOP_RUNTIME === '1';

const brotliCompressAsync = promisify(brotliCompress);
const BROTLI_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html', '.svg', '.json', '.txt', '.xml', '.wasm']);

function brotliPrecompressPlugin(): Plugin {
  return {
    name: 'brotli-precompress',
    apply: 'build',
    async writeBundle(outputOptions, bundle) {
      const outDir = outputOptions.dir;
      if (!outDir) return;

      await Promise.all(Object.keys(bundle).map(async (fileName) => {
        const extension = extname(fileName).toLowerCase();
        if (!BROTLI_EXTENSIONS.has(extension)) return;

        const sourcePath = resolve(outDir, fileName);
        const compressedPath = `${sourcePath}.br`;
        const sourceBuffer = await readFile(sourcePath);
        if (sourceBuffer.length < 1024) return;

        const compressedBuffer = await brotliCompressAsync(sourceBuffer);
        await mkdir(dirname(compressedPath), { recursive: true });
        await writeFile(compressedPath, compressedBuffer);
      }));
    },
  };
}

const activeVariant = process.env.VITE_VARIANT || 'full';
const activeMeta = VARIANT_META[activeVariant] || VARIANT_META.full;

function htmlVariantPlugin(): Plugin {
  return {
    name: 'html-variant',
    transformIndexHtml(html) {
      let result = html
        .replace(/<title>.*?<\/title>/, `<title>${activeMeta.title}</title>`)
        .replace(/<meta name="title" content=".*?" \/>/, `<meta name="title" content="${activeMeta.title}" />`)
        .replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${activeMeta.description}" />`)
        .replace(/<meta name="keywords" content=".*?" \/>/, `<meta name="keywords" content="${activeMeta.keywords}" />`)
        .replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${activeMeta.url}" />`)
        .replace(/<meta name="application-name" content=".*?" \/>/, `<meta name="application-name" content="${activeMeta.siteName}" />`)
        .replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${activeMeta.url}" />`)
        .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${activeMeta.title}" />`)
        .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${activeMeta.description}" />`)
        .replace(/<meta property="og:site_name" content=".*?" \/>/, `<meta property="og:site_name" content="${activeMeta.siteName}" />`)
        .replace(/<meta name="subject" content=".*?" \/>/, `<meta name="subject" content="${activeMeta.subject}" />`)
        .replace(/<meta name="classification" content=".*?" \/>/, `<meta name="classification" content="${activeMeta.classification}" />`)
        .replace(/<meta name="twitter:url" content=".*?" \/>/, `<meta name="twitter:url" content="${activeMeta.url}" />`)
        .replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${activeMeta.title}" />`)
        .replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${activeMeta.description}" />`)
        .replace(/"name": "SkyGuard AI"/, `"name": "${activeMeta.siteName}"`)
        .replace(/"alternateName": "SkyGuardAI"/, `"alternateName": "${activeMeta.siteName.replace(' ', '')}"`)
        .replace(/"url": "\/"/, `"url": "${activeMeta.url}"`)
        .replace(/"description": "AI-powered real-time airspace monitoring with ML threat detection, trajectory prediction, and agentic intelligence."/, `"description": "${activeMeta.description}"`)
        .replace(/"featureList": \[[\s\S]*?\]/, `"featureList": ${JSON.stringify(activeMeta.features, null, 8).replace(/\n/g, '\n      ')}`);

      // Theme-color meta â€” warm cream for happy variant
      if (activeVariant === 'happy') {
        result = result.replace(
          /<meta name="theme-color" content=".*?" \/>/,
          '<meta name="theme-color" content="#FAFAF5" />'
        );
      }

      // Desktop builds: inject build-time variant into the inline script so data-variant is set
      // before CSS loads. Web builds always use 'full' â€” runtime hostname detection handles variants.
      if (activeVariant !== 'full') {
        result = result.replace(
          /if\(v\)document\.documentElement\.dataset\.variant=v;/,
          `v='${activeVariant}';document.documentElement.dataset.variant=v;`
        );
      }

      // Desktop CSP: inject localhost wildcard for dynamic sidecar port.
      // Web builds intentionally exclude localhost to avoid exposing attack surface.
      if (isDesktopBuild) {
        result = result
          .replace(
            /connect-src 'self' https: http:\/\/localhost:5173/,
            "connect-src 'self' https: http://localhost:5173 http://127.0.0.1:*"
          )
          .replace(
            /frame-src 'self'/,
            "frame-src 'self' http://127.0.0.1:*"
          );
      }

      // Desktop builds: replace favicon paths with variant-specific subdirectory.
      // Web builds use 'full' favicons in HTML; runtime JS swaps them per hostname.
      if (activeVariant !== 'full') {
        result = result
          .replace(/\/favico\/favicon/g, `/favico/${activeVariant}/favicon`)
          .replace(/\/favico\/apple-touch-icon/g, `/favico/${activeVariant}/apple-touch-icon`)
          .replace(/\/favico\/android-chrome/g, `/favico/${activeVariant}/android-chrome`)
          .replace(/\/favico\/og-image/g, `/favico/${activeVariant}/og-image`);
      }

      return result;
    },
  };
}

/**
 * Stub plugin: returns an empty module for any @/generated/* import.
 * The generated protobuf/RPC layer has been removed; this prevents
 * build failures from leftover imports in unused components.
 */
function generatedStubPlugin(): Plugin {
  const stubPath = resolve(__dirname, 'src/shims/generated-stub.ts');
  return {
    name: 'generated-stub',
    enforce: 'pre',
    resolveId(source) {
      const norm = source.replace(/\\/g, '/');
      if (norm.includes('/src/generated/') || norm.startsWith('@/generated/')) {
        return stubPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    generatedStubPlugin(),
    htmlVariantPlugin(),
    brotliPrecompressPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,

      includeAssets: [
        'favico/favicon.ico',
        'favico/apple-touch-icon.png',
        'favico/favicon-32x32.png',
      ],

      manifest: {
        name: `${activeMeta.siteName} - ${activeMeta.subject}`,
        short_name: activeMeta.shortName,
        description: activeMeta.description,
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#0a0f0a',
        background_color: '#0a0f0a',
        categories: activeMeta.categories,
        icons: [
          { src: '/favico/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/favico/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/favico/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
        globIgnores: ['**/ml*.js', '**/onnx*.wasm', '**/locale-*.js'],
        // globe.gl + three.js grows main bundle past the 2 MiB default limit
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

        runtimeCaching: [
          {
            urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && /^\/api\//.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && /^\/api\//.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'POST',
          },
          {
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && /^\/rss\//.test(url.pathname),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.endsWith('.pmtiles') ||
              url.hostname.endsWith('.r2.dev') ||
              url.hostname === 'build.protomaps.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pmtiles-ranges',
              expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/protomaps\.github\.io\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'protomaps-assets',
              expiration: { maxEntries: 100, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-woff',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/assets\/locale-.*\.js$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'locale-files',
              expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      child_process: resolve(__dirname, 'src/shims/child-process.ts'),
      'node:child_process': resolve(__dirname, 'src/shims/child-process.ts'),
      '@loaders.gl/worker-utils/dist/lib/process-utils/child-process-proxy.js': resolve(
        __dirname,
        'src/shims/child-process-proxy.ts'
      ),
    },
  },
  build: {
    // Geospatial bundles (maplibre/deck) are expected to be large even when split.
    // Raise warning threshold to reduce noisy false alarms in CI.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      onwarn(warning, warn) {
        // onnxruntime-web ships a minified browser bundle that intentionally uses eval.
        // Keep build logs focused by filtering this known third-party warning only.
        if (
          warning.code === 'EVAL'
          && typeof warning.id === 'string'
          && warning.id.includes('/onnxruntime-web/dist/ort-web.min.js')
        ) {
          return;
        }

        warn(warning);
      },
      input: {
        main: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'settings.html'),
        liveChannels: resolve(__dirname, 'live-channels.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/@xenova/transformers/')) {
              return 'transformers';
            }
            if (id.includes('/onnxruntime-web/')) {
              return 'onnxruntime';
            }
            if (id.includes('/maplibre-gl/') || id.includes('/pmtiles/') || id.includes('/@protomaps/basemaps/')) {
              return 'maplibre';
            }
            if (
              id.includes('/@deck.gl/')
              || id.includes('/@luma.gl/')
              || id.includes('/@loaders.gl/')
              || id.includes('/@math.gl/')
              || id.includes('/h3-js/')
            ) {
              return 'deck-stack';
            }
            if (id.includes('/d3/')) {
              return 'd3';
            }
            if (id.includes('/topojson-client/')) {
              return 'topojson';
            }
            if (id.includes('/i18next')) {
              return 'i18n';
            }
            if (id.includes('/@sentry/')) {
              return 'sentry';
            }
          }
          if (id.includes('/src/components/') && id.endsWith('Panel.ts')) {
            return 'panels';
          }
          // Give lazy-loaded locale chunks a recognizable prefix so the
          // service worker can exclude them from precache (en.json is
          // statically imported into the main bundle).
          const localeMatch = id.match(/\/locales\/(\w+)\.json$/);
          if (localeMatch && localeMatch[1] !== 'en') {
            return `locale-${localeMatch[1]}`;
          }
          return undefined;
        },
      },
    },
  },
  worker: {
    plugins: () => [generatedStubPlugin()],
  },
  server: {
    port: 3000,
    allowedHosts: ['unantagonizable-janeth-genteelly.ngrok-free.dev'],
    open: !isE2E,
    hmr: isE2E ? false : undefined,
    watch: {
      ignored: [
        '**/test-results/**',
        '**/playwright-report/**',
        '**/.playwright-mcp/**',
      ],
    },
    proxy: {
      // Forward all /api requests to FastAPI backend at localhost:8000
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('FastAPI proxy error:', err.message);
          });
        },
      },
    },
  },
});
