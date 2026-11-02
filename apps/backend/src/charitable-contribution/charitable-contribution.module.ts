import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CharitableContributionController } from './charitable-contribution.controller';
import { CharitableContributionService } from './charitable-contribution.service';
import { CharitableContributionEntity } from './entities/charitable-contribution.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CharitableContributionEntity])],
  controllers: [CharitableContributionController],
  providers: [CharitableContributionService],
})
export class CharitableContributionModule {}
