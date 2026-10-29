// Build script to generate tv-display.html with real env vars
// Run: node scripts/build-tv-display.js

import fs from 'fs';
import path from 'path';

const templatePath = 'public/tv-display.html';
const outputPath = 'public/tv-display.html';

const template = fs.readFileSync(templatePath, 'utf-8');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://YOUR_PROJECT.supabase.co';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

const output = template
  .replace('https://YOUR_PROJECT.supabase.co', supabaseUrl)
  .replace('YOUR_ANON_KEY', supabaseAnonKey);

fs.writeFileSync(outputPath, output);
console.log('Generated tv-display.html with real credentials');
