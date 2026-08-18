/**
 * Integration tests need a fresh account each run, but registration closes after the first
 * one. They reach across to the server package's own test helper, which mints accounts
 * directly in Postgres and then signs in over HTTP, so the session under test is a real one.
 */
export { cleanup, signIn, type TestSession } from '../../server/test/helpers.ts';
