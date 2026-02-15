#!/usr/bin/env node

/**
 * Validate Host Profiles and Sessions
 * 
 * This script validates all host profiles and recorded sessions in the profiles/ directory.
 * Run with: node scripts/validate-profiles.js
 */

const fs = require('fs');
const path = require('path');

// Import from built distribution
const {
  validateHostProfile,
  loadHostProfile,
  SessionPlayer,
  loadSession,
} = require('../dist/index.js');

function validateProfiles() {
  console.log('🔍 Validating Host Profiles...\n');

  const profilesDir = path.join(__dirname, '../profiles');
  const profileFiles = fs.readdirSync(profilesDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'));

  let allValid = true;

  for (const file of profileFiles) {
    const filePath = path.join(profilesDir, file);
    console.log(`Checking ${file}...`);

    try {
      const profile = loadHostProfile(filePath);
      const validation = validateHostProfile(profile);

      if (!validation.valid) {
        console.error(`  ❌ INVALID`);
        validation.errors.forEach(err => console.error(`     - ${err}`));
        allValid = false;
      } else {
        console.log(`  ✅ Valid`);
        
        if (validation.warnings.length > 0) {
          console.log(`  ⚠️  Warnings:`);
          validation.warnings.forEach(warn => console.log(`     - ${warn}`));
        }
        
        // Show metadata
        console.log(`     Version: ${profile.version}`);
        console.log(`     Recorded: ${profile.recordedDate}`);
        console.log(`     Limitations: ${profile.limitations ? profile.limitations.length : 0} documented`);
      }
    } catch (error) {
      console.error(`  ❌ ERROR: ${error.message}`);
      allValid = false;
    }

    console.log();
  }

  return allValid;
}

function validateSessions() {
  console.log('🔍 Validating Recorded Sessions...\n');

  const sessionsDir = path.join(__dirname, '../profiles/sessions');
  
  if (!fs.existsSync(sessionsDir)) {
    console.log('  ⚠️  No sessions directory found');
    return true;
  }

  const sessionFiles = fs.readdirSync(sessionsDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'));

  let allValid = true;

  for (const file of sessionFiles) {
    const filePath = path.join(sessionsDir, file);
    console.log(`Checking ${file}...`);

    try {
      const sessionJson = fs.readFileSync(filePath, 'utf-8');
      const session = loadSession(sessionJson);
      const player = new SessionPlayer(session);
      const validation = player.validateSession();

      if (!validation.valid) {
        console.error(`  ❌ INVALID`);
        validation.errors.forEach(err => console.error(`     - ${err}`));
        allValid = false;
      } else {
        console.log(`  ✅ Valid`);
        console.log(`     Host: ${session.metadata.hostName}`);
        console.log(`     Protocol: ${session.metadata.protocolVersion}`);
        console.log(`     Messages: ${session.messages.length}`);
        console.log(`     Recorded: ${session.metadata.recordedDate}`);
      }
    } catch (error) {
      console.error(`  ❌ ERROR: ${error.message}`);
      allValid = false;
    }

    console.log();
  }

  return allValid;
}

function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  MCP Apps Testing - Profile & Session Validator');
  console.log('═══════════════════════════════════════════════════\n');

  const profilesValid = validateProfiles();
  const sessionsValid = validateSessions();

  console.log('═══════════════════════════════════════════════════');
  
  if (profilesValid && sessionsValid) {
    console.log('✅ All profiles and sessions are valid!');
    console.log('═══════════════════════════════════════════════════');
    process.exit(0);
  } else {
    console.log('❌ Validation failed - see errors above');
    console.log('═══════════════════════════════════════════════════');
    process.exit(1);
  }
}

main();
