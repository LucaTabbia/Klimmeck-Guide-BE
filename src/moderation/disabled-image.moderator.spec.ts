import { DisabledImageModerator } from 'src/moderation/disabled-image.moderator';
import type { ModerationImage } from 'src/moderation/image-moderator';

const IMAGE: ModerationImage = {
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    mimetype: 'image/png',
    filename: 'portrait.png',
};

describe('DisabledImageModerator', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('approves every image while moderation is disabled outside production (D-14)', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch');
        const moderator = new DisabledImageModerator();

        await expect(moderator.moderate(IMAGE)).resolves.toEqual({
            approved: true,
            logged: [],
        });
        expect(moderator.enabled).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
