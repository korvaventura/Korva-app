"""Run after garmin_import_postgres, local disposable PostgreSQL only."""
exec((__import__('pathlib').Path(__file__).with_name('garmin_push_postgres.py')).read_text().split("sql((Path")[0])
sql((Path(__file__).parents[1]/'migrations/20261121194000_garmin_connection_lease.sql').read_text())
sql((Path(__file__).parents[1]/'migrations/20261122010000_garmin_public_beta.sql').read_text())
sql("DELETE FROM public.garmin_connections; DELETE FROM public.activities;")
sql(f"INSERT INTO public.garmin_connections(user_id,garmin_user_id,token_ciphertext,access_expires_at,refresh_expires_at,permissions,connected_at) VALUES('{user}','public-account','encrypted',now(),now(),ARRAY['ACTIVITY_EXPORT'],'2026-11-21T00:00:00Z');")
row={'garmin_user_id':'public-account','summary_id':'public-summary','fingerprint':'a'*64,'payload':{'external_id':'garmin:public','sport_type':'run','distance_km':2,'duration_seconds':600,'recorded_at':'2026-11-21T22:00:00Z'}}
def rpc(name,args):
 return sql(f"SET ROLE service_role; SELECT public.{name}({args});")
encoded=json.dumps([row]).replace("'","''")
assert json.loads(rpc('korva_garmin_capture_push',f"'{encoded}',ARRAY[]::uuid[]"))['inserted']==0
assert json.loads(rpc('korva_garmin_capture_push',f"'{encoded}',NULL"))['inserted']==1
e=sql('SELECT id FROM public.garmin_push_events LIMIT 1;')
assert json.loads(rpc('korva_garmin_import_event',f"'{e}',ARRAY[]::uuid[]"))['result']=='omitido'
# A concurrent manual writer's mark must be renewed, never left available for
# its stale cleanup. Garmin does not own or clear a mark it found already set.
sql(f"UPDATE public.user_challenges SET recalculo_pendiente_desde='2027-01-01T00:00:00Z' WHERE user_id='{user}';")
imported=json.loads(rpc('korva_garmin_import_event',f"'{e}',NULL"))
assert imported['result']=='importado' and imported['marcas']==[]
assert sql(f"SELECT bool_and(recalculo_pendiente_desde>'2027-01-01T00:00:00Z'::timestamptz) FROM public.user_challenges WHERE user_id='{user}';")=='t'
assert sql("SELECT count(*) FROM public.activities WHERE source='garmin';")=='1'
def consent(kind,perms=None,time='2026-11-21T23:00:00Z'):
 rows=[{'garmin_user_id':'public-account','permissions':perms or [],'changed_at':time}]
 return rpc('korva_garmin_consent',"'%s','%s'"%(kind,json.dumps(rows)))
consent('permissions')
assert sql('SELECT cardinality(permissions) FROM public.garmin_connections;')=='0'
assert sql('SELECT state FROM public.garmin_push_events LIMIT 1;')=='ignorado'
consent('permissions',['ACTIVITY_EXPORT'],'2026-11-21T22:59:00Z')
assert sql('SELECT cardinality(permissions) FROM public.garmin_connections;')=='0'
consent('permissions',['ACTIVITY_EXPORT'],'2026-11-21T23:01:00Z')
assert sql('SELECT cardinality(permissions) FROM public.garmin_connections;')=='1'
consent('deregistration');consent('deregistration')
assert sql('SELECT count(*) FROM public.garmin_connections;')=='0'
assert sql('SELECT count(*) FROM public.garmin_push_events;')=='0'
for role in ('anon','authenticated'):
 assert sql(f"SELECT has_function_privilege('{role}','public.korva_garmin_consent(text,jsonb)','execute');")=='f'
print('OK: public mode explicit null, private empty deny, import, revoke, stale permissions, deregistration replay and grants')
