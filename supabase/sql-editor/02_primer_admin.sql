-- Paso 2 · Dar acceso de ADMIN a GrowVibe a un usuario que ya existe en Supabase Auth.
-- 1) En Supabase Studio → Authentication → Add user (email + contraseña, marcar "Auto confirm").
--    Si el usuario ya existe (por ejemplo, de tu otra app), sáltate este paso.
-- 2) Cambia el email de abajo y ejecuta.
-- Esto NO cambia nada del usuario en la otra app: solo crea su perfil en growvibe.

insert into growvibe.profiles (id, full_name, role)
select id, coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), 'admin'
from auth.users
where email = 'TU-EMAIL@ejemplo.com'
on conflict (id) do update set role = 'admin';

-- Verificación: debe devolver 1 fila con role = admin
select p.*, u.email from growvibe.profiles p join auth.users u on u.id = p.id;
