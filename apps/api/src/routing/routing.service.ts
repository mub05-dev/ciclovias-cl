import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteRequestDto, RouteMode } from './dto/route-request.dto';
import { RouteResponseDto, SnapResultDto } from './dto/route-response.dto';

const MAX_SNAP_DISTANCE_METERS = 500;

@Injectable()
export class RoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateRoute(request: RouteRequestDto): Promise<RouteResponseDto> {
    const originSnap = await this.snapToNearestNode(
      request.origin.lon,
      request.origin.lat,
    );
    const destinationSnap = await this.snapToNearestNode(
      request.destination.lon,
      request.destination.lat,
    );

    if (originSnap.nodeId === destinationSnap.nodeId) {
      throw new BadRequestException(
        'Origin and destination resolve to the same network node.',
      );
    }

    if (originSnap.distanceMeters > MAX_SNAP_DISTANCE_METERS) {
      throw new BadRequestException(
        `Origin point is too far from the known road network (${originSnap.distanceMeters.toFixed(0)}m away).`,
      );
    }
    if (destinationSnap.distanceMeters > MAX_SNAP_DISTANCE_METERS) {
      throw new BadRequestException(
        `Destination point is too far from the known road network (${destinationSnap.distanceMeters.toFixed(0)}m away).`,
      );
    }

    const costExpression = this.getCostExpression(request.mode);

    const result = await this.prisma.$queryRawUnsafe<
      { lengthM: number; pendientePct: number | null; geom_json: string }[]
    >(`
      SELECT
        e."lengthM",
        e."pendientePct",
        ST_AsGeoJSON(e.geom)::text as geom_json
      FROM pgr_dijkstra(
        'SELECT id, source, target,
            ${costExpression.cost} AS cost,
            ${costExpression.reverseCost} AS reverse_cost
         FROM edges',
        $1::bigint, $2::bigint, directed := true
      ) d
      JOIN edges e ON d.edge = e.id
      ORDER BY d.seq;
    `, originSnap.nodeId, destinationSnap.nodeId);

    if (!result.length) {
      throw new NotFoundException('No route could be found between these two points. They may be in disconnected parts of the network.');
    }

    const segments = result.map((row) => ({
      lengthMeters: row.lengthM,
      slopePercent: row.pendientePct,
      geometry: JSON.parse(row.geom_json),
    }));

    const distanceMeters = result.reduce((sum, row) => sum + row.lengthM, 0);

    return {
      mode: request.mode,
      distanceMeters: Math.round(distanceMeters),
      segments: segments.length,
      segmentDetails: segments,
      originSnap,
      destinationSnap,
    };
  }

  private async snapToNearestNode(
    lon: number,
    lat: number,
  ): Promise<SnapResultDto> {
    const result = await this.prisma.$queryRawUnsafe<
      { nodo_id: bigint; distancia_metros: number }[]
    >(`SELECT * FROM snap_to_nearest_node($1, $2);`, lon, lat);

    if (!result.length) {
      throw new NotFoundException(
        'Could not find any node near the given coordinates.',
      );
    }

    return {
      nodeId: Number(result[0].nodo_id),
      distanceMeters: result[0].distancia_metros,
    };
  }

  private getCostExpression(mode: RouteMode): {
    cost: string;
    reverseCost: string;
  } {
    switch (mode) {
      case RouteMode.SHORT:
        return {
          cost: `CASE WHEN oneway AND oneway_invertido THEN -1 ELSE "lengthM" END`,
          reverseCost: `CASE WHEN oneway AND NOT oneway_invertido THEN -1 ELSE "lengthM" END`,
        };
      case RouteMode.SAFE:
        return {
          cost: `CASE WHEN oneway AND oneway_invertido THEN -1 ELSE "lengthM" * "scoreTipo" END`,
          reverseCost: `CASE WHEN oneway AND NOT oneway_invertido THEN -1 ELSE "lengthM" * "scoreTipo" END`,
        };
      case RouteMode.FLAT:
        return {
          cost: `CASE WHEN oneway AND oneway_invertido THEN -1 ELSE "lengthM" * (1 + GREATEST(COALESCE("pendientePct", 0), 0) / 5) END`,
          reverseCost: `CASE WHEN oneway AND NOT oneway_invertido THEN -1 ELSE "lengthM" * (1 + GREATEST(COALESCE(-"pendientePct", 0), 0) / 5) END`,
        };
      case RouteMode.BALANCED:
        return {
          cost: `CASE WHEN oneway AND oneway_invertido THEN -1 ELSE "lengthM" * "scoreFinal" END`,
          reverseCost: `CASE WHEN oneway AND NOT oneway_invertido THEN -1 ELSE "lengthM" * "scoreFinal" END`,
        };
    }
  }
}
