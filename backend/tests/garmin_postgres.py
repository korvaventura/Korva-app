"""Garmin RPC concurrency and privileges in the existing disposable CI PostgreSQL."""
import concurrent.futures
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

url = os.environ['DORSAL_TEST_DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', 'postgres'):
    raise RuntimeError('Solo se admite PostgreSQL de prueba local')


def sql(text):
    return subprocess.run(['psql', url, '-XqAt', '-v', 'ON_ERROR_STOP=1', '-c', text],
                          check=True, capture_output=True, text=True).stdout.strip()


# The preceding dorsal test created these roles in the disposable database.
sql('''CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');''')
sql((Path(__file__).parents[1] / 'migrations/20261121185543_garmin_oauth.sql').read_text())
user_id = '11111111-1111-4111-8111-111111111111'
state, ticket, binding = 'a' * 64, 'b' * 64, 'c' * 64
start = f"SELECT * FROM public.korva_garmin_start('{user_id}','{state}','{ticket}','{binding}','encrypted');"
assert sql('SET ROLE service_role; ' + start) == state
assert sql('SET ROLE service_role; ' + start) == ''
assert sql(f"SET ROLE service_role; SELECT state_hash FROM public.korva_garmin_launch('{ticket}');") == state
assert sql(f"SET ROLE service_role; SELECT state_hash FROM public.korva_garmin_launch('{ticket}');") == ''
assert sql(f"SET ROLE service_role; SELECT user_id FROM public.korva_garmin_consume('{state}','{ticket}');") == ''


def consume(_):
    return sql(f"SET ROLE service_role; SELECT user_id FROM public.korva_garmin_consume('{state}','{binding}');")


with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    results = list(pool.map(consume, range(24)))
assert results.count(user_id) == 1
assert results.count('') == 23
assert sql('SET ROLE service_role; ' + start) == state
sql("UPDATE public.garmin_oauth_states SET expires_at=now()-interval '1 minute', launched_at=now();")
assert consume(None) == ''
for role in ('anon', 'authenticated'):
    assert sql(f"SELECT has_table_privilege('{role}','public.garmin_connections','select') OR "
               f"has_table_privilege('{role}','public.garmin_oauth_states','select') OR "
               f"has_function_privilege('{role}','public.korva_garmin_consume(text,text)','execute');") == 'f'
print('OK: Garmin single-use concurrent callback, expiry, replay and server-only grants')
