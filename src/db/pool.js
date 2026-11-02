import pg from 'pg';
import dotenv from 'dotenv';

const isTestEnvironment = process.env.NODE_ENV === 'test';
const envResult = dotenv.config({
    path: isTestEnvironment ? '.env.test' : '.env',
    override: isTestEnvironment,
});

if (isTestEnvironment && envResult.error) {
    throw new Error('Unable to load the test database configuration from .env.test');
}

export function assertSafeTestDatabaseUrl(connectionString) {
    let databaseUrl;

    try {
        databaseUrl = new URL(connectionString);
    } catch {
        throw new Error('Test database URL is invalid');
    }

    const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
    const isLoopbackHost = ['localhost', '127.0.0.1', '[::1]']
        .includes(databaseUrl.hostname);

    if (databaseName !== 'url_monitoring_test' || !isLoopbackHost) {
        throw new Error(
            'Test database must be the dedicated local url_monitoring_test database'
        );
    }

    return connectionString;
}

if (isTestEnvironment) {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required in .env.test');
    }

    assertSafeTestDatabaseUrl(process.env.DATABASE_URL);
}

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isTestEnvironment ? false : {
        rejectUnauthorized: false,
    },
});

export default pool;