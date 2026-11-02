-- Elimina TODO lo que GrowVibe creó en esta base. No toca el esquema "public" ni tu otra app.
-- Se puede pegar completo en el SQL Editor. Corre en una transacción: si algo falla, no se borra nada.

begin;

-- 1) Esquema growvibe: 7 tablas, 2 enums, 3 funciones, políticas RLS y permisos.
--    Al borrar las tablas también salen de la publicación de Realtime.
drop schema if exists growvibe cascade;

-- 2) Usuario admin que se creó para GrowVibe (israelmayalara@gmail.com).
--    Borra también sus identidades y sesiones en Auth.
--    Si quieres conservar este usuario para otra cosa, comenta esta línea.
delete from auth.users where email = 'israelmayalara@gmail.com';

commit;

-- Verificación: ambas deben devolver 0
select count(*) as esquema_growvibe from information_schema.schemata where schema_name = 'growvibe';
select count(*) as usuario_growvibe from auth.users where email = 'israelmayalara@gmail.com';
