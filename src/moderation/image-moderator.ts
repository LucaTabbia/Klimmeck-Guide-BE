export interface ModerationImage {
    buffer: Buffer;
    mimetype: 'image/jpeg' | 'image/png' | 'image/webp';
    filename: string;
}

export type ModerationVerdict =
    | { approved: true; logged: string[] }
    | { approved: false; reasons: string[]; logged: string[] };

export abstract class ImageModerator {
    abstract readonly enabled: boolean;

    abstract moderate(image: ModerationImage): Promise<ModerationVerdict>;
}
