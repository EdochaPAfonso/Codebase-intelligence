import * as path from 'path';
import { fileURLToPath } from 'url';
import { Codebase } from '../dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runExample() {
  console.log('Loading codebase-intelligence for the fixture project...\n');
  
  // Point to the fixture directory
  const projectPath = path.resolve(__dirname, '../tests/fixtures/parser-project');
  
  // 1. Load the codebase (Discovery Phase)
  const codebase = await Codebase.load(projectPath);
  console.log(`Detected Project Info:`, codebase.projectInfo());
  console.log(`Total files found: ${codebase.files().length}\n`);

  // 2. Analyze the codebase (Parsing Phase)
  console.log('Analyzing AST and building Dependency Graph...');
  await codebase.analyze();
  console.log(`Total symbols extracted: ${codebase.symbols().length}\n`);

  // 3. Queries and Intelligence
  
  // Search
  console.log('--- Search ---');
  const searchResults = codebase.search('Service');
  console.log(`Found ${searchResults.length} results for "Service":`);
  searchResults.forEach(res => console.log(`  - ${res.symbol ?? res.file} (Score: ${res.score})`));
  console.log();

  // Impact Analysis
  console.log('--- Impact Analysis ---');
  // Find the exact path for AuthService in the fixture
  const authServiceFile = codebase.files().find(f => f.relativePath === 'AuthService.ts');
  
  if (authServiceFile) {
    const impact = codebase.impact(authServiceFile.path);
    console.log(`Blast radius for modifying AuthService.ts:`);
    console.log(`  Direct dependents:   ${impact.direct.length} file(s)`);
    console.log(`  Indirect dependents: ${impact.indirect.length} file(s)`);
    console.log(`  Related test files:  ${impact.tests.length} file(s)`);
  }
}

runExample().catch(err => {
  console.error("Example failed:", err);
});
