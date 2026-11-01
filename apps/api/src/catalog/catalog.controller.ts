import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CatalogPrincipal, CatalogService } from './catalog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('catalog')
@UseGuards(JwtAuthGuard)
@Controller('modules')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiQuery({ name: 'category', required: false })
  list(@Req() request: { user: CatalogPrincipal }, @Query('category') category?: string) {
    return this.catalog.list(category, request.user);
  }

  @Get('categories')
  categories(@Req() request: { user: CatalogPrincipal }) {
    return this.catalog.categories(request.user);
  }
}
