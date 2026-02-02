#!/usr/bin/env node
/**
 * Sync jsr.json versions with package.json versions
 *
 * Usage:
 *   node scripts/sync-jsr-versions.js        # Sync all packages
 *   node scripts/sync-jsr-versions.js auth   # Sync specific package
 *   node scripts/sync-jsr-versions.js --check # Check only, don't write (for CI)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');
const packagesDir = join(rootDir, 'packages');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const specificPackage = args.find(arg => !arg.startsWith('--'));

function getPackages() {
  if (specificPackage) {
    return [specificPackage];
  }
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function syncPackage(pkgName) {
  const pkgDir = join(packagesDir, pkgName);
  const packageJsonPath = join(pkgDir, 'package.json');
  const jsrJsonPath = join(pkgDir, 'jsr.json');

  if (!existsSync(packageJsonPath)) {
    console.log(`  ⏭️  ${pkgName}: No package.json found, skipping`);
    return { skipped: true };
  }

  if (!existsSync(jsrJsonPath)) {
    console.log(`  ⏭️  ${pkgName}: No jsr.json found, skipping`);
    return { skipped: true };
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const jsrJson = JSON.parse(readFileSync(jsrJsonPath, 'utf-8'));

  const npmVersion = packageJson.version;
  const jsrVersion = jsrJson.version;

  if (npmVersion === jsrVersion) {
    console.log(`  ✅ ${pkgName}: Already in sync (${npmVersion})`);
    return { synced: false, version: npmVersion };
  }

  if (checkOnly) {
    console.log(`  ❌ ${pkgName}: Version mismatch! npm=${npmVersion}, jsr=${jsrVersion}`);
    return { mismatch: true, npm: npmVersion, jsr: jsrVersion };
  }

  // Update jsr.json with package.json version
  jsrJson.version = npmVersion;
  writeFileSync(jsrJsonPath, JSON.stringify(jsrJson, null, 2) + '\n');
  console.log(`  🔄 ${pkgName}: Updated jsr.json ${jsrVersion} → ${npmVersion}`);
  return { synced: true, from: jsrVersion, to: npmVersion };
}

function main() {
  console.log(checkOnly ? '🔍 Checking JSR versions...\n' : '🔄 Syncing JSR versions with npm...\n');

  const packages = getPackages();
  const results = [];

  for (const pkg of packages) {
    results.push({ pkg, ...syncPackage(pkg) });
  }

  console.log('');

  const mismatches = results.filter(r => r.mismatch);
  const synced = results.filter(r => r.synced);

  if (checkOnly && mismatches.length > 0) {
    console.log(`❌ Found ${mismatches.length} version mismatch(es)!`);
    console.log('   Run "pnpm sync-versions" to fix.\n');
    process.exit(1);
  }

  if (synced.length > 0) {
    console.log(`✅ Synced ${synced.length} package(s)`);
  } else if (!checkOnly) {
    console.log('✅ All versions already in sync');
  }
}

main();
