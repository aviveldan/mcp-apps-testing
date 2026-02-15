import { test, expect } from '@playwright/test';
import {
  loadHostProfile,
  loadHostProfileByName,
  validateHostProfile,
  compareHostProfiles,
  getCapabilityDifferences,
} from '../src';
import * as path from 'path';

test.describe('Host Profile Management', () => {
  test('should load Claude profile from JSON', () => {
    const profilePath = path.join(__dirname, '../profiles/claude-v1.json');
    const profile = loadHostProfile(profilePath);

    expect(profile.name).toBe('Claude Desktop');
    expect(profile.version).toBe('1.0.0');
    expect(profile.protocolVersion).toBe('2024-11-05');
    expect(profile.capabilities).toBeDefined();
  });

  test('should load VS Code profile from JSON', () => {
    const profilePath = path.join(__dirname, '../profiles/vscode-v1.json');
    const profile = loadHostProfile(profilePath);

    expect(profile.name).toBe('VS Code');
    expect(profile.version).toBe('1.0.0');
    expect(profile.capabilities).toBeDefined();
  });

  test('should load profile by name', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));

    expect(profile.name).toBe('Claude Desktop');
    expect(profile.capabilities.tools).toBeDefined();
  });

  test('should validate host profile', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));
    const validation = validateHostProfile(profile);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  test('should detect invalid profile', () => {
    const invalidProfile = {
      // Missing required fields
      name: 'Test',
    } as any;

    const validation = validateHostProfile(invalidProfile);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  test('should compare two profiles', () => {
    const profile1 = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));
    const profile2 = loadHostProfileByName('vscode', '1.0.0', path.join(__dirname, '../profiles'));

    const comparison = compareHostProfiles(profile1, profile2);
    expect(comparison.identical).toBe(false);
    expect(comparison.differences.length).toBeGreaterThan(0);
  });

  test('should detect capability differences', () => {
    const profile1 = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));
    const profile2 = loadHostProfileByName('vscode', '1.0.0', path.join(__dirname, '../profiles'));

    const differences = getCapabilityDifferences(profile1, profile2);
    
    // Claude has roots capability, VS Code doesn't
    expect(differences.removed.length + differences.added.length + differences.changed.length).toBeGreaterThan(0);
  });

  test('should have documented limitations', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));

    expect(profile.limitations).toBeDefined();
    expect(Array.isArray(profile.limitations)).toBe(true);
    expect(profile.limitations!.length).toBeGreaterThan(0);
  });

  test('should have evidence-based metadata', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));

    expect(profile.recordedDate).toBeDefined();
    expect(profile.source).toBeDefined();
    expect(profile.version).toBeDefined();
    
    // Should document where the data came from
    expect(profile.source).toContain('manual testing');
  });

  test('should have theme configuration', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));

    expect(profile.theme).toBeDefined();
    expect(profile.theme.light).toBeDefined();
    expect(profile.theme.dark).toBeDefined();
    
    // Check for common CSS variables
    expect(profile.theme.light['--background']).toBeDefined();
    expect(profile.theme.dark['--background']).toBeDefined();
  });

  test('should have constraints defined', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));

    expect(profile.constraints).toBeDefined();
    expect(profile.constraints!.maxViewportWidth).toBeGreaterThan(0);
    expect(profile.constraints!.maxViewportHeight).toBeGreaterThan(0);
    expect(profile.constraints!.allowedProtocols).toBeDefined();
    expect(Array.isArray(profile.constraints!.allowedProtocols)).toBe(true);
  });

  test('should have behaviors documented', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));

    expect(profile.behaviors).toBeDefined();
    expect(profile.behaviors!.initialization).toBeDefined();
    expect(profile.behaviors!.toolCalls).toBeDefined();
  });

  test('VS Code should have different capabilities than Claude', () => {
    const claude = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));
    const vscode = loadHostProfileByName('vscode', '1.0.0', path.join(__dirname, '../profiles'));

    // Claude supports resource subscription, VS Code doesn't
    const claudeResources = claude.capabilities.resources as any;
    const vscodeResources = vscode.capabilities.resources as any;

    expect(claudeResources.subscribe).toBe(true);
    expect(vscodeResources.subscribe).toBe(false);
  });

  test('should have notes field', () => {
    const profile = loadHostProfileByName('claude', '1.0.0', path.join(__dirname, '../profiles'));

    expect(profile.notes).toBeDefined();
    expect(typeof profile.notes).toBe('string');
    expect(profile.notes!.length).toBeGreaterThan(0);
  });
});
