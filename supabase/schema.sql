-- Wards — schema multiusuário (Supabase/Postgres)
--
-- Uma tabela por "store" que já existia no IndexedDB (js/db.js STORES).
-- Cada linha guarda o registro inteiro dentro de uma coluna `data jsonb` —
-- não uma coluna por campo. Isso é deliberado: o IndexedDB era sem schema
-- (qualquer campo, em qualquer store, criado organicamente ao longo de
-- meses de uso real), então recriar 11 tabelas com colunas tipadas exigiria
-- adivinhar/enumerar todo campo que já existe hoje — arriscado, fácil
-- esquecer um (`ordem` em problemas, `tipo` em exame de imagem, etc.).
-- `id` e `user_id` viram colunas de verdade (são o que index/RLS precisam);
-- todo o resto do objeto (leito, hda, evolucaoTexto, criadoEm, ...) mora
-- dentro de `data`, exatamente como o app já lê/escreve esses objetos.
--
-- `user_id default auth.uid()` é o que permite ao app.js continuar criando
-- registros do jeito que já cria hoje (`{ id: newId(), ... }`, sem nenhum
-- campo de dono) — o Postgres carimba o dono sozinho no INSERT.
--
-- Rode isto inteiro no SQL Editor do painel do Supabase, UMA VEZ, num
-- projeto novo (sem nada criado ainda). `create policy` não aceita
-- `if not exists` no Postgres — por isso o script não é seguro rodar duas
-- vezes (a segunda vez, os `create table if not exists` passam batido mas
-- os `create policy` dão erro de "já existe"; se precisar rodar de novo,
-- apague as policies antigas antes, ou peça um script de limpeza).

create extension if not exists pgcrypto;

-- Função auxiliar: cria uma tabela-padrão (id/user_id/data/created_at) com
-- RLS habilitado e as duas policies de sempre, pra não repetir 11 vezes.
do $$
declare
  nomes text[] := array[
    'patients', 'comorbidades', 'admissions', 'problemas',
    'diagnosisCategories', 'roundEntries', 'exams', 'opinions', 'planItems',
    'attachments', 'vitalSigns'
  ];
  nome text;
begin
  foreach nome in array nomes loop
    execute format($f$
      create table if not exists %I (
        id uuid primary key,
        user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
        data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
    $f$, nome);

    execute format('alter table %I enable row level security;', nome);

    execute format($f$
      create policy %I on %I
        for select using (auth.uid() = user_id);
    $f$, nome || '_select_own', nome);

    execute format($f$
      create policy %I on %I
        for insert with check (auth.uid() = user_id);
    $f$, nome || '_insert_own', nome);

    execute format($f$
      create policy %I on %I
        for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
    $f$, nome || '_update_own', nome);

    execute format($f$
      create policy %I on %I
        for delete using (auth.uid() = user_id);
    $f$, nome || '_delete_own', nome);
  end loop;
end $$;

-- Storage: bucket privado pra fotos/laudos anexados. O app não guarda mais
-- o arquivo em base64 dentro de `attachments.data` — sobe o arquivo real
-- aqui e guarda só o caminho em `attachments.data->>'storagePath'`.
insert into storage.buckets (id, name, public)
values ('anexos', 'anexos', false)
on conflict (id) do nothing;

-- Convenção de caminho: `<user_id>/<attachment_id>` — a policy usa o
-- primeiro segmento do caminho (o folder) como dono, então o app precisa
-- montar o path assim ao subir o arquivo.
create policy "anexos_select_own"
  on storage.objects for select
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "anexos_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "anexos_delete_own"
  on storage.objects for delete
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);
