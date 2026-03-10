# minhaya-app MVP

「みんはや」風の政治クイズ 1v1 招待対戦アプリの MVP 実装です。

## デモ動画

[デモ動画を見る](https://drive.google.com/file/d/1ocUIQ_ZhTPwjcZhZ2ZpgJ6-hJd13n8_5/view?usp=sharing)

## 構成

- `apps/web`: Next.js (静的出力) フロントエンド
- `apps/worker`: Cloudflare Workers + Hono + Durable Objects
- `packages/shared`: 共有 TypeScript 型（Question / WS events）

## 機能（MVP）

- 6桁英数字の招待コードでルーム作成/参加
- 2人揃ったら Lobby ready、ホストのみ Start
- 10問、各10秒、四択、最初の回答でロック
- サーバ主導で問題送信（`endsAtTs` 配信）
- 正解時スコア: `100 + timeBonus`
- 結果表示: 勝敗 / スコア / 問題レビュー（解説・出典）

## ローカル実行

前提: Node.js 20 以上

1. 依存インストール

```bash
npm install
```

2. Worker 起動（ターミナル1）

```bash
npm run dev:worker
```

3. Web 起動（ターミナル2）

```bash
cd apps/web
NEXT_PUBLIC_WORKER_URL=http://127.0.0.1:8787 npm run dev
```

4. ブラウザで `http://localhost:3000` を2タブで開いて 1v1 テスト

## 環境

| 環境 | URL | ブランチ |
|---|---|---|
| **本番** | https://minhaya-web.pages.dev | `main` |
| **ステージング** | https://develop.minhaya-web.pages.dev | `develop` |
| **Worker** | https://minhaya-worker.yuto27abe.workers.dev | `main` |

## CI/CD

GitHub Actions で自動化されています。

| ワークフロー | トリガー | 内容 |
|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | `develop` への push / PR | typecheck |
| **Deploy** (`.github/workflows/deploy.yml`) | `main` への push | Worker + Pages を本番デプロイ |
| **Deploy** (`.github/workflows/deploy.yml`) | `develop` への push | Pages をステージングデプロイ |

### ブランチ運用

```
feat/* → develop（ステージング） → main（本番リリース）
```

- `develop`: 開発統合ブランチ。push 時に CI + ステージングデプロイ
- `main`: 本番ブランチ。push 時に Worker + Pages を本番デプロイ

### GitHub Secrets / Variables の設定

リポジトリの Settings → Secrets and variables → Actions に以下を設定:

**Secrets:**
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**Variables:**
- `WORKER_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### 手動デプロイ

```bash
./deploy.sh
```

## API 仕様

- `POST /rooms` -> `{ code }`
- `GET /ws/:code` -> WebSocket Upgrade

## WS イベント

Client -> Server:

- `join { code, name }`
- `start {}`
- `answer { index, choice, clientTs }`

Server -> Client:

- `lobby { code, players, hostId }`
- `ready { players, hostId }`
- `question { index, question, choices, endsAtTs }`
- `locked { index, playerId }`
- `score { scores }`
- `ended { winnerId, scores, review }`
