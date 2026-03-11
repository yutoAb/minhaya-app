-- questions テーブルに is_active フラグを追加
-- デフォルト true（既存の問題はすべて有効）

alter table public.questions
add column is_active boolean not null default true;
