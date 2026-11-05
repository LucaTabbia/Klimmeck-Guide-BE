import { QuestType } from 'src/models/enums/quest-type.enum';
import {
    announcementOf,
    BOSS_ANNOUNCEMENTS,
    ENEMY_ANNOUNCEMENTS,
    enemyListOf,
    relatedLoreOf,
    TIME_TO_COMPLETE_MS,
    titleOf,
} from 'src/quests/generation/quest-templates';
import { SequenceChance } from '../../../test/quests/sequence-chance';

const entry = (name: string, quantity: number) => ({ name, quantity });

describe('quest templates', () => {
    it('titles an enemy quest with every enemy and the city (D-22)', () => {
        expect(
            titleOf(
                QuestType.enemy,
                [entry('Goblin', 3), entry('Capo goblin', 1)],
                'Atheland',
            ),
        ).toBe('Minaccia: 3 Goblin e 1 Capo goblin presso Atheland');
        expect(
            titleOf(
                QuestType.enemy,
                [entry('A', 2), entry('B', 1), entry('C', 4)],
                'X',
            ),
        ).toBe('Minaccia: 2 A, 1 B e 4 C presso X');
    });

    it('titles a single enemy without its quantity (D-22)', () => {
        expect(
            titleOf(QuestType.enemy, [entry('Orsogufo', 1)], 'Atheland'),
        ).toBe('Minaccia: Orsogufo presso Atheland');
        expect(enemyListOf([entry('Lupo', 4)])).toBe('4 Lupo');
    });

    it('titles a boss quest with the enemy name and the city (D-22)', () => {
        expect(titleOf(QuestType.boss, [entry('Troll', 1)], 'Atheland')).toBe(
            'Boss: Troll presso Atheland',
        );
    });

    it('picks one of three announcements per type in a patron voice (D-22)', () => {
        expect(ENEMY_ANNOUNCEMENTS).toHaveLength(3);
        expect(BOSS_ANNOUNCEMENTS).toHaveLength(3);
        const pack = [entry('Goblin', 3), entry('Capo goblin', 1)];

        [0.0, 0.4, 0.9].forEach((roll, index) => {
            const enemyText = announcementOf(
                QuestType.enemy,
                pack,
                'Atheland',
                new SequenceChance([roll]),
            );
            expect(enemyText).toBe(
                ENEMY_ANNOUNCEMENTS[index]
                    .replace('{città}', 'Atheland')
                    .replace('{nemici}', '3 Goblin e 1 Capo goblin'),
            );
            expect(enemyText).not.toContain('{');

            const bossText = announcementOf(
                QuestType.boss,
                [entry('Troll', 1)],
                'Atheland',
                new SequenceChance([roll]),
            );
            expect(bossText).toBe(
                BOSS_ANNOUNCEMENTS[index]
                    .replace('{città}', 'Atheland')
                    .replace('{nemici}', 'Troll'),
            );
            expect(bossText).not.toContain('{');
        });
    });

    it('relates the lore of the city and of the enemies without duplicates (D-22)', () => {
        expect(
            relatedLoreOf('L1', [
                { relatedLore: ['L2', 'L1'] },
                { relatedLore: ['L3'] },
            ]),
        ).toEqual(['L1', 'L2', 'L3']);
        expect(
            relatedLoreOf(null, [{ relatedLore: ['L2'] }, { relatedLore: [] }]),
        ).toEqual(['L2']);
    });

    it('takes one hour for enemy quests and three for bosses in milliseconds (D-22)', () => {
        expect(TIME_TO_COMPLETE_MS).toEqual({
            [QuestType.enemy]: 3_600_000,
            [QuestType.boss]: 10_800_000,
        });
    });
});
