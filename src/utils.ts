export function normalizeCoins(coins: { gold: number; silver: number; copper: number }) {
    if (coins.copper >= 100) {
        coins.silver += Math.floor(coins.copper / 100);
        coins.copper = coins.copper % 100;
    } else if (coins.copper < 0) {
        const borrow = Math.ceil(Math.abs(coins.copper) / 100);
        coins.silver -= borrow;
        coins.copper = (coins.copper % 100 + 100) % 100;
    }

    if (coins.silver >= 100) {
        coins.gold += Math.floor(coins.silver / 100);
        coins.silver = coins.silver % 100;
    } else if (coins.silver < 0) {
        const borrow = Math.ceil(Math.abs(coins.silver) / 100);
        coins.gold -= borrow;
        coins.silver = (coins.silver % 100 + 100) % 100;
    }
}