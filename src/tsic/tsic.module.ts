import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TsicController } from './tsic.controller';
import { TsicService } from './tsic.service';
import { Tsic, TsicSchema } from './tsic.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Tsic.name, schema: TsicSchema }]),
  ],
  controllers: [TsicController],
  providers: [TsicService],
  exports: [TsicService],
})
export class TsicModule {}
