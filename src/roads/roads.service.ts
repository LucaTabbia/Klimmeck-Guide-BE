import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Road, RoadDocument } from 'src/models/road.model';
import Graph from 'graphology';
import { dijkstra } from 'graphology-shortest-path';
import {
    collapsePoints,
    compareIds,
    LonLat,
    NearestRoute,
    RoadRoute,
    RouteEdge,
    routeOf,
    RouteTarget,
} from './road-route';
import { gameDistanceKm } from './game-distance';
import { PathResponse } from 'src/models/path-response.model';
import { PointOfInterestsService } from 'src/pointsOfInterest/point-of-interest.service';

@Injectable()
export class RoadsService implements OnModuleInit {
    private readonly logger = new Logger(RoadsService.name);
    private graph: Graph;

    private readonly MAX_SNAP_DISTANCE_KM = 5;

    constructor(
        @InjectModel(Road.name) private roadModel: Model<RoadDocument>,
        private pointOfInterestsService: PointOfInterestsService,
    ) {}

    async onModuleInit() {
        await this.buildGraph();
    }

    private roundCoord(
        [lon, lat]: [number, number],
        precision = 7,
    ): [number, number] {
        return [
            parseFloat(lon.toFixed(precision)),
            parseFloat(lat.toFixed(precision)),
        ];
    }

    private findNearestNode([lon, lat]: [number, number]): string {
        const nearestKey = this.nearestNodeWithinSnap([lon, lat]);

        if (nearestKey === null) {
            throw new Error(
                `Punto troppo lontano (> ${this.MAX_SNAP_DISTANCE_KM} km) per essere agganciato alla rete stradale.`,
            );
        }

        return nearestKey;
    }

    private nearestNodeWithinSnap(coord: LonLat): string | null {
        let nearestKey: string | null = null;
        let minDist = Infinity;

        this.graph.forEachNode((key, attrs) => {
            const dist = gameDistanceKm(coord, attrs.coord as LonLat);

            if (dist < minDist && dist < this.MAX_SNAP_DISTANCE_KM) {
                minDist = dist;
                nearestKey = key;
            }
        });

        return nearestKey;
    }

    async buildGraph() {
        const roads: Road[] = await this.roadModel.find().exec();
        const graph = new Graph({ type: 'undirected', multi: true });

        for (const road of roads) {
            const coords = road.coordinates.map((c) => this.roundCoord(c, 7));

            for (let i = 0; i < coords.length - 1; i++) {
                const startCoord = coords[i];
                const endCoord = coords[i + 1];

                const startKey = startCoord.join(',');
                const endKey = endCoord.join(',');

                if (!graph.hasNode(startKey)) {
                    graph.addNode(startKey, { coord: startCoord });
                }
                if (!graph.hasNode(endKey)) {
                    graph.addNode(endKey, { coord: endCoord });
                }

                const segmentLengthKm = gameDistanceKm(startCoord, endCoord);

                const speedFactor = road.speedFactor || 1;
                const weight = segmentLengthKm / speedFactor;

                graph.addEdge(startKey, endKey, {
                    weight,
                    roadId: road.id,
                    lengthKm: segmentLengthKm,
                    speedFactor: speedFactor,
                });
            }
        }

        this.graph = graph;
        this.logger.log(
            `Grafo costruito con ${graph.order} nodi e ${graph.size} archi`,
        );
    }

    async getShortestPath(from: string, to: string): Promise<PathResponse> {
        if (!this.graph) throw new Error('Graph not built yet');

        const fromPOI = await this.pointOfInterestsService.findOne(from);
        const toPOI = await this.pointOfInterestsService.findOne(to);

        const startCoord = this.roundCoord(fromPOI.location, 7);
        const endCoord = this.roundCoord(toPOI.location, 7);

        let start = startCoord.join(',');
        let end = endCoord.join(',');

        if (!this.graph.hasNode(start)) {
            const nearestStart = this.findNearestNode(startCoord);
            start = nearestStart;
        }

        if (!this.graph.hasNode(end)) {
            const nearestEnd = this.findNearestNode(endCoord);
            end = nearestEnd;
        }

        const path = dijkstra.bidirectional(
            this.graph,
            start,
            end,
            (e, attr) => attr.weight,
        );
        if (!path || path.length < 2)
            throw new Error('Nessun percorso trovato tra i due punti');

        let totalLengthKm = 0;
        let totalTimeHours = 0;

        for (let i = 0; i < path.length - 1; i++) {
            const sourceNode = path[i];
            const targetNode = path[i + 1];

            const edgeKeys = this.graph.edges(sourceNode, targetNode);

            if (edgeKeys && edgeKeys.length > 0) {
                const edgeKey = edgeKeys[0];

                const { lengthKm, speedFactor } =
                    this.graph.getEdgeAttributes(edgeKey);

                totalLengthKm += lengthKm;
                totalTimeHours += lengthKm / speedFactor;
            } else {
                this.logger.error(
                    `Arco non trovato tra ${sourceNode} e ${targetNode}`,
                );
            }
        }

        return {
            distance: totalLengthKm,
            time: totalTimeHours,
        };
    }

    // null = nessun percorso (D-03, D-04): mai eccezioni, a differenza di getShortestPath; stesso nodo = viaggio nullo = nessun percorso
    routeBetween(from: LonLat, to: LonLat): RoadRoute | null {
        if (!this.graph) return null;
        const start = this.nodeFor(from);
        const end = this.nodeFor(to);
        if (!start || !end || start === end) return null;
        const nodes = dijkstra.bidirectional(
            this.graph,
            start,
            end,
            (_edge, attributes) => attributes.weight as number,
        );
        if (!nodes || nodes.length < 2) return null;
        return routeOf(
            nodes,
            (a, b) => this.lightestEdge(a, b),
            (node) => this.graph.getNodeAttribute(node, 'coord') as LonLat,
            from,
            to,
        );
    }

    // un solo singleSource dal punto (D-11, ~6 ms sul grafo reale): la velocità del personaggio è uno scalare uniforme e non cambia la scelta, entra solo nella durata
    nearestByTime(
        from: LonLat,
        targets: readonly RouteTarget[],
        fallbacks: readonly LonLat[] = [],
    ): NearestRoute | null {
        if (!this.graph) return null;
        const start = this.startNodeFor(from, fallbacks);
        if (!start) return null;
        const paths = dijkstra.singleSource(
            this.graph,
            start,
            (_edge, attributes) => attributes.weight as number,
        );
        let best: NearestRoute | null = null;
        for (const target of [...targets].sort((a, b) =>
            compareIds(a.id, b.id),
        )) {
            const route = this.routeAlong(paths, start, from, target.location);
            if (route && (!best || route.baseHours < best.route.baseHours)) {
                best = { id: target.id, route };
            }
        }
        return best;
    }

    // il punto, poi i vertici della polilinea in ordine di preferenza (C7)
    private startNodeFor(
        from: LonLat,
        fallbacks: readonly LonLat[],
    ): string | null {
        const snapped = this.nodeFor(from);
        if (snapped) return snapped;
        for (const fallback of fallbacks) {
            const node = this.nodeFor(fallback);
            if (node) return node;
        }
        return null;
    }

    // stesso nodo della partenza = deviazione lunga zero (C7)
    private routeAlong(
        paths: Record<string, string[]>,
        start: string,
        from: LonLat,
        to: LonLat,
    ): RoadRoute | null {
        const end = this.nodeFor(to);
        if (!end || !paths[end]) return null;
        if (end === start) {
            return {
                coordinates: collapsePoints([from, to]),
                distanceKm: 0,
                baseHours: 0,
            };
        }
        return routeOf(
            paths[end],
            (a, b) => this.lightestEdge(a, b),
            (node) => this.graph.getNodeAttribute(node, 'coord') as LonLat,
            from,
            to,
        );
    }

    private nodeFor(coord: LonLat): string | null {
        const key = this.roundCoord(coord).join(',');
        return this.graph.hasNode(key)
            ? key
            : this.nearestNodeWithinSnap(coord);
    }

    // fra archi paralleli del multigrafo quello di peso minimo, lo stesso scelto da Dijkstra (C4)
    private lightestEdge(a: string, b: string): RouteEdge | null {
        let lightest: RouteEdge | null = null;
        let minWeight = Infinity;

        for (const edge of this.graph.edges(a, b)) {
            const { weight, lengthKm, speedFactor } =
                this.graph.getEdgeAttributes(edge);
            if ((weight as number) < minWeight) {
                minWeight = weight as number;
                lightest = {
                    lengthKm: lengthKm as number,
                    speedFactor: speedFactor as number,
                };
            }
        }

        return lightest;
    }
}
