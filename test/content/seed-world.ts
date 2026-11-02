import { Db, ObjectId } from 'mongodb';
import { WorldCity } from 'src/content/loading/content-tree';

// la geografia nasce fuori dai file (D-23): le int-spec la seminano dallo snapshot, con gli stessi id
export async function seedWorld(
    db: Db,
    world: readonly WorldCity[],
): Promise<void> {
    if (world.length === 0) return;
    await db.collection('cities').insertMany(
        world.map((city) => ({
            _id: new ObjectId(city.id),
            type: city.type,
            area: [],
            name: city.name,
            markerLocation: new ObjectId(city.markerLocation),
            relatedLore: city.relatedLore
                ? new ObjectId(city.relatedLore)
                : null,
            pointsOfInterest: city.pointsOfInterest.map(
                (poi) => new ObjectId(poi.id),
            ),
        })),
    );
    const pois = world.flatMap((city) =>
        city.pointsOfInterest.map((poi) => ({
            _id: new ObjectId(poi.id),
            type: [...poi.type],
            location: [...poi.location],
            city: new ObjectId(city.id),
            quest: null,
        })),
    );
    if (pois.length > 0) {
        await db.collection('pointsofinterest').insertMany(pois);
    }
}
