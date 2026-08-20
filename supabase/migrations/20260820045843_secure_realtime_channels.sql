-- P0 privacy hardening: make lobby realtime topics unguessable from the short room code.
-- Joined participants receive a random per-lobby realtime token through a credential-checked RPC.
-- The token itself lives only in the private schema and is deleted with the lobby.

create table if not exists private.lobby_realtime_tokens (
  lobby_id uuid primary key references public.lobbies(id) on delete cascade,
  token uuid not null unique default extensions.gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table private.lobby_realtime_tokens enable row level security;
revoke all on table private.lobby_realtime_tokens from public, anon, authenticated;

insert into private.lobby_realtime_tokens (lobby_id)
select l.id
from public.lobbies l
where not exists (
  select 1 from private.lobby_realtime_tokens rt where rt.lobby_id = l.id
)
on conflict (lobby_id) do nothing;

create or replace function private.ensure_lobby_realtime_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.lobby_realtime_tokens (lobby_id)
  values (new.id)
  on conflict (lobby_id) do nothing;
  return new;
end;
$$;
revoke all on function private.ensure_lobby_realtime_token() from public, anon, authenticated;

drop trigger if exists eznoobs_ensure_realtime_token on public.lobbies;
create trigger eznoobs_ensure_realtime_token
after insert on public.lobbies
for each row execute function private.ensure_lobby_realtime_token();

create or replace function public.get_lobby_realtime_token(
  p_code text,
  p_guest_id text,
  p_guest_secret text
)
returns table(out_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby_id uuid;
  v_token uuid;
begin
  if p_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$'
     or char_length(p_guest_id) < 8 or char_length(p_guest_id) > 64
     or char_length(p_guest_secret) < 20 or char_length(p_guest_secret) > 100 then
    return;
  end if;

  select l.id into v_lobby_id
  from public.lobbies l
  where l.code = p_code and l.expires_at > now();
  if not found then return; end if;

  if not exists (
    select 1
    from public.participants p
    where p.lobby_id = v_lobby_id
      and p.guest_id = p_guest_id
      and private.guest_secret_matches(v_lobby_id, p_guest_id, p_guest_secret)
  ) then
    return;
  end if;

  select rt.token into v_token
  from private.lobby_realtime_tokens rt
  where rt.lobby_id = v_lobby_id;

  if v_token is null then return; end if;
  out_token := v_token::text;
  return next;
end;
$$;
revoke execute on function public.get_lobby_realtime_token(text,text,text) from public, authenticated;
grant execute on function public.get_lobby_realtime_token(text,text,text) to anon;

create or replace function private.broadcast_lobby_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lobby_id uuid;
  v_code text;
  v_token uuid;
begin
  if tg_table_name = 'lobbies' then
    v_lobby_id := case when tg_op = 'DELETE' then old.id else new.id end;
    v_code := case when tg_op = 'DELETE' then old.code else new.code end;
  else
    v_lobby_id := case when tg_op = 'DELETE' then old.lobby_id else new.lobby_id end;
    select code into v_code from public.lobbies where id = v_lobby_id;
  end if;

  select rt.token into v_token
  from private.lobby_realtime_tokens rt
  where rt.lobby_id = v_lobby_id;

  if v_code is not null and v_token is not null then
    perform realtime.send(
      jsonb_build_object('changed', true),
      'db-change',
      'room:' || v_code || ':' || v_token::text,
      false
    );
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.broadcast_lobby_change() from public, anon, authenticated;
