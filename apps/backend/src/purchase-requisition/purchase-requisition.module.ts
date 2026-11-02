import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseRequisitionEntity } from './entities/purchase-requisition.entity';
import { PurchaseRequisitionController } from './purchase-requisition.controller';
import { PurchaseRequisitionService } from './purchase-requisition.service';

@Module({
  imports: [TypeOrmModule.forFeature([PurchaseRequisitionEntity])],
  controllers: [PurchaseRequisitionController],
  providers: [PurchaseRequisitionService],
})
export class PurchaseRequisitionModule {}
