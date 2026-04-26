import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Section } from '../section/section.schema';

export type TsicDocument = Tsic & Document;

@Schema({ timestamps: true })
export class Tsic {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description_th: string;

  @Prop({ required: true })
  description_en: string;

  @Prop({ type: Types.ObjectId, ref: 'Section', required: true })
  section: Types.ObjectId;
}

export const TsicSchema = SchemaFactory.createForClass(Tsic);
