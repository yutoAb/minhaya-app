-- missed_questions.question_id → questions.id の外部キー追加
-- ※ 002_seed_questions.sql を先に実行してから実行すること

alter table public.missed_questions
add constraint missed_questions_question_id_fkey
foreign key (question_id) references public.questions(id);
