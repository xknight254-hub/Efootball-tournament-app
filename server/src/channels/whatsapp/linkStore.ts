import fs from 'fs';
import path from 'path';
import { whatsappConfig } from './config.js';

const LINKS_FILE = path.join(whatsappConfig.dataDir, 'links.json');

type Links = Record<string, number>; // phone -> userId

function read(): Links {
  try {
    return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function write(l: Links) {
  fs.mkdirSync(whatsappConfig.dataDir, { recursive: true });
  fs.writeFileSync(LINKS_FILE, JSON.stringify(l, null, 2));
}

// Phase 1 store: file-backed phone->userId mapping.
// PRODUCTION GAP: encrypt at rest + short TTL + rotation. Flagged, not solved.
export const linkStore = {
  getUserId(phone: string): number | null {
    return read()[phone] ?? null;
  },
  set(phone: string, userId: number) {
    const l = read();
    l[phone] = userId;
    write(l);
  },
  remove(phone: string) {
    const l = read();
    delete l[phone];
    write(l);
  },
};
