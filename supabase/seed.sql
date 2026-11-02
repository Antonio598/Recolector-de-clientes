-- Usuarios de prueba SOLO para desarrollo local (supabase db reset).
--   admin@growvibe.test    / growvibe123  → admin
--   vendedor@growvibe.test / growvibe123  → vendedor

do $$
declare
  admin_id uuid := '00000000-0000-0000-0000-0000000000a1';
  vend_id  uuid := '00000000-0000-0000-0000-0000000000b1';
  u record;
begin
  for u in
    select * from (values
      (admin_id, 'admin@growvibe.test', 'Antonio (admin)'),
      (vend_id,  'vendedor@growvibe.test', 'Vendedor de prueba')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      crypt('growvibe123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
            jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now());
  end loop;

  -- Sin trigger: los perfiles de GrowVibe se crean explícitamente.
  insert into growvibe.profiles (id, full_name, role) values
    (admin_id, 'Antonio (admin)', 'admin'),
    (vend_id, 'Vendedor de prueba', 'vendedor');
end $$;
