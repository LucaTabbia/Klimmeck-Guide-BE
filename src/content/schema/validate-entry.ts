import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { ContentIssue } from 'src/content/content-issue';
import { LoadedEntry } from 'src/content/loading/yaml-file';

// le voci senza riga (sezioni di images.yaml) arrivano con line null
export type EntrySource = Omit<LoadedEntry, 'line'> & { line: number | null };

// vincoli interni di class-validator senza un messaggio scritto da noi
const BUILT_IN_MESSAGES: Record<string, string> = {
    whitelistValidation: 'campo sconosciuto',
    nestedValidation: 'deve essere una mappa',
    unknownValue: 'valore non riconosciuto',
};

interface FieldProblem {
    path: string;
    messages: string[];
}

function messagesOf(error: ValidationError): string[] {
    return Object.entries(error.constraints ?? {}).map(
        ([constraint, message]) => BUILT_IN_MESSAGES[constraint] ?? message,
    );
}

function flatten(errors: ValidationError[], prefix: string): FieldProblem[] {
    return errors.flatMap((error) => {
        const path = prefix ? `${prefix}.${error.property}` : error.property;
        const own = messagesOf(error);
        const nested = flatten(error.children ?? [], path);
        return own.length > 0 ? [{ path, messages: own }, ...nested] : nested;
    });
}

// i fix non hanno id: la loro chiave stabile identifica la voce nei report
function entryIdOf(raw: Record<string, unknown>): string | null {
    if (typeof raw.id === 'string') return raw.id;
    if (typeof raw.key === 'string') return raw.key;
    return null;
}

export function validateEntry<T extends object>(
    cls: new () => T,
    entry: EntrySource,
): ContentIssue[] {
    const instance = plainToInstance(cls, entry.raw);
    const errors = validateSync(instance, {
        whitelist: true,
        forbidNonWhitelisted: true,
    });
    const entryId = entryIdOf(entry.raw);
    return flatten(errors, '').map(({ path, messages }) => ({
        file: entry.file,
        line: entry.line,
        entryId,
        path,
        message: `${path}: ${messages.join('; ')}`,
    }));
}
