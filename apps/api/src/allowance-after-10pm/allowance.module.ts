import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllowanceController } from './allowance.controller';
import { AllowanceService } from './allowance.service';
import { AllowanceEntity } from './entities/allowance.entity';
import { AllowanceItemEntity } from './entities/allowance-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AllowanceEntity, AllowanceItemEntity])],
  controllers: [AllowanceController],
  providers: [AllowanceService],
})
export class AllowanceModule {}
