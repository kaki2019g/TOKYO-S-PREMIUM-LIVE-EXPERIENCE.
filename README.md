# LIVE SCHEDULE

ブルーノート東京、コットンクラブ、ビルボードライブ東京の公演を横断して表示する非公式スケジュールサイトです。

## セットアップ

```bash
npm install
npm start
```

ブラウザで `http://localhost:4173` を開きます。

## データ更新

サーバー起動時と、その後6時間ごとに3会場の公式公開情報を取得し、`data/events.json` に保存します。手動更新は次のコマンドです。

```bash
npm run scrape
```

更新間隔はミリ秒単位で変更できます。

```bash
REFRESH_INTERVAL_MS=10800000 npm start
```

サーバーには `POST /api/refresh` もあります。`REFRESH_TOKEN` を設定した環境では、`Authorization: Bearer <token>` が必要です。トークン未設定時はローカルホストからのリクエストだけを許可します。

## 静的サイトのビルドと公開

公開用ファイルだけを `dist` に生成します。

```bash
npm run build
```

Cloudflare Pagesでは、ビルドコマンドを `npm run build`、出力ディレクトリを `dist` に
設定してください。画面は `data/events.json` を直接読み込むため、本番環境でNodeサーバーを
常時稼働させる必要はありません。

`.github/workflows/update-events.yml` は6時間ごと、およびGitHub Actions画面からの手動実行時に
公演データを更新します。取得とテストに成功してデータが変更された場合だけ、`main` ブランチへ
自動コミットします。公開用のUser-Agentは、GitHubリポジトリのActions variable
`SCRAPER_USER_AGENT` にサイトURLと連絡先を含めて設定してください。

## 取得元

- Blue Note Tokyo: 公式月別予約スケジュール
- Cotton Club: 公式月別予約スケジュール
- Billboard Live Tokyo: 公式サイトが使用する公開スケジュールAPI

取得失敗時は、失敗した会場だけ直近のキャッシュを維持します。画面には最終更新日時と会場別取得状態が表示されます。

## 注意

本サイトは各会場の非公式な横断検索サービスです。料金、空席状況、開演時刻は変更される可能性があるため、予約前に必ず各会場の公式ページで確認してください。

公開運用前には各サイトの利用規約を確認し、適切な取得間隔と連絡先を `USER_AGENT` に設定してください。

## テスト

```bash
npm test
```

## 変更のコミットとプッシュ

現在の変更をまとめてコミットし、現在のブランチを `origin` にプッシュします。

```bash
npm run push
```

直接実行する場合は次の形式も利用できます。

```bash
./scripts/commit-and-push.js
```

変更ファイルの種類からコミットメッセージを自動生成します。任意のメッセージを指定したい場合は
`npm run push -- "コミットメッセージ"` のように上書きできます。`.env`、`node_modules`、`dist`
などは `.gitignore` により対象外です。変更がない場合も未送信コミットをプッシュします。強制プッシュや
履歴の書き換えは行いません。
