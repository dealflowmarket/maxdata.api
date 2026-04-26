import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SectionDocument = Section & Document;

@Schema({ timestamps: true })
export class Section {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description_th: string;

  @Prop({ required: true })
  description_en: string;
}

export const SectionSchema = SchemaFactory.createForClass(Section);
