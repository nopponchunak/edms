import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftOfferingEntity } from './entities/gift-hospitality-offering.entity';
import { GiftOfferingController } from './gift-hospitality-offering.controller';
import { GiftOfferingService } from './gift-hospitality-offering.service';

@Module({
  imports: [TypeOrmModule.forFeature([GiftOfferingEntity])],
  controllers: [GiftOfferingController],
  providers: [GiftOfferingService],
})
export class GiftOfferingModule {}
