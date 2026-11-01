import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GiftReceivingEntity } from './entities/gift-hospitality-receiving.entity';
import { GiftReceivingController } from './gift-hospitality-receiving.controller';
import { GiftReceivingService } from './gift-hospitality-receiving.service';

@Module({
  imports: [TypeOrmModule.forFeature([GiftReceivingEntity])],
  controllers: [GiftReceivingController],
  providers: [GiftReceivingService],
})
export class GiftReceivingModule {}
