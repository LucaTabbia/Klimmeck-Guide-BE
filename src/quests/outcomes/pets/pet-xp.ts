// quota degli xp dei nemici che va al compagno equipaggiato (Phase 19 D-04): costante di codice, nessuna variabile d'ambiente
export const PET_XP_SHARE = 0.1;

export interface PetXpAward {
    xp: number;
    gained: number;
}

// il catalogo è contenuto non validato: un tetto non intero o non positivo vale nessun premio (D-17)
export const isPetXpCap = (maxXp: unknown): maxXp is number =>
    typeof maxXp === 'number' && Number.isSafeInteger(maxXp) && maxXp > 0;

const shareOf = (enemiesXp: number): number =>
    Number.isFinite(enemiesXp)
        ? Math.round(Math.max(0, enemiesXp) * PET_XP_SHARE)
        : 0;

// gained è il guadagno effettivo dopo il tetto (D-17); gli xp già sopra il tetto non scendono mai (D-04)
export function petXpAward(
    enemiesXp: number,
    currentXp: number,
    maxXp: number,
): PetXpAward {
    if (!isPetXpCap(maxXp)) return { xp: currentXp, gained: 0 };
    const xp = Math.max(
        currentXp,
        Math.min(maxXp, currentXp + shareOf(enemiesXp)),
    );
    return { xp, gained: xp - currentXp };
}
