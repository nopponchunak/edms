import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpensesClaimController } from './expenses-claim.controller';
import { ExpensesClaimService } from './expenses-claim.service';
import { ExpensesClaimEntity } from './entities/expenses-claim.entity';
import { ExpensesClaimItemEntity } from './entities/expenses-claim-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExpensesClaimEntity, ExpensesClaimItemEntity])],
  controllers: [ExpensesClaimController],
  providers: [ExpensesClaimService],
})
export class ExpensesClaimModule {}
