import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/ui',workers:1,timeout:90000,expect:{timeout:15000},use:{baseURL:process.env.REGISTER_UI_BASE_URL??'http://127.0.0.1:5173',viewport:{width:1600,height:1000},screenshot:'only-on-failure',trace:'retain-on-failure'},reporter:[['list'],['json',{outputFile:'docs/evidence/ui-tests.json'}]]});
