import { Router, type RequestHandler, type Request } from 'express';
import { z } from 'zod';
import { AuthError, ManagementAuthStore } from './management-auth.store.js';

export const managementToken = (request: Request) => request.header('authorization')?.replace(/^Bearer /, '') || '';
export const authRoute = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(error => {
    if (error instanceof AuthError) res.status(error.status).json({ message: error.message }); else next(error);
  });
};
export function requireManagement(store: ManagementAuthStore): RequestHandler {
  return authRoute(async (req, res, next) => {
    const user = await store.userFor(managementToken(req));
    if (!user) { res.status(401).json({ message: 'Sign in with your management account' }); return; }
    res.locals.managementUser = user; next();
  });
}
const loginSchema = z.object({ username: z.string().trim().min(1).max(40), password: z.string().min(1).max(256) }).strict();
export function createManagementAuthRouter(store: ManagementAuthStore) {
  const router = Router(), attempts = new Map<string, { count: number; until: number }>();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/login', authRoute(async (req, res) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown', now = Date.now();
    for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
    const attempt = attempts.get(key) || { count: 0, until: now + 900000 };
    if (attempt.count >= 15 || attempts.size >= 10000) { res.setHeader('Retry-After', '900'); throw new AuthError('Demasiados intentos. Espera unos minutos', 429); }
    attempt.count++; attempts.set(key, attempt);
    const data = loginSchema.safeParse(req.body);
    if (!data.success) throw new AuthError('Invalid username or password');
    const session = await store.login(data.data.username, data.data.password);
    attempts.delete(key); res.json(session);
  }));
  router.use(requireManagement(store));
  router.get('/me', (_req, res) => { res.json({ user: res.locals.managementUser }); });
  router.post('/logout', authRoute(async (req, res) => { await store.logout(managementToken(req)); res.json({ ok: true }); }));
  router.post('/password', authRoute(async (req, res) => {
    const data = z.object({ currentPassword: z.string().max(256), password: z.string().min(10).max(256) }).strict().safeParse(req.body);
    if (!data.success) throw new AuthError('The new password must contain 10 to 256 characters');
    await store.changePassword(res.locals.managementUser.id, data.data.currentPassword, data.data.password); res.json({ ok: true });
  }));
  router.use('/users', (_req, res, next) => {
    if (res.locals.managementUser.role !== 'SUPER_ADMIN') { res.status(403).json({ message: 'Only the superadmin can manage users' }); return; } next();
  });
  router.get('/users', authRoute(async (_req, res) => { res.json(await store.listUsers()); }));
  router.post('/users', authRoute(async (req, res) => {
    const data = loginSchema.safeParse(req.body); if (!data.success) throw new AuthError('Invalid user data');
    res.status(201).json(await store.createUser(data.data.username, data.data.password));
  }));
  router.delete('/users/:id', authRoute(async (req, res) => { await store.deleteUser(String(req.params.id), res.locals.managementUser.id); res.json({ ok: true }); }));
  router.post('/users/:id/password', authRoute(async (req, res) => {
    const data = z.object({ password: z.string().min(10).max(256) }).strict().safeParse(req.body);
    if (!data.success) throw new AuthError('Invalid password'); await store.resetPassword(String(req.params.id), data.data.password); res.json({ ok: true });
  }));
  return router;
}
