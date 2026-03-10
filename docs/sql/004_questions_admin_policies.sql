-- questions テーブルへの書き込みポリシー追加（管理者用）
-- 認証済みユーザー（匿名含む）に INSERT/UPDATE/DELETE を許可
-- アクセス制御は管理者画面のパスワード保護で行う

create policy "questions_insert_authenticated"
on public.questions
for insert
to authenticated
with check (true);

create policy "questions_update_authenticated"
on public.questions
for update
to authenticated
using (true)
with check (true);

create policy "questions_delete_authenticated"
on public.questions
for delete
to authenticated
using (true);
