import concurrent.futures
import os
import subprocess

container = os.environ['CONTAINER']
def sql(command):
    return subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'], input=command, text=True, capture_output=True)

prepare = sql("""
insert into clients(id,phone,name) values ('50000000-0000-4000-8000-000000000001','5511555555555','Concorrência');
create table concurrency_slot as select (d::date + time '11:00') at time zone 'America/Sao_Paulo' as starts_at
from generate_series(current_date+7,current_date+10,interval '1 day') d where extract(dow from d)<>0 limit 1;
""")
assert prepare.returncode == 0, prepare.stderr
command = """begin;
select book_internal('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',(select starts_at from concurrency_slot));
select pg_sleep(0.5);
commit;"""
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(sql, [command, command]))
assert sum(r.returncode == 0 for r in results) == 1, [(r.returncode,r.stderr) for r in results]
assert any('exclusion constraint' in r.stderr for r in results), [r.stderr for r in results]
count = sql("select count(*) from appointments where client_id='50000000-0000-4000-8000-000000000001';")
assert count.returncode == 0 and count.stdout.strip() == '1', count.stdout + count.stderr
print('PASS: duas conexões simultâneas produzem exatamente um agendamento')
