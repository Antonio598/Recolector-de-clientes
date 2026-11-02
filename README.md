# GrowVibe CRM

Monorepo (pnpm) · `apps/web` (Next.js 15) · `apps/worker` (BullMQ) · `packages/core` · `packages/db` · `supabase/`.

## Puesta en marcha

1. `cp .env.example .env` y llena las variables (Supabase, `EVOLUTION_API_KEY`, `EVOLUTION_POSTGRES_PASSWORD`…).
2. `pnpm install`

### Base de datos (Supabase CLI)

- **Local (requiere Docker):** `npx supabase start` → aplica migraciones y `seed.sql`.
  Usuarios de prueba: `admin@growvibe.test` / `vendedor@growvibe.test`, contraseña `growvibe123`.
- **Supabase compartido (Easypanel):** todo vive en el esquema `growvibe` (no se toca `public`).
  1. Pegar `supabase/migrations/20261102000000_init.sql` en el SQL Editor y ejecutar.
  2. Agregar `growvibe` a `PGRST_DB_SCHEMAS` del servicio de Supabase y reiniciar `rest`.
  3. Crear el usuario en Authentication y ejecutar `supabase/sql-editor/02_primer_admin.sql`.
  El resto de usuarios se crean desde `/settings`. Usuarios de otras apps sin perfil en `growvibe.profiles` ven "sin acceso".
- Tipos: `pnpm db:types` (reemplaza el stub de `packages/db/src/types.ts`).

### Desarrollo

```
pnpm --filter @growvibe/web dev      # http://localhost:3000
pnpm --filter @growvibe/worker dev   # necesita REDIS_URL accesible
```

### Producción (Easypanel)

Con servicios **App** (un solo `Dockerfile` en la raíz):

- **Web:** variables del `.env` (sin `APP`, o `APP=web`), dominio al puerto 3000.
- **Worker:** mismo repo y mismas variables + `APP=worker`, sin dominio.
- **Redis:** servicio Redis de Easypanel; usar su URL interna en `REDIS_URL`.

Alternativa: un servicio **Compose** con `docker-compose.yml` (incluye su propia Evolution API).
`NEXT_PUBLIC_*` se incrustan en el build (build args), así que si cambian hay que reconstruir `web`.

## Comprobaciones de la Fase 1

- `pnpm typecheck && pnpm build`
- `/api/health` → 200; sin sesión, cualquier ruta redirige a `/login`.
- Admin ve Resumen, Campañas, Bandeja, Ajustes; vendedor solo Resumen y Bandeja (y es redirigido si abre `/settings` o `/campaigns`).
- Logs del worker: `[worker] conectado a Redis …`.
