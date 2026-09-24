/**
 * Unit project setup. Unit tests must never open a database connection, so
 * `DATABASE_URL` is pointed at a host that cannot resolve: importing a
 * DB-backed module by accident fails loudly here instead of silently reaching
 * the developer's `.env.local` database.
 *
 * `dotenv` in `lib/db/drizzle.ts` never overrides a variable that is already
 * set, so this assignment wins.
 */
process.env.DATABASE_URL = 'postgres://unit-tests-must-not-touch-a-database/';
process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;
process.env.BASE_URL ??= 'http://test.local';
process.env.STORAGE_DRIVER ??= 'local';
