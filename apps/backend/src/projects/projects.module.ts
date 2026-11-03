import { Module } from '@nestjs/common';
import { PmtsClient } from './pmts.client';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsSyncService } from './projects-sync.service';

@Module({ controllers: [ProjectsController], providers: [ProjectsService, ProjectsSyncService, PmtsClient] })
export class ProjectsModule {}
