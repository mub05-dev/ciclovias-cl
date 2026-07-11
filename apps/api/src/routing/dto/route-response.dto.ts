export class SnapResultDto {
  nodeId: number;
  distanceMeters: number;
}

export class RouteSegmentDto {
  edgeId: number;
  lengthMeters: number;
  slopePercent: number | null;
  enriched: boolean;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export class RouteResponseDto {
  mode: string;
  distanceMeters: number;
  segments: number;
  segmentDetails: RouteSegmentDto[];
  originSnap: SnapResultDto;
  destinationSnap: SnapResultDto;
}