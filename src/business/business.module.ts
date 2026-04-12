import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BusinessController } from './business.controller';
import { BusinessService } from './business.service';
import { Business, BusinessSchema } from './business.schema';
import { Section, SectionSchema } from '../section/section.schema';
import { Tsic, TsicSchema } from '../tsic/tsic.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Business.name, schema: BusinessSchema },
            { name: Section.name, schema: SectionSchema },
            { name: Tsic.name, schema: TsicSchema },
        ]),
    ],
    controllers: [BusinessController],
    providers: [BusinessService],
    exports: [BusinessService],
})
export class BusinessModule { }
