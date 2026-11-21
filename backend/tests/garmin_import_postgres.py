"""Run after capture tests, only in disposable local PostgreSQL."""
exec((__import__('pathlib').Path(__file__).with_name('garmin_push_postgres.py')).read_text().split("sql((Path")[0])
# Earlier CI steps (dorsales) already create a minimal user_challenges: extend it instead.
sql('''CREATE TABLE public.activities(id uuid primary key default gen_random_uuid(),user_id uuid,source text,external_id text unique,sport_type text,distance_km double precision,duration_seconds integer,recorded_at timestamp,excluida boolean default false);
CREATE TABLE IF NOT EXISTS public.user_challenges(id uuid primary key default gen_random_uuid());
ALTER TABLE public.user_challenges ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.user_challenges ADD COLUMN IF NOT EXISTS user_id uuid, ADD COLUMN IF NOT EXISTS status text, ADD COLUMN IF NOT EXISTS recalculo_pendiente_desde timestamptz;
GRANT SELECT,INSERT,UPDATE ON public.activities,public.user_challenges TO service_role;''')
sql((Path(__file__).parents[1]/'migrations/20261121223000_garmin_import.sql').read_text())
sql(f"UPDATE public.garmin_connections SET permissions=ARRAY['ACTIVITY_EXPORT']; INSERT INTO public.user_challenges(user_id,status) VALUES('{user}','active'); DELETE FROM public.garmin_push_events;")
payload={'external_id':'garmin:123','sport_type':'run','distance_km':5,'duration_seconds':1800,'recorded_at':'2026-11-21T22:00:00Z'}
def event(payload, fingerprint):
 p=json.dumps(payload).replace("'","''")
 return sql(f"INSERT INTO public.garmin_push_events(user_id,summary_id,fingerprint,payload) VALUES('{user}','s-{fingerprint}',repeat('{fingerprint}',64),'{p}') RETURNING id;")
def run(e):
 return json.loads(sql(f"SET ROLE service_role; SELECT public.korva_garmin_import_event('{e}',ARRAY['{user}']::uuid[]);"))
e=event(payload,'a')
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 list(pool.map(lambda _:run(e),range(16)))
assert sql('SELECT count(*) FROM public.activities;')=='1'
assert sql(f"SELECT recalculo_pendiente_desde IS NOT NULL FROM public.user_challenges WHERE user_id='{user}';")=='t'
# Strava arriving second is suppressed.
sql(f"INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,recorded_at) VALUES('{user}','strava','456','run',5,'2026-11-21 22:00:03');")
assert sql('SELECT count(*) FROM public.activities;')=='1'
# Garmin arriving second is also suppressed.
sql(f"INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,recorded_at) VALUES('{user}','strava','789','ride',20,'2026-11-21 20:00:00');")
run(event(dict(payload,external_id='garmin:789',sport_type='ride',distance_km=20,recorded_at='2026-11-21T20:00:01Z'),'b'))
assert sql('SELECT count(*) FROM public.activities;')=='2'
# Replays cannot resurrect excluded records.
sql("UPDATE public.activities SET excluida=true WHERE external_id='garmin:123';")
run(e)
assert sql("SELECT excluida FROM public.activities WHERE external_id='garmin:123';")=='t'
assert run(event(dict(payload,external_id='garmin:manual',manual=True),'c'))['result']=='ignorado'
assert sql('SELECT count(*) FROM public.activities;')=='2'
# Garmin after a Korva GPS recording of the same outing is skipped.
sql(f"INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,recorded_at) VALUES('{user}','korva_gps','gps-1','run',8,'2026-11-20 10:00:00');")
run(event(dict(payload,external_id='garmin:gps',distance_km=8.1,recorded_at='2026-11-20T10:02:00Z'),'d'))
assert sql("SELECT count(*) FROM public.activities WHERE external_id='garmin:gps';")=='0'
# Korva GPS and manual inserts are never skipped by the trigger (GPS relies on insert...returning).
sql(f"INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,recorded_at) VALUES('{user}','strava','s-gps','run',3,'2026-11-19 07:00:00');")
assert sql(f"INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,recorded_at) VALUES('{user}','korva_gps','gps-2','run',3,'2026-11-19 07:00:30') RETURNING external_id;")=='gps-2'
assert sql(f"INSERT INTO public.activities(user_id,source,sport_type,distance_km,recorded_at) VALUES('{user}','manual','run',3,'2026-11-19 07:00:00') RETURNING source;")=='manual'
# A Strava row from another user is unaffected.
other='22222222-2222-4222-8222-222222222222'
assert sql(f"INSERT INTO public.activities(user_id,source,external_id,sport_type,distance_km,recorded_at) VALUES('{other}','strava','other-1','run',5,'2026-11-21 22:00:00') RETURNING external_id;")=='other-1'
# Different sport is not a duplicate.
run(event(dict(payload,external_id='garmin:swim',sport_type='swim',distance_km=5,recorded_at='2026-11-21T22:00:00Z'),'e'))
assert sql("SELECT count(*) FROM public.activities WHERE external_id='garmin:swim';")=='1'
print('OK Garmin import: concurrent replays, progress marks, dedup both orders, exclusion and manual filtering')
