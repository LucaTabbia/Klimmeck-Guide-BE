import { RedisMemoryServer } from 'redis-memory-server';

let server: RedisMemoryServer | undefined;

export async function startRedis(): Promise<{ host: string; port: number }> {
    if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
        return { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) };
    }
    server = new RedisMemoryServer();
    const host = await server.getHost();
    const port = await server.getPort();
    return { host, port };
}

export async function stopRedis(): Promise<void> {
    if (server) {
        await server.stop();
        server = undefined;
    }
}
