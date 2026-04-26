/**
 * Sample Data Seeder Script
 *
 * This script creates sample data for Section, TSIC, and Business collections.
 * Run with: npx ts-node src/scripts/seed-data.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SectionService } from '../section/section.service';
import { TsicService } from '../tsic/tsic.service';
import { BusinessService } from '../business/business.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const sectionService = app.get(SectionService);
  const tsicService = app.get(TsicService);
  const businessService = app.get(BusinessService);

  try {
    console.log('🌱 Starting data seeding...\n');

    // Create Sections
    console.log('Creating sections...');
    const techSection = await sectionService.create({
      title: 'Technology',
      description_th: 'เทคโนโลยีและนวัตกรรม',
      description_en: 'Technology and Innovation',
    });

    const mfgSection = await sectionService.create({
      title: 'Manufacturing',
      description_th: 'การผลิตและอุตสาหกรรม',
      description_en: 'Manufacturing and Industry',
    });

    console.log(`✅ Created ${techSection.title} section`);
    console.log(`✅ Created ${mfgSection.title} section\n`);

    // Create TSICs
    console.log('Creating TSICs...');
    const softwareTsic = await tsicService.create({
      title: 'Software Development',
      description_th: 'การพัฒนาซอฟต์แวร์และแอปพลิเคชัน',
      description_en: 'Software and application development',
      section: (techSection as any)._id.toString(),
    });

    const foodTsic = await tsicService.create({
      title: 'Food Processing',
      description_th: 'การแปรรูปอาหารและเครื่องดื่ม',
      description_en: 'Food and beverage processing',
      section: (mfgSection as any)._id.toString(),
    });

    console.log(`✅ Created ${softwareTsic.title} TSIC`);
    console.log(`✅ Created ${foodTsic.title} TSIC\n`);

    // Create Businesses
    console.log('Creating businesses...');

    const techBusiness = await businessService.create({
      name: 'TechCorp Solutions Co., Ltd.',
      type: 'Private Limited Company',
      status: 'Active',
      businessid: 1001,
      reg_date: new Date('2018-03-15'),
      reg_cap: 5000000,
      regno_old: 'TC-2018-001',
      section: (techSection as any)._id.toString(),
      size: 'Medium',
      years: [2021, 2022, 2023],
      address: '123 Innovation Tower, Bangkok 10110',
      website: 'https://techcorp.example.com',
      directors: ['Somchai Techpreneur', 'Siriwan Innovation'],
      tsic: (softwareTsic as any)._id.toString(),

      // Financial data for 3 years (2021, 2022, 2023)
      net_trade_receivables: [1500000, 1800000, 2200000],
      inventories: [500000, 600000, 750000],
      current_assets: [3000000, 3800000, 4500000],
      land_buildings_equipment: [2000000, 2100000, 2200000],
      non_current_assets: [2500000, 2700000, 3000000],
      total_assets: [5500000, 6500000, 7500000],
      current_liabilities: [1200000, 1400000, 1600000],
      non_current_liabilities: [800000, 900000, 1000000],
      total_liabilities: [2000000, 2300000, 2600000],
      shareholders_equity: [3500000, 4200000, 4900000],
      total_liabilities_and_equity: [5500000, 6500000, 7500000],
      main_revenue: [8000000, 10000000, 12500000],
      total_revenue: [8200000, 10300000, 12800000],
      cost_of_goods_sold: [4000000, 4800000, 5800000],
      gross_profit: [4200000, 5500000, 7000000],
      selling_admin_expenses: [2500000, 3000000, 3500000],
      total_expenses: [6500000, 7800000, 9300000],
      interest_expenses: [100000, 120000, 140000],
      profit_before_tax: [1600000, 2380000, 3360000],
      income_tax: [320000, 476000, 672000],
      net_profit: [1280000, 1904000, 2688000],
    });

    const foodBusiness = await businessService.create({
      name: 'Golden Food Industries Ltd.',
      type: 'Public Limited Company',
      status: 'Active',
      businessid: 2001,
      reg_date: new Date('2015-06-20'),
      reg_cap: 20000000,
      regno_old: 'GF-2015-042',
      section: (mfgSection as any)._id.toString(),
      size: 'Large',
      years: [2021, 2022, 2023],
      address: '456 Industrial Park, Samut Prakan 10280',
      website: 'https://goldenfood.example.com',
      directors: ['Prasert Foodmaster', 'Wanida Quality', 'Chaiyong Export'],
      tsic: (foodTsic as any)._id.toString(),

      // Financial data for 3 years (2021, 2022, 2023)
      net_trade_receivables: [5000000, 6200000, 7500000],
      inventories: [8000000, 9500000, 11000000],
      current_assets: [15000000, 18000000, 21000000],
      land_buildings_equipment: [25000000, 26000000, 27500000],
      non_current_assets: [30000000, 32000000, 34000000],
      total_assets: [45000000, 50000000, 55000000],
      current_liabilities: [8000000, 9000000, 10000000],
      non_current_liabilities: [12000000, 13000000, 14000000],
      total_liabilities: [20000000, 22000000, 24000000],
      shareholders_equity: [25000000, 28000000, 31000000],
      total_liabilities_and_equity: [45000000, 50000000, 55000000],
      main_revenue: [60000000, 72000000, 85000000],
      total_revenue: [62000000, 74000000, 87000000],
      cost_of_goods_sold: [40000000, 47000000, 54000000],
      gross_profit: [22000000, 27000000, 33000000],
      selling_admin_expenses: [12000000, 14000000, 16000000],
      total_expenses: [52000000, 61000000, 70000000],
      interest_expenses: [800000, 900000, 1000000],
      profit_before_tax: [9200000, 12100000, 16000000],
      income_tax: [1840000, 2420000, 3200000],
      net_profit: [7360000, 9680000, 12800000],
    });

    console.log(`✅ Created ${techBusiness.name}`);
    console.log(`✅ Created ${foodBusiness.name}\n`);

    console.log('✨ Data seeding completed successfully!\n');
    console.log('Summary:');
    console.log('- 2 Sections created');
    console.log('- 2 TSICs created');
    console.log('- 2 Businesses created with 3 years of financial data\n');
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
  } finally {
    await app.close();
  }
}

bootstrap();
