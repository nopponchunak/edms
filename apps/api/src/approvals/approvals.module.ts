import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllowanceEntity } from '../allowance-after-10pm/entities/allowance.entity';
import { ExpensesClaimEntity } from '../expenses-claim/entities/expenses-claim.entity';
import { CharitableContributionEntity } from '../charitable-contribution/entities/charitable-contribution.entity';
import { GiftReceivingEntity } from '../gift-hospitality-receiving/entities/gift-hospitality-receiving.entity';
import { GiftOfferingEntity } from '../gift-hospitality-offering/entities/gift-hospitality-offering.entity';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExpensesClaimEntity, AllowanceEntity, CharitableContributionEntity, GiftReceivingEntity, GiftOfferingEntity])],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
