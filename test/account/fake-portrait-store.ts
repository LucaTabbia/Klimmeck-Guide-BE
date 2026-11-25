import { PortraitStore } from 'src/account/deletion/portrait/portrait-store';

const FAKE_PROVIDER_ERROR_CODE = 503;
// il cloud configurato dell'app nei test: solo i suoi ritratti si possono distruggere (Phase 26 CR-01)
export const FAKE_PORTRAIT_CLOUD_NAME = 'demo-cloud';

export class FakePortraitStore extends PortraitStore {
    readonly cloudName = FAKE_PORTRAIT_CLOUD_NAME;
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
