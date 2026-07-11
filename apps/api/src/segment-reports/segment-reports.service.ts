import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSegmentReportDto, UpdateSegmentReportDto } from './dto/segment-report.dto';

@Injectable()
export class SegmentReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSegmentReportDto) {
    return this.prisma.tramoCalidad.create({ data: dto });
  }

  async findAll() {
    return this.prisma.tramoCalidad.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findByEdge(edgeId: number) {
    return this.prisma.tramoCalidad.findMany({
      where: { edgeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: number, dto: UpdateSegmentReportDto) {
    await this.findOneOrThrow(id);
    return this.prisma.tramoCalidad.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOneOrThrow(id);
    return this.prisma.tramoCalidad.delete({ where: { id } });
  }

  private async findOneOrThrow(id: number) {
    const report = await this.prisma.tramoCalidad.findUnique({ where: { id } });
    if (!report) throw new NotFoundException(`Segment report ${id} not found.`);
    return report;
  }
}
