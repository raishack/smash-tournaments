import { readFileSync, writeFileSync } from 'node:fs';

// Isolate the networking and account implementation so both can be tested
// on macOS without loading SwiftUI or contacting the production backend.
const source = readFileSync(new URL('../ios-manage/TournamentManagerIOS/DataLayer.swift', import.meta.url), 'utf8');
const start = source.indexOf('enum ManagementAPIError:');
const end = source.indexOf('final class TournamentManagementRepository');
if (start < 0 || end <= start || !process.argv[2]) throw new Error('Usage: node scripts/prepare-ios-api-check.mjs output.swift');
const checks = readFileSync(new URL('../ios-manage/tests/ManagementAPIClientChecks.swift', import.meta.url), 'utf8');
const account = source.slice(source.indexOf('struct ManagementUser:'), source.indexOf('enum ManagementSettingsStore'))
  .replace('static let shared = ManagementAccount()', 'static let shared = ManagementAccount(storage: MemorySessionStorage())');
writeFileSync(process.argv[2], 'import Foundation\nimport Combine\nimport Security\n' + account + source.slice(start, end) + '\n' + checks);
