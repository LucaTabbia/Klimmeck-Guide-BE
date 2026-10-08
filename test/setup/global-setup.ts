import { startReplSet } from './mongo-replset';

export default async function globalSetup(): Promise<void> {
    const uri = await startReplSet();
    process.env.MONGO_TEST_URI = uri;
    (globalThis as any).__MONGO_URI__ = uri;
}
