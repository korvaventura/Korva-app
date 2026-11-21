"""Private Garmin capture transaction/replay/permissions in disposable PostgreSQL only."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse
url = os.environ['DORSAL_TEST_DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', 'postgres'):
    raise RuntimeError('Solo se admite PostgreSQL de prueba local')
def sql(text):
    return subprocess.run(['psql', url, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-c', text], check=True, capture_output=True, text=True).stdout.strip()
user = '11111111-1111-4111-8111-111111111111'
sql((Path(__file__).parents[1] / 'migrations/20261121204251_garmin_push_capture.sql').read_text())
sql(f"INSERT INTO public.garmin_connections(user_id,garmin_user_id,token_ciphertext,access_expires_at,refresh_expires_at,permissions) VALUES ('{user}','garmin-fixture','encrypted',now(),now(),ARRAY['ACTIVITY_EXPORT']);")
row = {'garmin_user_id': 'garmin-fixture', 'summary_id': 's1', 'fingerprint': 'a' * 64,
       'payload': {'external_id': 'garmin:1', 'distance_km': 5}}
def capture(rows, ids=None):
    rows_json = json.dumps(rows).replace("'", "''")
    allowed = ids if ids is not None else f"ARRAY['{user}']::uuid[]"
    return json.loads(sql(f"SET ROLE service_role; SELECT public.korva_garmin_capture_push('{rows_json}'::jsonb,{allowed});"))
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    results = list(pool.map(lambda _: capture([row]), range(24)))
assert sum(r['inserted'] for r in results) == 1
assert sql('SELECT count(*) FROM public.garmin_push_events;') == '1'
assert capture([row])['inserted'] == 0
assert capture([dict(row, fingerprint='b' * 64, payload={'distance_km': 6})])['inserted'] == 1
assert sql("SELECT payload->>'distance_km' FROM public.garmin_push_events WHERE fingerprint=repeat('a',64);") == '5'
assert capture([dict(row, garmin_user_id='unknown')])['eligible'] == 0
assert capture([row], 'ARRAY[]::uuid[]')['eligible'] == 0
sql("UPDATE public.garmin_connections SET permissions='{}';")
assert capture([row])['eligible'] == 0
assert sql("SELECT bool_and(state='capturado') FROM public.garmin_push_events;") == 't'
assert sql("SELECT to_regclass('public.activities') IS NULL;") == 't'
for role in ('anon','authenticated'):
    assert sql(f"SELECT has_table_privilege('{role}','public.garmin_push_events','select') OR has_function_privilege('{role}','public.korva_garmin_capture_push(jsonb,uuid[])','execute');") == 'f'
print('OK: Garmin durable capture, concurrent replay, immutable revisions, consent, allowlist and server-only grants; no activity writes')
