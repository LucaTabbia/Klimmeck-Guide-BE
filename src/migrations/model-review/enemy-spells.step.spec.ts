// UNA TANTUM (Phase 19 D-12): tabella dell'abbinamento delle magie incorporate dei nemici al catalogo — esce dal repo dopo il boot reale
import { Types } from 'mongoose';
import { type CatalogSpell, matchEmbeddedSpells } from './enemy-spells.step';

const FIREBALL = new Types.ObjectId('64b000000000000000000001');
const FROST = new Types.ObjectId('64b000000000000000000002');
const TWIN_A = new Types.ObjectId('64b000000000000000000003');
const TWIN_B = new Types.ObjectId('64b000000000000000000004');
const UNKNOWN = new Types.ObjectId('64b0000000000000000000ff');

const CATALOG: CatalogSpell[] = [
    { _id: FIREBALL, name: 'Palla di fuoco' },
    { _id: FROST, name: 'Soffio gelido' },
    { _id: TWIN_A, name: 'Gemella' },
    { _id: TWIN_B, name: 'Gemella' },
];

describe('matchEmbeddedSpells', () => {
    it('matches a copy by its id when the catalogue has it (D-02)', () => {
        expect(
            matchEmbeddedSpells(
                [{ _id: FIREBALL, name: 'Palla di fuoco' }],
                CATALOG,
            ),
        ).toEqual({ ids: [FIREBALL], unmatched: [] });
    });

    it('matches a copy by its name when the id is unknown or missing (D-02)', () => {
        expect(
            matchEmbeddedSpells(
                [
                    { _id: UNKNOWN, name: 'Palla di fuoco' },
                    { name: 'Soffio gelido' },
                ],
                CATALOG,
            ),
        ).toEqual({ ids: [FIREBALL, FROST], unmatched: [] });
    });

    it('prefers the id over a different name (D-02)', () => {
        expect(
            matchEmbeddedSpells(
                [
                    { _id: FROST, name: 'Palla di fuoco' },
                    { _id: TWIN_B.toHexString(), name: 'Gemella' },
                ],
                CATALOG,
            ),
        ).toEqual({ ids: [FROST, TWIN_B], unmatched: [] });
    });

    it('leaves out a copy whose name belongs to two catalogue spells (D-02)', () => {
        expect(
            matchEmbeddedSpells([{ _id: UNKNOWN, name: 'Gemella' }], CATALOG),
        ).toEqual({ ids: [], unmatched: ['Gemella'] });
    });

    it('leaves out a copy without id and without a known name (D-02)', () => {
        expect(
            matchEmbeddedSpells(
                [{ name: 'Mai esistita' }, { description: 'senza nome' }, null],
                CATALOG,
            ),
        ).toEqual({
            ids: [],
            unmatched: ['Mai esistita', '<senza nome>', '<senza nome>'],
        });
    });

    it('keeps an element that is already a reference and drops one that is not in the catalogue (D-02)', () => {
        expect(
            matchEmbeddedSpells(
                [FROST, FIREBALL.toHexString(), UNKNOWN],
                CATALOG,
            ),
        ).toEqual({
            ids: [FROST, FIREBALL],
            unmatched: [`<riferimento ${UNKNOWN.toHexString()}>`],
        });
    });

    it('keeps the order of the copies and never repeats an id (D-02)', () => {
        expect(
            matchEmbeddedSpells(
                [
                    { name: 'Soffio gelido' },
                    { _id: FIREBALL, name: 'Palla di fuoco' },
                    FROST,
                    { _id: FROST, name: 'Soffio gelido' },
                    { _id: TWIN_A, name: 'Gemella' },
                ],
                CATALOG,
            ),
        ).toEqual({ ids: [FROST, FIREBALL, TWIN_A], unmatched: [] });
    });
});
