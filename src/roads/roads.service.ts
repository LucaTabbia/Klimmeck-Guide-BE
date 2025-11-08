import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
// Assicurati che questi import siano corretti per i tuoi modelli e librerie
import { Road, RoadDocument } from 'src/models/road.model';
import Graph from 'graphology';
import { dijkstra } from 'graphology-shortest-path';
import { PathResponse } from 'src/models/path-response.model';
import { PointOfInterestsService } from 'src/pointsOfInterest/point-of-interest.service'; // Assumi che questo sia corretto

@Injectable()
export class RoadsService implements OnModuleInit {
    private graph: Graph;

    private readonly R = 127.42;

    private readonly MAX_SNAP_DISTANCE_KM = 5;

    constructor(
        @InjectModel(Road.name) private roadModel: Model<RoadDocument>,
        private pointOfInterestsService: PointOfInterestsService
    ) { }

    async onModuleInit() {
        await this.buildGraph();
    }

    private roundCoord([lon, lat]: [number, number], precision = 7): [number, number] {
        return [
            parseFloat(lon.toFixed(precision)),
            parseFloat(lat.toFixed(precision)),
        ];
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private haversineDistance(a: [number, number], b: [number, number]): number {
        const [lon1, lat1] = a;
        const [lon2, lat2] = b;

        const latRad1 = this.toRad(lat1);
        const latRad2 = this.toRad(lat2);
        const deltaLat = this.toRad(lat2 - lat1);
        const deltaLon = this.toRad(lon2 - lon1);

        const a_haversine =
            Math.sin(deltaLat / 2) ** 2 +
            Math.cos(latRad1) * Math.cos(latRad2) *
            Math.sin(deltaLon / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a_haversine), Math.sqrt(1 - a_haversine));

        return this.R * c;
    }

    private findNearestNode([lon, lat]: [number, number]): string {
        let nearestKey: string = "";
        let minDist = Infinity;

        this.graph.forEachNode((key, attrs) => {
            const dist = this.haversineDistance([lon, lat], attrs.coord);

            if (dist < minDist && dist < this.MAX_SNAP_DISTANCE_KM) {
                minDist = dist;
                nearestKey = key;
            }
        });

        if (nearestKey === "") {
            throw new Error(`Punto troppo lontano (> ${this.MAX_SNAP_DISTANCE_KM} km) per essere agganciato alla rete stradale.`);
        }

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

                const segmentLengthKm = this.haversineDistance(startCoord, endCoord);

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
        console.log(`✅ Grafo costruito con ${graph.order} nodi e ${graph.size} archi`);
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
            console.warn(`⚠️ Snapping Start: ${nearestStart}`);
            start = nearestStart;
        }

        if (!this.graph.hasNode(end)) {
            const nearestEnd = this.findNearestNode(endCoord);
            console.warn(`⚠️ Snapping End: ${nearestEnd}`);
            end = nearestEnd;
        }


        const path = dijkstra.bidirectional(this.graph, start, end, (e, attr) => attr.weight);
        if (!path || path.length < 2) throw new Error('❌ Nessun percorso trovato tra i due punti');

        let totalLengthKm = 0;
        let totalTimeHours = 0;

        for (let i = 0; i < path.length - 1; i++) {
            const sourceNode = path[i];
            const targetNode = path[i + 1];

            const edgeKeys = this.graph.edges(sourceNode, targetNode);

            if (edgeKeys && edgeKeys.length > 0) {

                const edgeKey = edgeKeys[0];

                const { lengthKm, speedFactor } = this.graph.getEdgeAttributes(edgeKey);

                totalLengthKm += lengthKm;
                totalTimeHours += lengthKm / speedFactor;
            } else {
                console.error(`Arco non trovato tra ${sourceNode} e ${targetNode}`);
            }
        }

        return {
            distance: totalLengthKm,
            time: totalTimeHours,
        };
    }
}