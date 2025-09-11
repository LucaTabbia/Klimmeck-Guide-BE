import { Schema } from 'mongoose';

export function idTransformPlugin(schema: Schema) {
    schema.set('toJSON', {
        virtuals: true,
        transform: (_, ret) => {
            if (ret._id !== undefined) {
                ret.id = ret._id!.toString();
                delete ret._id;
            }
        },
    });

    schema.set('toObject', {
        virtuals: true,
        transform: (_, ret) => {
            if (ret._id !== undefined) {
                ret.id = ret._id!.toString();
                delete ret._id;
            }
        },
    });
}