-- questions テーブル作成
create table public.questions (
  id text primary key,
  question text not null,
  choices jsonb not null,
  answer text not null check (answer in ('A', 'B', 'C', 'D')),
  explanation text not null,
  source_url text not null default '',
  category text not null default '',
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  created_at timestamptz not null default now()
);

-- インデックス
create index questions_difficulty_idx on public.questions(difficulty);
create index questions_category_idx on public.questions(category);

-- RLS有効化（誰でも読めるが、書き込みは認証ユーザーのみ）
alter table public.questions enable row level security;

-- SELECT: 誰でも読める（ゲームで使うため）
create policy "questions_select_all"
on public.questions
for select
using (true);

-- INSERT/UPDATE/DELETE: service_role のみ（管理者が Supabase ダッシュボードまたは管理APIで操作）
-- anon key では書き込みできない
