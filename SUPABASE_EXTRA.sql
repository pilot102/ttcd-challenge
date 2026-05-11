-- Funktion für Admin-Passwort-Check
create or replace function check_admin_password(input_pw text)
returns boolean as $$
declare
  stored_hash text;
begin
  select value into stored_hash from settings where key = 'admin_password';
  return stored_hash = md5(input_pw);
end;
$$ language plpgsql security definer;

-- Funktion für Rang-Update nach Challenge
create or replace function update_ranks_after_challenge(winner_id uuid, new_rank integer, old_rank integer)
returns void as $$
begin
  -- Shift players between new_rank and old_rank-1 down by 1
  update players
  set rank = rank + 1
  where active = true
    and rank >= new_rank
    and rank < old_rank
    and id != winner_id;
  
  -- Set winner's new rank
  update players set rank = new_rank where id = winner_id;
end;
$$ language plpgsql security definer;

-- Allow public to call these functions
grant execute on function check_admin_password(text) to anon;
grant execute on function update_ranks_after_challenge(uuid, integer, integer) to anon;
