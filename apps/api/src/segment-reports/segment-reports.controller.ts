import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  ValidationPipe,
} from '@nestjs/common';
import { SegmentReportsService } from './segment-reports.service';
import { CreateSegmentReportDto, UpdateSegmentReportDto } from './dto/segment-report.dto';

@Controller('segment-reports')
export class SegmentReportsController {
  constructor(private readonly service: SegmentReportsService) {}

  @Post()
  @HttpCode(200)
  create(@Body(new ValidationPipe()) dto: CreateSegmentReportDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':edgeId')
  findByEdge(@Param('edgeId', ParseIntPipe) edgeId: number) {
    return this.service.findByEdge(edgeId);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe()) dto: UpdateSegmentReportDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
