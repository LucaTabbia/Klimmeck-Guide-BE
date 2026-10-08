import mongoose from 'mongoose';

beforeAll(async () => {
    const uri = process.env.MONGO_TEST_URI as string;
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
    }
});

afterEach(async () => {
    const { collections } = mongoose.connection;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.connection.close();
});
