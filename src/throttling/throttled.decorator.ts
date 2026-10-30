import { applyDecorators, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppThrottlerGuard } from 'src/throttling/app-throttler.guard';

export const DEFAULT_THROTTLER = 'default';
export const WEBHOOK_THROTTLER = 'webhook';

// la guard valuta ogni throttler nominato: ciascun decoratore salta il bucket dell'altro (D-08)
export function Throttled(): MethodDecorator & ClassDecorator {
    return applyDecorators(
        UseGuards(AppThrottlerGuard),
        SkipThrottle({ [WEBHOOK_THROTTLER]: true }),
    );
}

export function ThrottledWebhook(): MethodDecorator & ClassDecorator {
    return applyDecorators(
        UseGuards(AppThrottlerGuard),
        SkipThrottle({ [DEFAULT_THROTTLER]: true }),
    );
}
