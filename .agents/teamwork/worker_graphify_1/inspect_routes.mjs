import fs from 'node:fs';
import path from 'node:path';

function getFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(getFiles(full));
    } else if (entry.name === 'route.ts') {
      results.push(full);
    }
  }
  return results;
}

const apiRoutes = getFiles('src/app/api');
const routeDetails = [];

for (const f of apiRoutes) {
  const content = fs.readFileSync(f, 'utf8');
  const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
  const routePath = '/' + path.dirname(rel.replace(/^src\/app\//, ''));
  
  const methods = [];
  if (content.includes('export async function GET') || content.includes('export function GET')) methods.push('GET');
  if (content.includes('export async function POST') || content.includes('export function POST')) methods.push('POST');
  if (content.includes('export async function DELETE') || content.includes('export function DELETE')) methods.push('DELETE');
  if (content.includes('export async function PUT') || content.includes('export function PUT')) methods.push('PUT');
  if (content.includes('export async function PATCH') || content.includes('export function PATCH')) methods.push('PATCH');

  const imports = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.startsWith('import ') && line.includes('from ')) {
      const match = line.match(/from\s+['"]([^'"]+)['"]/);
      if (match) imports.push(match[1]);
    }
  }

  routeDetails.push({ routePath, file: rel, methods, imports });
}

console.log(JSON.stringify(routeDetails, null, 2));
