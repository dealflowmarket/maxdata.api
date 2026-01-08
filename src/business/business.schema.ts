import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Tsic } from '../tsic/tsic.schema';

export type BusinessDocument = Business & Document;

@Schema({ timestamps: true })
export class Business {
    @Prop({ required: true })
    name: string;

    @Prop({ required: true })
    type: string;

    @Prop({ required: true })
    status: string;

    @Prop({ required: true })
    businessid: number;

    @Prop()
    reg_date: Date;

    @Prop()
    reg_cap: number;

    @Prop()
    regno_old: string;

    @Prop({ type: Types.ObjectId, ref: 'Section' })
    section: Types.ObjectId;

    @Prop()
    size: string;

    @Prop({ type: [Number], default: [] })
    years: number[];

    @Prop()
    address: string;

    @Prop()
    website: string;

    @Prop({ type: [String], default: [] })
    directors: string[];

    @Prop({ type: Types.ObjectId, ref: 'Tsic', required: true })
    tsic: Types.ObjectId;

    // Financial data arrays
    @Prop({ type: [Number], default: [] })
    net_trade_receivables: number[];

    @Prop({ type: [Number], default: [] })
    inventories: number[];

    @Prop({ type: [Number], default: [] })
    current_assets: number[];

    @Prop({ type: [Number], default: [] })
    land_buildings_equipment: number[];

    @Prop({ type: [Number], default: [] })
    non_current_assets: number[];

    @Prop({ type: [Number], default: [] })
    total_assets: number[];

    @Prop({ type: [Number], default: [] })
    current_liabilities: number[];

    @Prop({ type: [Number], default: [] })
    non_current_liabilities: number[];

    @Prop({ type: [Number], default: [] })
    total_liabilities: number[];

    @Prop({ type: [Number], default: [] })
    shareholders_equity: number[];

    @Prop({ type: [Number], default: [] })
    total_liabilities_and_equity: number[];

    @Prop({ type: [Number], default: [] })
    main_revenue: number[];

    @Prop({ type: [Number], default: [] })
    total_revenue: number[];

    @Prop({ type: [Number], default: [] })
    cost_of_goods_sold: number[];

    @Prop({ type: [Number], default: [] })
    gross_profit: number[];

    @Prop({ type: [Number], default: [] })
    selling_admin_expenses: number[];

    @Prop({ type: [Number], default: [] })
    total_expenses: number[];

    @Prop({ type: [Number], default: [] })
    interest_expenses: number[];

    @Prop({ type: [Number], default: [] })
    profit_before_tax: number[];

    @Prop({ type: [Number], default: [] })
    income_tax: number[];

    @Prop({ type: [Number], default: [] })
    net_profit: number[];
}

export const BusinessSchema = SchemaFactory.createForClass(Business);
