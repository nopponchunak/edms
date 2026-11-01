import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { DashboardController } from './dashboard.controller';

@Module({ imports: [CatalogModule], controllers: [DashboardController] })
export class DashboardModule {}
