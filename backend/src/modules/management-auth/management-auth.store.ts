import { createHash, randomBytes, randomUUID, scrypt as derive, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export type ManagementUser = { id: string; username: string; role: 'SUPER_ADMIN' | 'MANAGER' };
type Account = ManagementUser & { passwordHash: string };
type State = { users: Account[]; sessions: Array<{ hash: string; userId: string; expiresAt: number }> };
export class AuthError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
const publicUser = ({ id, username, role }: ManagementUser): ManagementUser => ({ id, username, role });
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function validUsername(value: string) { return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}$/.test(value); }
export async function passwordHash(password: string): Promise<string> {
  if (password.length < 10 || password.length > 256) throw new AuthError('The password must contain 10 to 256 characters');
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await scrypt(password, salt, 64) as Buffer).toString('hex')}`;
}
async function verify(password: string, encoded: string) {
  if (password.length > 256) return false;
  if (/^[a-f0-9]{64}$/.test(encoded)) return equal(digest(password), encoded); // Migrated legacy display account.
  const [algorithm, salt, hash] = encoded.split(':');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  return equal((await scrypt(password, salt, 64) as Buffer).toString('hex'), hash);
}

/** One persistent account directory for management apps and display administration. */
export class ManagementAuthStore {
  private queue: Promise<unknown> = Promise.resolve();
  readonly file: string;
  constructor(directory: string) { this.file = path.join(directory, 'management-users.json'); }
  async initialize(legacy?: { username: string; passwordHash: string }, bootstrapUsername = 'admin') {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    let exists = false;
    try { await fs.access(this.file); exists = true; } catch { /* First migration. */ }
    if (exists) {
      // A first boot without credentials can be completed later; never reset an active account.
      const configured = process.env.MANAGEMENT_BOOTSTRAP_PASSWORD;
      if (configured) await this.mutate(async state => {
        const owner = state.users.find(u => u.role === 'SUPER_ADMIN');
        if (owner && !owner.passwordHash) owner.passwordHash = await passwordHash(configured);
      });
      return;
    }
    const username = process.env.MANAGEMENT_BOOTSTRAP_USERNAME?.trim() || bootstrapUsername;
    if (!validUsername(username)) throw new AuthError('Invalid initial username');
    const configured = process.env.MANAGEMENT_BOOTSTRAP_PASSWORD;
    // No known default password. Existing installations retain their display password.
    const hash = configured ? await passwordHash(configured)
      : legacy && legacy.passwordHash !== digest('admin') ? legacy.passwordHash : '';
    await this.write({ users: [{ id: randomUUID(), username, role: 'SUPER_ADMIN', passwordHash: hash }], sessions: [] });
  }
  private async read(): Promise<State> { return JSON.parse(await fs.readFile(this.file, 'utf8')); }
  private async write(state: State) {
    const temp = this.file + '.' + randomUUID() + '.tmp';
    try {
      await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600 });
      await fs.rename(temp, this.file);
    } finally { await fs.rm(temp, { force: true }); }
  }
  private mutate<T>(change: (state: State) => T | Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const state = await this.read();
      state.sessions = state.sessions.filter(s => s.expiresAt > Date.now());
      const value = await change(state); await this.write(state); return value;
    });
    this.queue = result.catch(() => undefined); return result;
  }
  async login(username: string, password: string) {
    return this.mutate(async state => {
      const account = state.users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
      if (!account || !account.passwordHash || !await verify(password, account.passwordHash)) throw new AuthError('Incorrect username or password', 401);
      // Upgrade SHA-256 hashes on first successful authentication, without storing plaintext.
      if (!account.passwordHash.startsWith('scrypt:')) {
        const salt = randomBytes(16).toString('hex');
        account.passwordHash = `scrypt:${salt}:${(await scrypt(password, salt, 64) as Buffer).toString('hex')}`;
      }
      const token = randomBytes(32).toString('hex'), expiresAt = Date.now() + 30 * 86400000;
      if (state.sessions.length >= 1000) state.sessions.shift();
      state.sessions.push({ hash: digest(token), userId: account.id, expiresAt });
      return { token, expiresAt, user: publicUser(account) };
    });
  }
  async userFor(token: string): Promise<ManagementUser | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const state = await this.read(), session = state.sessions.find(s => s.hash === digest(token) && s.expiresAt > Date.now());
    const user = session && state.users.find(u => u.id === session.userId);
    return user ? publicUser(user) : null;
  }
  async logout(token: string) { await this.mutate(s => { s.sessions = s.sessions.filter(v => v.hash !== digest(token)); }); }
  async listUsers() { return (await this.read()).users.map(publicUser); }
  async createUser(username: string, password: string) {
    username = username.trim();
    if (!validUsername(username)) throw new AuthError('Use 3 to 40 letters, numbers, dots, hyphens or underscores');
    const hash = await passwordHash(password);
    return this.mutate(state => {
      if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new AuthError('That username already exists', 409);
      if (state.users.length >= 500) throw new AuthError('The user limit has been reached', 409);
      const user: Account = { id: randomUUID(), username, role: 'MANAGER', passwordHash: hash }; state.users.push(user); return publicUser(user);
    });
  }
  async deleteUser(id: string, actorId: string) {
    await this.mutate(state => {
      const user = state.users.find(u => u.id === id);
      if (!user) throw new AuthError('User not found', 404);
      if (id === actorId || user.role === 'SUPER_ADMIN') throw new AuthError('The superadmin cannot be deleted', 409);
      state.users = state.users.filter(u => u.id !== id); state.sessions = state.sessions.filter(s => s.userId !== id);
    });
  }
  async changePassword(id: string, current: string, next: string) {
    const hash = await passwordHash(next);
    await this.mutate(async state => {
      const user = state.users.find(u => u.id === id);
      if (!user) throw new AuthError('The session is no longer available', 401);
      // A mistyped current password does not revoke the authenticated session.
      if (!await verify(current, user.passwordHash)) throw new AuthError('Current password is incorrect', 400);
      user.passwordHash = hash; state.sessions = state.sessions.filter(s => s.userId !== id);
    });
  }
  async resetPassword(id: string, password: string) {
    const hash = await passwordHash(password);
    await this.mutate(state => {
      const user = state.users.find(u => u.id === id);
      if (!user || user.role === 'SUPER_ADMIN') throw new AuthError('Use the password change option in your account', 409);
      user.passwordHash = hash; state.sessions = state.sessions.filter(s => s.userId !== id);
    });
  }
}
