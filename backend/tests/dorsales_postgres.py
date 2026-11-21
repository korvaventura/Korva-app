"""Prueba en PostgreSQL descartable local. Nunca usar la base de producción."""
import concurrent.futures
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

url = os.environ['DORSAL_TEST_DATABASE_URL']
if urlparse(url).hostname not in ('localhost', '127.0.0.1', 'postgres'):
    raise RuntimeError('Sólo se admite PostgreSQL de prueba local')

def sql(text):
    return subprocess.run(['psql', url, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', text],
                          check=True, capture_output=True, text=True).stdout.strip()

# CREATE falla si existen estas tablas: el test exige una base vacía y descartable.
sql('''CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.challenges(id uuid PRIMARY KEY);
CREATE TABLE public.user_challenges(id uuid PRIMARY KEY, challenge_id uuid REFERENCES public.challenges(id), numero_bib integer);
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, UPDATE ON public.user_challenges TO service_role;''')
sql((Path(__file__).parents[1] / 'migrations/20261109_dorsales_por_desafio.sql').read_text())
sql('''INSERT INTO challenges VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
INSERT INTO user_challenges SELECT ('11111111-1111-4111-8111-'||lpad(n::text,12,'0'))::uuid,
('00000000-0000-4000-8000-'||lpad((1+(n%2))::text,12,'0'))::uuid,NULL FROM generate_series(1,50) n;''')
ids = [f'11111111-1111-4111-8111-{n:012}' for n in range(1, 51)]

def reservar(id):
    return int(sql(f"SET ROLE service_role; SELECT public.asignar_dorsal_desafio('{id}');").splitlines()[-1])

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
    numeros = list(pool.map(reservar, ids))
    # Dos reintentos concurrentes por inscripción deben conservar el número.
    repetidos = list(pool.map(reservar, ids + ids))
assert repetidos == numeros + numeros
assert sql('SELECT count(*) FROM (SELECT challenge_id FROM user_challenges GROUP BY challenge_id HAVING count(DISTINCT numero_bib)=25 AND min(numero_bib)=1 AND max(numero_bib)=25) s;') == '2'
# Máximo histórico y contador persistente: no renumerar ni reutilizar al borrar.
sql(f"UPDATE user_challenges SET numero_bib=900 WHERE id='{ids[0]}';")
assert reservar(ids[0]) == 900
sql("INSERT INTO user_challenges VALUES ('22222222-2222-4222-8222-000000000001','00000000-0000-4000-8000-000000000002',NULL);")
assert reservar('22222222-2222-4222-8222-000000000001') == 901
sql("DELETE FROM user_challenges WHERE id='22222222-2222-4222-8222-000000000001'; INSERT INTO user_challenges VALUES ('22222222-2222-4222-8222-000000000002','00000000-0000-4000-8000-000000000002',NULL);")
assert reservar('22222222-2222-4222-8222-000000000002') == 902
assert sql("SELECT has_function_privilege('anon','public.asignar_dorsal_desafio(uuid)','execute') OR has_function_privilege('authenticated','public.asignar_dorsal_desafio(uuid)','execute');") == 'f'
print('OK: 50 reservas simultáneas, 100 reintentos, independencia, históricos, no reutilización y permisos')
