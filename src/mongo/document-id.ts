import { Types } from 'mongoose';

const OBJECT_ID_HEX = /^[0-9a-f]{24}$/;

// i payload del PubSub sono documenti idratati: l'idTransformPlugin non è registrato nell'harness, quindi niente toJSON
export function documentIdOf(document: unknown): string | undefined {
    const id = (document as { _id?: unknown } | null | undefined)?._id;
    if (id === undefined || id === null) return undefined;
    return (id as { toString(): string }).toString();
}

// solo la forma canonica minuscola, quella emessa dal server: gli id si confrontano come stringhe, il maiuscolo darebbe falsi negativi
// Types.ObjectId.isValid accetta qualunque stringa di 12 caratteri: per gli id del client serve l'esadecimale a 24
export function isObjectIdHex(value: string): boolean {
    return OBJECT_ID_HEX.test(value);
}

// i path ref @Prop({ type: Types.ObjectId }) sono Mixed: un id stringa nei filtri non matcha e negli update si salva come String (04 Pitfall 1)
export function objectIdFromHex(
    value: string | null | undefined,
): Types.ObjectId | null {
    return typeof value === 'string' && isObjectIdHex(value)
        ? new Types.ObjectId(value)
        : null;
}
