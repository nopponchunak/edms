import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { AccessModule } from './access/access.module';
import { ExpensesClaimModule } from './expenses-claim/expenses-claim.module';
import { AllowanceModule } from './allowance-after-10pm/allowance.module';
import { UploadsModule } from './uploads/uploads.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { CommitteesModule } from './committees/committees.module';
import { PurchaseRequisitionModule } from './purchase-requisition/purchase-requisition.module';
import { GiftOfferingModule } from './gift-hospitality-offering/gift-hospitality-offering.module';
import { GiftReceivingModule } from './gift-hospitality-receiving/gift-hospitality-receiving.module';
import { CharitableContributionModule } from './charitable-contribution/charitable-contribution.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'edms'),
        password: config.get<string>('DB_PASSWORD', 'edms_dev_password'),
        database: config.get<string>('DB_NAME', 'edms'),
        autoLoadEntities: true,
        synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
        ssl: config.get<string>('DB_SSL', 'false') === 'true' ? { rejectUnauthorized: true } : false,
      }),
    }),
    HealthModule,
    CatalogModule,
    DashboardModule,
    AuthModule,
    IdentityModule,
    AccessModule,
    ExpensesClaimModule,
    AllowanceModule,
    UploadsModule,
    ApprovalsModule,
    CommitteesModule,
    CharitableContributionModule,
    GiftReceivingModule,
    GiftOfferingModule,
    PurchaseRequisitionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
