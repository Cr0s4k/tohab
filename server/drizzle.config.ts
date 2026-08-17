import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/schema.ts',
	dbCredentials: { url: process.env.TOHAB_DB ?? './data/tohab.sqlite' }
});
