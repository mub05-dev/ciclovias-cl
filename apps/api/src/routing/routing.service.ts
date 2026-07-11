import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteRequestDto, RouteMode } from './dto/route-request.dto';
import { RouteResponseDto, SnapResultDto } from './dto/route-response.dto';

const MAX_SNAP_DISTANCE_METERS = 500;

// Lateral join that derives a quality score from TramoCalidad for each edge.
// Single quotes are doubled because this SQL runs inside a pgr_dijkstra string literal.
const ENRICHMENT_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT
      CASE type
        WHEN ''protected''  THEN 1.0
        WHEN ''painted''    THEN 1.2
        WHEN ''shared''     THEN 1.5
        WHEN ''unprotected'' THEN 2.5
      END
      * CASE condition
        WHEN ''good'' THEN 1.0
        WHEN ''fair'' THEN 1.2
        WHEN ''poor'' THEN 1.5
      END AS score
    FROM tramos_calidad
    WHERE "edgeId" = e.id
    ORDER BY created_at DESC
    LIMIT 1
  ) tc ON true`;

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
      { edge_id: number; lengthM: number; pendientePct: number | null; geom_json: string; enriched: boolean }[]
    >(`
      SELECT
        e.id AS edge_id,
        e."lengthM",
        e."pendientePct",
        ST_AsGeoJSON(e.geom)::text as geom_json,
        EXISTS (
          SELECT 1 FROM tramos_calidad WHERE "edgeId" = e.id
        ) AS enriched
      FROM pgr_dijkstra(
        'SELECT e.id, e.source, e.target,
            ${costExpression.cost} AS cost,
            ${costExpression.reverseCost} AS reverse_cost
         FROM edges e${ENRICHMENT_LATERAL}',
        $1::bigint, $2::bigint, directed := true
      ) d
      JOIN edges e ON d.edge = e.id
      ORDER BY d.seq;
    `, originSnap.nodeId, destinationSnap.nodeId);

    if (!result.length) {
      throw new NotFoundException('No route could be found between these two points. They may be in disconnected parts of the network.');
    }

    const segments = result.map((row) => ({
      edgeId: Number(row.edge_id),
      lengthMeters: row.lengthM,
      slopePercent: row.pendientePct,
      geometry: JSON.parse(row.geom_json),
      enriched: row.enriched,
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
          cost: `CASE WHEN e.oneway AND e.oneway_invertido THEN -1 ELSE e."lengthM" END`,
          reverseCost: `CASE WHEN e.oneway AND NOT e.oneway_invertido THEN -1 ELSE e."lengthM" END`,
        };
      case RouteMode.SAFE:
        return {
          cost: `CASE WHEN e.oneway AND e.oneway_invertido THEN -1 ELSE e."lengthM" * COALESCE(tc.score, e."scoreTipo") END`,
          reverseCost: `CASE WHEN e.oneway AND NOT e.oneway_invertido THEN -1 ELSE e."lengthM" * COALESCE(tc.score, e."scoreTipo") END`,
        };
      case RouteMode.FLAT:
        return {
          cost: `CASE WHEN e.oneway AND e.oneway_invertido THEN -1 ELSE e."lengthM" * (1 + GREATEST(COALESCE(e."pendientePct", 0), 0) / 5) END`,
          reverseCost: `CASE WHEN e.oneway AND NOT e.oneway_invertido THEN -1 ELSE e."lengthM" * (1 + GREATEST(COALESCE(-e."pendientePct", 0), 0) / 5) END`,
        };
      case RouteMode.BALANCED:
        return {
          // For enriched edges: type×condition score combined with slope penalty.
          // For non-enriched: fall back to precomputed scoreFinal.
          cost: `CASE WHEN e.oneway AND e.oneway_invertido THEN -1 ELSE e."lengthM" * COALESCE(tc.score * (1 + GREATEST(COALESCE(e."pendientePct", 0), 0) / 5), e."scoreFinal") END`,
          reverseCost: `CASE WHEN e.oneway AND NOT e.oneway_invertido THEN -1 ELSE e."lengthM" * COALESCE(tc.score * (1 + GREATEST(COALESCE(-e."pendientePct", 0), 0) / 5), e."scoreFinal") END`,
        };
    }
  }
}
