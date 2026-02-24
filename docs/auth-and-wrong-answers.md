## 仕様書：匿名ログイン＋間違えた問題の永続保存（Supabase）

### 1. 目的

* ユーザーが **メール/パスワード無し** で即プレイ開始できること
* 間違えた問題（missed_questions）を **Supabaseに永続保存** し、リロード・ブラウザ再起動でも参照できること
* **自分のデータだけ** 読み書きできるように、DB側で **RLSを完成形** として適用すること

### 2. 非目的（MVPではやらない）

* 本人確認（メール/Google等の本登録）
* 複数端末での同一ユーザー統合（後で「匿名→本登録」昇格で対応可能）
* 管理画面・問題投稿UI（別途）

---

## 3. 前提・用語

* Supabase Auth の **Anonymous Sign-ins** を利用し、ユーザーにはログイン操作を要求しない

  * `signInAnonymously()` を呼ぶだけで、Supabase側にユーザーが作られセッションが張られる ([Supabase][1])
* DBのアクセス制御は **RLS** を使い、`auth.uid()` で「現在のユーザー」を判定する ([Supabase][2])

---

## 4. ユーザーフロー

### 4.1 初回アクセス

1. アプリ起動
2. Supabaseセッション確認
3. セッションが無ければ `signInAnonymously()` を実行して匿名ユーザーを作成
4. 名前入力（表示名）はアプリ側で受け取り、必要なら profiles に保存（任意）
5. ゲーム開始

### 4.2 間違えた時

1. ユーザーが回答して不正解
2. `missed_questions` に1レコードInsert
3. 復習画面で `missed_questions` をSelectして表示

---

## 5. Supabase側設定

### 5.1 Anonymous Sign-ins を有効化

* Supabase Dashboard → Authentication 設定で **Allow anonymous sign-ins** をON ([Supabase][1])

---

## 6. DB設計

### 6.1 テーブル：missed_questions

**要件**

* 自分の間違い履歴のみ見れる
* 自分の間違い履歴のみ追加できる
* 更新/削除はMVPでは「可能でも不可でもよい」（ここでは「削除も自分のみOK」にする）

**カラム**

* `id`: uuid (PK)
* `user_id`: uuid（= auth.uid() を入れる）
* `question_id`: text（問題ID）
* `question_text`: text（出題文スナップショット）
* `correct_answer`: text（正解）
* `chosen_answer`: text（選んだ回答）
* `created_at`: timestamptz

### 6.2 SQL（作成＋RLS）

以下を **Supabase SQL Editor** で実行。

```sql
-- 1) テーブル作成
create table public.missed_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  question_id text not null,
  question_text text not null,
  correct_answer text not null,
  chosen_answer text not null,
  created_at timestamptz not null default now()
);

create index missed_questions_user_id_idx on public.missed_questions(user_id);
create index missed_questions_created_at_idx on public.missed_questions(created_at desc);

-- 2) RLS有効化
alter table public.missed_questions enable row level security;

-- 3) ポリシー（完成形）
-- SELECT: 自分の行だけ
create policy "mq_select_own"
on public.missed_questions
for select
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
);

-- INSERT: 自分のuser_idでしか挿入できない
create policy "mq_insert_own"
on public.missed_questions
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
);

-- DELETE: 自分の行だけ削除可（任意だが便利）
create policy "mq_delete_own"
on public.missed_questions
for delete
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
);
```

ポイント：

* `auth.uid()` は未認証だと `null` になるので、意図を明確にするため `auth.uid() is not null` を入れるのが推奨 ([Supabase][2])
* Anonymous Sign-in のユーザーも `authenticated` ロールで扱われる（= RLSで `to authenticated` が使える） ([Supabase][1])

---

## 7. フロント実装（Next.js/React想定）

### 7.1 Supabase Client

`@supabase/supabase-js` を使う。

```ts
// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

`.env.local`

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 7.2 起動時に匿名ログインを保証する

アプリ起動時（layout/app root）で、セッションが無ければ匿名ログイン。

```ts
import { supabase } from "@/lib/supabaseClient";

export async function ensureAnonymousSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}
```

> これで「ユーザー操作なしでログイン状態」が作れます ([Supabase][1])

### 7.3 間違えた問題をInsert

RLSがあるので、**必ず `user_id: auth.uid()` を入れる**（これが無いと insert が弾かれる）。

```ts
import { supabase } from "@/lib/supabaseClient";

export async function addMissedQuestion(q: {
  questionId: string;
  questionText: string;
  correctAnswer: string;
  chosenAnswer: string;
}) {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("No user session");

  const { error } = await supabase.from("missed_questions").insert({
    user_id: user.id,
    question_id: q.questionId,
    question_text: q.questionText,
    correct_answer: q.correctAnswer,
    chosen_answer: q.chosenAnswer,
  });

  if (error) throw error;
}
```

### 7.4 間違えた問題を取得（復習画面）

`user_id = auth.uid()` はRLSで自動的に絞られるので、フロントは普通にselectしてOK。

```ts
import { supabase } from "@/lib/supabaseClient";

export async function listMissedQuestions() {
  const { data, error } = await supabase
    .from("missed_questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
```

---

## 8. 受け入れ条件（Acceptance Criteria）

* [ ] 初回アクセス時、ユーザー操作なしで匿名セッションが作られる
* [ ] 不正解回答時、`missed_questions` にレコードが追加される
* [ ] リロード後も復習画面で過去の `missed_questions` が取得できる
* [ ] 別ユーザー（別ブラウザ/別端末）では他人の `missed_questions` が見えない（RLSで遮断）
* [ ] `user_id` を偽装してInsertしようとしても拒否される（RLSで遮断）

---

## 9. 動作確認手順（最小）

1. ブラウザAでアクセス → 不正解を1件作る → 復習で見える
2. ブラウザB（シークレット等）でアクセス → 復習でブラウザAの履歴が見えない
3. ネットワークタブ等で `user_id` を別のuuidにしてInsertを試みる → 失敗する

---

## 10. 追加メモ（ランキングを後でやるなら）

ランキングは `scores` テーブル（user_id + display_name + best_score + updated_at）を作って同じ要領でRLSを貼れます。
ただし **ランキングは「他人のスコアを読める」必要がある**ので、読み取りポリシーを `true` にするか、`公開用ビュー` を使う設計にします（荒らし対策は別途）。

---

[1]: https://supabase.com/docs/guides/auth/auth-anonymous?utm_source=chatgpt.com "Anonymous Sign-Ins | Supabase Docs"
[2]: https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com "Row Level Security | Supabase Docs"
