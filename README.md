# GrowVibe CRM

Monorepo (pnpm) · `apps/web` (Next.js 15) · `apps/worker` (BullMQ) · `packages/core` · `packages/db` · `supabase/`.

## Puesta en marcha

1. `cp .env.example .env` y llena las variables (`DATABASE_URL`, `REDIS_URL`, `APP_URL`…).
2. `pnpm install`

### Base de datos (Postgres directo)

La app se conecta a Postgres con `DATABASE_URL` (como la otra app del servidor). Todo vive en el esquema `growvibe`.
No se usa la API ni el login de Supabase: el login es propio (bcrypt + cookie de sesión) y los permisos por rol se aplican en el servidor.

Pegar en el SQL Editor, en orden, los archivos de `supabase/migrations/`:

1. `20261102000000_init.sql` — tablas.
2. `20261103000000_own_auth.sql` — email/contraseña en `growvibe.profiles` y tabla `growvibe.sessions`.

Los usuarios nuevos se crean desde `/settings` (solo admin).

### Desarrollo

```
pnpm --filter @growvibe/web dev      # http://localhost:3000
pnpm --filter @growvibe/worker dev   # necesita REDIS_URL accesible
```

### Producción (Easypanel)

Con servicios **App** (un solo `Dockerfile` en la raíz):

- **Web:** variables del `.env` (`DATABASE_URL`, `REDIS_URL`, `APP_URL`…; sin `APP` o `APP=web`), dominio al puerto 3000.
- **Worker:** mismo repo y mismas variables + `APP=worker`, sin dominio.
- **Redis:** servicio Redis de Easypanel; usar su URL interna en `REDIS_URL`.

Alternativa: un servicio **Compose** con `docker-compose.yml` (incluye su propia Evolution API).

## Comprobaciones de la Fase 1

- `pnpm typecheck && pnpm build`
- `/api/health` → 200; sin sesión, cualquier ruta redirige a `/login`.
- Admin ve Resumen, Campañas, Bandeja, Ajustes; vendedor solo Resumen y Bandeja (y es redirigido si abre `/settings` o `/campaigns`).
- Logs del worker: `[worker] conectado a Redis …`.
