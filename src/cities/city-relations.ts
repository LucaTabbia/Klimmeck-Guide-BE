import { PopulateOptions } from 'mongoose';

// campi di City risolti dallo SDL: markerLocation è non nullable, quindi chi serve una City intera li popola tutti
export function cityRelations(): PopulateOptions[] {
    return [
        { path: 'relatedLore' },
        { path: 'markerLocation' },
        { path: 'pointsOfInterest', populate: { path: 'quest' } },
    ];
}
