import { Model } from 'mongoose';

export function buildEnemy(
    overrides: Record<string, any> = {},
): Record<string, any> {
    void overrides;
    throw new Error('not implemented');
}

export function persistEnemy(
    model: Model<any>,
    overrides: Record<string, any> = {},
) {
    return model.create(buildEnemy(overrides));
}
