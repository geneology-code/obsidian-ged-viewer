import fs from 'fs';
import { execSync } from 'child_process';

// Get the new version from the command line or increment the patch version
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifestJson = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));

// Get the latest git tag
let newVersion;
try {
    const latestTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
    const version = latestTag.startsWith('v') ? latestTag.substring(1) : latestTag;

    // Increment patch version
    const [major, minor, patch] = version.split('.').map(Number);
    newVersion = `${major}.${minor}.${patch + 1}`;
} catch (e) {
    // If no tags exist, start with 0.0.1
    newVersion = '0.0.1';
}

// Update package.json and manifest.json
packageJson.version = newVersion;
manifestJson.version = newVersion;

fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
fs.writeFileSync('manifest.json', JSON.stringify(manifestJson, null, 2));

// Create/update versions.json for obsidian
let versions = {};
if (fs.existsSync('versions.json')) {
    versions = JSON.parse(fs.readFileSync('versions.json', 'utf8'));
}
versions[newVersion] = '0.15.0'; // Minimum obsidian version
fs.writeFileSync('versions.json', JSON.stringify(versions, null, 2));
