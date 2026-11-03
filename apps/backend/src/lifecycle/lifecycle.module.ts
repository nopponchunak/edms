import { Module } from '@nestjs/common';
import { SignerSnapshotSubscriber } from './signer-snapshot.subscriber';

@Module({ providers: [SignerSnapshotSubscriber] })
export class LifecycleModule {}
