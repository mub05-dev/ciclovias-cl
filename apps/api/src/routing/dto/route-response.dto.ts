export class SnapResultDto {
  nodeId: number;
  distanceMeters: number;
}

export class RouteSegmentDto {
  lengthMeters: number;
  slopePercent: number | null;
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