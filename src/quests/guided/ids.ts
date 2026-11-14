import { Types } from 'mongoose';

export const hexOf = (id: Types.ObjectId): string => id.toHexString();

export const presentOnly = <T>(entries: readonly (T | null)[]): T[] =>
    entries.filter((entry): entry is T => entry !== null);

export const uniqueIds = (ids: readonly Types.ObjectId[]): Types.ObjectId[] =>
    [...new Set(ids.map(hexOf))].map((hex) => new Types.ObjectId(hex));

export const presentIds = (
    ids: readonly (Types.ObjectId | null)[],
): Types.ObjectId[] => uniqueIds(presentOnly(ids));
