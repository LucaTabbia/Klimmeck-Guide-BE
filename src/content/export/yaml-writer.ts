import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { Document, isScalar, Scalar, visit } from 'yaml';
import type { Node } from 'yaml';
import { isObjectIdHex } from 'src/mongo/document-id';

// README §Prosa: le descrizioni stanno sempre in un blocco `|-`, anche su una riga
const PROSE_KEY = 'description';

const isProse = (node: unknown): node is Scalar<string> =>
    isScalar(node) && typeof node.value === 'string';

const isIdText = (value: unknown): value is string =>
    typeof value === 'string' && isObjectIdHex(value);

// liste brevi di valori semplici su una riga (`locations: [forest, hills]`), come nei file scritti a mano
function isPlainValueList(items: readonly unknown[]): boolean {
    return (
        items.length > 0 &&
        items.every((item) => isScalar(item) && !isIdText(item.value))
    );
}

function headerComment(header: string): string {
    return header
        .split('\n')
        .map((line) => ` ${line}`)
        .join('\n');
}

// D-02: il nome accanto a ogni riferimento, mai accanto all'id della voce stessa; Pitfall 6: id sempre fra apici
export function entriesToYaml(
    entries: readonly Record<string, unknown>[],
    namesById: ReadonlyMap<string, string>,
    header?: string,
): string {
    const doc = new Document(entries);
    const ownIds = new WeakSet<Node>();
    visit(doc, {
        Pair(_, pair) {
            if (!isScalar(pair.key)) return;
            if (pair.key.value === 'id') ownIds.add(pair.value as Node);
            if (pair.key.value === PROSE_KEY && isProse(pair.value)) {
                pair.value.type = Scalar.BLOCK_LITERAL;
            }
        },
        Scalar(_, node) {
            if (!isIdText(node.value)) return;
            node.type = Scalar.QUOTE_SINGLE;
            const name = namesById.get(node.value);
            if (name && !ownIds.has(node)) node.comment = ` ${name}`;
        },
        Seq(_, node) {
            if (isPlainValueList(node.items)) node.flow = true;
        },
    });
    if (header) doc.commentBefore = headerComment(header);
    return doc.toString({
        lineWidth: 0,
        blockQuote: 'literal',
        singleQuote: true,
        flowCollectionPadding: false,
    });
}

export function writeEntriesFile(
    path: string,
    entries: readonly Record<string, unknown>[],
    namesById: ReadonlyMap<string, string>,
    header?: string,
): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, entriesToYaml(entries, namesById, header), 'utf8');
}
