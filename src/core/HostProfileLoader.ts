/**
 * HostProfileLoader - Loads and manages versioned host profiles
 * 
 * This module provides utilities to load evidence-based host profiles
 * from JSON files, enabling versioned and documented host simulations.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface VersionedHostProfile {
  version: string;
  recordedDate: string;
  source: string;
  name: string;
  hostVersion?: string;
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  theme: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
  constraints?: {
    maxViewportWidth?: number;
    maxViewportHeight?: number;
    allowedProtocols?: string[];
  };
  behaviors?: {
    initialization?: Record<string, unknown>;
    toolCalls?: Record<string, unknown>;
    resources?: Record<string, unknown>;
    prompts?: Record<string, unknown>;
  };
  limitations?: string[];
  notes?: string;
}

/**
 * Load a host profile from JSON file
 */
export function loadHostProfile(filePath: string): VersionedHostProfile {
  const jsonString = fs.readFileSync(filePath, 'utf-8');
  const profile = JSON.parse(jsonString) as VersionedHostProfile;

  // Validate required fields
  if (!profile.name || !profile.protocolVersion || !profile.capabilities) {
    throw new Error('Invalid host profile: missing required fields');
  }

  return profile;
}

/**
 * Load a host profile by name and version
 */
export function loadHostProfileByName(
  name: string,
  version: string = '1.0.0',
  profilesDir?: string
): VersionedHostProfile {
  const dir = profilesDir || path.join(__dirname, '../../profiles');
  const fileName = `${name.toLowerCase()}-v${version.split('.')[0]}.json`;
  const filePath = path.join(dir, fileName);

  return loadHostProfile(filePath);
}

/**
 * Compare two host profiles for differences
 */
export function compareHostProfiles(
  profile1: VersionedHostProfile,
  profile2: VersionedHostProfile
): {
  identical: boolean;
  differences: string[];
} {
  const differences: string[] = [];

  // Compare basic fields
  if (profile1.name !== profile2.name) {
    differences.push(`Name differs: ${profile1.name} vs ${profile2.name}`);
  }

  if (profile1.protocolVersion !== profile2.protocolVersion) {
    differences.push(
      `Protocol version differs: ${profile1.protocolVersion} vs ${profile2.protocolVersion}`
    );
  }

  // Compare capabilities
  const caps1 = JSON.stringify(profile1.capabilities);
  const caps2 = JSON.stringify(profile2.capabilities);
  if (caps1 !== caps2) {
    differences.push('Capabilities differ');
  }

  // Compare constraints
  const constraints1 = JSON.stringify(profile1.constraints || {});
  const constraints2 = JSON.stringify(profile2.constraints || {});
  if (constraints1 !== constraints2) {
    differences.push('Constraints differ');
  }

  // Compare behaviors
  const behaviors1 = JSON.stringify(profile1.behaviors || {});
  const behaviors2 = JSON.stringify(profile2.behaviors || {});
  if (behaviors1 !== behaviors2) {
    differences.push('Behaviors differ');
  }

  return {
    identical: differences.length === 0,
    differences,
  };
}

/**
 * Validate a host profile
 */
export function validateHostProfile(profile: VersionedHostProfile): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!profile.name) {
    errors.push('Missing name field');
  }

  if (!profile.protocolVersion) {
    errors.push('Missing protocolVersion field');
  }

  if (!profile.capabilities) {
    errors.push('Missing capabilities field');
  }

  if (!profile.theme) {
    errors.push('Missing theme field');
  } else {
    if (!profile.theme.light) {
      errors.push('Missing theme.light field');
    }
    if (!profile.theme.dark) {
      errors.push('Missing theme.dark field');
    }
  }

  // Check optional but recommended fields
  if (!profile.version) {
    warnings.push('Missing version field');
  }

  if (!profile.recordedDate) {
    warnings.push('Missing recordedDate field');
  }

  if (!profile.source) {
    warnings.push('Missing source field');
  }

  if (!profile.limitations || profile.limitations.length === 0) {
    warnings.push('No limitations documented');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get the difference in capabilities between two profiles
 */
export function getCapabilityDifferences(
  profile1: VersionedHostProfile,
  profile2: VersionedHostProfile
): {
  added: string[];
  removed: string[];
  changed: string[];
} {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  const caps1 = profile1.capabilities;
  const caps2 = profile2.capabilities;

  // Check for added/removed capabilities
  for (const key of Object.keys(caps2)) {
    if (!(key in caps1)) {
      added.push(key);
    }
  }

  for (const key of Object.keys(caps1)) {
    if (!(key in caps2)) {
      removed.push(key);
    }
  }

  // Check for changed capabilities
  for (const key of Object.keys(caps1)) {
    if (key in caps2) {
      const val1 = JSON.stringify(caps1[key]);
      const val2 = JSON.stringify(caps2[key]);
      if (val1 !== val2) {
        changed.push(key);
      }
    }
  }

  return { added, removed, changed };
}
