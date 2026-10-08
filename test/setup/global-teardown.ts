import mongoose from 'mongoose';
import { stopReplSet } from './mongo-replset';

export default async function globalTeardown(): Promise<void> {
    await mongoose.disconnect();
    await stopReplSet();
}
