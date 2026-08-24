import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { API_ROUTE_PREFIXES } from './src/lib/api.ts';

/** Keeps the API same-origin with the app, which is what lets the session cookie work. */
export const PROXY = Object.fromEntries(
	API_ROUTE_PREFIXES.map((path) => [path, { target: 'http://localhost:5178', changeOrigin: true }])
);

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' }),
			/** The SPA fallback answers deep paths, where relative asset URLs would resolve wrong. */
			paths: { relative: false }
		})
	],
	server: { proxy: PROXY, allowedHosts: ['.ts.net'] },
	preview: { proxy: PROXY }
});
