import { Logger } from '@nestjs/common';
import { DisabledImageModerator } from 'src/moderation/disabled-image.moderator';
import { ModerationStartupReporter } from 'src/moderation/moderation-startup.reporter';
import { FakeImageModerator } from '../../test/moderation/fake-image-moderator';

const MODERATION_DISABLED_WARNING =
    'Moderazione delle immagini disattivata (SIGHTENGINE_USER_ID / SIGHTENGINE_API_SECRET vuote): gli upload non sono moderati. Obbligatoria con NODE_ENV=production';

describe('ModerationStartupReporter', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
        warn.mockRestore();
    });

    it('warns at boot when image moderation is disabled (D-14)', () => {
        new ModerationStartupReporter(
            new DisabledImageModerator(),
        ).onApplicationBootstrap();

        expect(warn.mock.calls).toEqual([[MODERATION_DISABLED_WARNING]]);
    });

    it('stays silent at boot when image moderation is enabled (D-14)', () => {
        new ModerationStartupReporter(
            new FakeImageModerator(),
        ).onApplicationBootstrap();

        expect(warn).not.toHaveBeenCalled();
    });
});
