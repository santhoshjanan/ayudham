import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Serves room WebSockets during `vite dev`. In production `server.js` does this.
 * Loading the module through Vite gives the same runtime object the pages use.
 */
const devSockets = (): Plugin => ({
  name: 'pokerji-dev-sockets',
  configureServer(server) {
    server.httpServer?.on('upgrade', (req, socket, head) => {
      if (!req.url?.startsWith('/poker/r/')) return;
      server
        .ssrLoadModule('/src/lib/server/pokerji.ts')
        .then((module) => module.runtime().upgrade(req, socket, head))
        .catch(() => socket.destroy());
    });
  },
});

export default defineConfig(({ command, mode }) => {
  if (command === 'serve') {
    // Development only: read the repository's .env so the app finds the dev services.
    Object.assign(process.env, loadEnv(mode, '../..', ''), process.env);
  }
  return {
    plugins: [
      sveltekit({
        compilerOptions: {
          runes: ({ filename }) =>
            filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
        },
        adapter: adapter(),
        // Vite's dev client needs inline styles, so the policy applies to builds only.
        // The end-to-end tests run against a build, so the policy is always tested.
        ...(command === 'build'
          ? {
              csp: {
                mode: 'nonce' as const,
                directives: {
                  'default-src': ['self'],
                  'script-src': ['self'],
                  'style-src': ['self'],
                  'img-src': ['self', 'data:'],
                  'font-src': ['self'],
                  'media-src': ['self'],
                  'connect-src': ['self'],
                  'object-src': ['none'],
                  'base-uri': ['none'],
                  'form-action': ['self'],
                  'frame-ancestors': ['none'],
                },
              },
            }
          : {}),
      }),
      devSockets(),
    ],
  };
});
