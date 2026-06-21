export class SnapResultDto {
  nodeId: number;
  distanceMeters: number;
}

export class RouteResponseDto {
  mode: string;
  distanceMeters: number;
  segments: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  originSnap: SnapResultDto;
  destinationSnap: SnapResultDto;
}