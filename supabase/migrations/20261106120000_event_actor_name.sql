-- Store the actor's name on each timeline event, so both hospitals and the provider can see
-- who did what (staff profiles are otherwise private to their own organization).
alter table public.transfer_events add column actor_name text;

update public.transfer_events e
set actor_name = p.full_name
from public.profiles p
where p.id = e.actor_id;
