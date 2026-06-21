import { Body, Controller, HttpCode, Post, ValidationPipe } from '@nestjs/common';
import { RoutingService } from './routing.service';
import { RouteRequestDto } from './dto/route-request.dto';
import { RouteResponseDto } from './dto/route-response.dto';

@Controller('route')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Post()
  @HttpCode(200)
  async getRoute(
    @Body(new ValidationPipe({ transform: true })) request: RouteRequestDto,
  ): Promise<RouteResponseDto> {
    return this.routingService.calculateRoute(request);
  }
}