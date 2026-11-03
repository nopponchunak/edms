import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DesignReviewController } from './design-review.controller';
import { DesignReviewService } from './design-review.service';
import { DesignReviewEntity } from './entities/design-review.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DesignReviewEntity])],
  controllers: [DesignReviewController],
  providers: [DesignReviewService],
})
export class DesignReviewModule {}
