# minhaya-app MVP

「みんはや」風の政治クイズ 1v1 招待対戦アプリの MVP 実装です。

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

## デプロイ手順（Cloudflare）

### 1) Worker（API + Durable Objects）

1. Cloudflare にログイン

```bash
cd apps/worker
npx wrangler login
```

2. デプロイ

```bash
npm run deploy
```

3. デプロイされた Worker URL を控える（例: `https://minhaya-worker.<subdomain>.workers.dev`）

### 2) Web（Cloudflare Pages）

Cloudflare Pages で GitHub 連携して `apps/web` をプロジェクト化する想定です。

- Framework preset: `Next.js`
- Root directory: `apps/web`
- Build command: `npm run build`
- Build output directory: `out`
- Environment variable: `NEXT_PUBLIC_WORKER_URL=https://<worker-url>`

デプロイ後、Pages の URL からアクセスして Worker と WebSocket 接続します。

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
