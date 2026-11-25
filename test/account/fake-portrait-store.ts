import { PortraitStore } from 'src/account/deletion/portrait/portrait-store';

const FAKE_PROVIDER_ERROR_CODE = 503;

export class FakePortraitStore extends PortraitStore {
    readonly destroyed: string[] = [];
    private failuresLeft = 0;

    failNext(times = 1): void {
        this.failuresLeft = times;
    }

    destroy(publicId: string): Promise<void> {
        if (this.failuresLeft > 0) {
            this.failuresLeft -= 1;
            return Promise.reject(
                Object.assign(new Error('fake provider failure'), {
                    name: 'CloudinaryError',
                    code: FAKE_PROVIDER_ERROR_CODE,
                }),
            );
        }
        this.destroyed.push(publicId);
        return Promise.resolve();
    }
}
