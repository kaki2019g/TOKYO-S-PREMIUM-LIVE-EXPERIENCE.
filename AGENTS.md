# AGENTS.md

このファイルは、このリポジトリで作業する AI エージェント向けのガイドです。ルート以下の全ファイルに適用します。実装と記述が食い違う場合は、実装・`package.json`・テストを優先し、このファイルも更新してください。

## プロジェクト概要

東京のライブレストラン 3 会場（Blue Note Tokyo、Cotton Club、Billboard Live Tokyo）の公式公開情報を取得し、1 つのスケジュール画面にまとめる小規模な Web アプリです。

- ランタイム: Node.js（ES Modules、グローバル `fetch` を使用するため Node.js 18 以降）
- サーバー: Node.js 標準 `node:http`。Web フレームワークなし
- フロントエンド: 素の HTML / CSS / JavaScript。`npm run build` で静的公開用 `dist` を生成
- HTML 解析: Cheerio
- 永続化: `data/events.json` の JSON キャッシュ。データベースなし
- 日付・表示上の基準タイムゾーン: `Asia/Tokyo`

## 主要ファイル

| パス | 役割 |
| --- | --- |
| `server.js` | 静的ファイル配信、イベント API、定期更新の起動 |
| `lib/scrapers.js` | 3 会場の取得、解析、共通イベント形式への正規化 |
| `lib/event-store.js` | 会場ごとの更新、失敗時のキャッシュ維持、重複排除、原子的な JSON 保存 |
| `scripts/scrape.js` | 手動データ更新用 CLI |
| `scripts/build.js` | Cloudflare Pages向けの静的公開ファイルを `dist` に生成 |
| `.github/workflows/update-events.yml` | 6時間ごとのデータ更新、テスト、更新JSONの自動コミット |
| `data/events.json` | UI とテストが利用する取得済みキャッシュ |
| `index.html` | ページ構造とテンプレート |
| `app.js` | クライアント状態、絞り込み、日付操作、DOM 描画 |
| `styles.css` | 全スタイルとレスポンシブ対応 |
| `tests/unit.test.js` | キャッシュの会場・スキーマ・ID一意性の検査 |
| `tests/browser-check.mjs` | Chrome DevTools Protocol を使う画面スモークテスト |

画像ファイル（`desktop*.png`、`mobile*.png`）は確認結果や参照用の成果物です。依頼に必要でない限り更新しないでください。

## セットアップとコマンド

```bash
npm install          # 依存関係をインストール
npm run build        # 静的公開用 dist を生成
npm start            # http://localhost:4173 で起動
npm run dev          # server.js を watch モードで起動
npm test             # Node 標準テストを実行
npm run scrape       # 公式サイトから取得し data/events.json を更新
npm run test:browser # CDP 経由のブラウザ確認（前提条件は下記）
```

利用可能な環境変数:

- `PORT`: HTTP ポート。既定値は `4173`
- `HOST`: bind 先。既定値は `0.0.0.0`
- `REFRESH_INTERVAL_MS`: 自動更新間隔。既定値は 6 時間
- `REFRESH_TOKEN`: `POST /api/refresh` の Bearer トークン。未設定時はローカル接続のみ許可
- `USER_AGENT`: スクレイピング時の識別情報。公開運用ではサイトURLと連絡先を指定

`npm start` と `npm run dev` は起動直後に外部サイトへアクセスし、成功すれば `data/events.json` を書き換えます。単なる静的 UI 確認でもこの副作用があることに注意してください。

## アーキテクチャとデータフロー

1. `lib/scrapers.js` が各公式サイトから最大およそ 6 か月分を取得し、共通形式へ変換します。
2. `lib/event-store.js` が 3 会場を並列更新します。会場単位で失敗した場合、その会場だけ以前のキャッシュを残します。
3. 保存時は `data/events.json.tmp` に書いてから rename し、不完全な JSON が見えないようにします。同時更新は共有 Promise でまとめられます。
4. フロントエンドは `./data/events.json` を直接読みます。`server.js` の `GET /api/events` はローカル利用や外部クライアントとの互換用です。
5. `app.js` は取得した全件をメモリ上で日付、月、会場、検索語により絞り込み、DOM を再描画します。

イベントを追加・変更する場合は、少なくとも次の共通フィールドを維持してください。

```text
id, date (YYYY-MM-DD), venue, title, subtitle, genre, shows (HH:MM の配列),
price, availability, availabilityType, image, url (HTTPS), source
```

`venue` は `blue-note`、`cotton-club`、`billboard` のいずれかで、`id` はキャッシュ全体で一意にします。会場情報の正本は `venueDefinitions` です。

## 実装時のルール

- 既存の簡素な構成を尊重し、小さな変更のためにフレームワーク、バンドラー、状態管理ライブラリを導入しないでください。
- JavaScript は ESM、ダブルクォート、セミコロンあり、2 スペースインデントという既存スタイルに合わせます。
- 日付文字列を UTC 変換して日付ずれを起こさないでください。東京の「今日」は `Asia/Tokyo` で求め、`YYYY-MM-DD` はローカル日付として扱います。
- スクレイパーでは、空白の正規化、HTTPS URL、タイムアウト、取得元ごとの障害分離を維持します。公式ページの文言や DOM/API 形状は変わり得るため、推測だけでセレクターを変更しないでください。
- `data/events.json` は取得結果です。スクレイパー変更の検証など、更新自体が目的のときだけ意図的に差分へ含めます。無関係な大量更新は戻さず、まず変更理由を確認してください。
- UI 変更ではデスクトップと幅 390px 程度のモバイル表示、キーボード操作、`aria-*`、外部リンクの `rel="noreferrer"` を維持してください。
- DOM へ外部取得文字列を入れるときは原則 `textContent` を使い、取得データを `innerHTML` に渡さないでください。
- API を追加する場合は、`server.js` の明示的な静的ファイル許可リストとメソッド制限、JSON の `no-store` 方針を考慮してください。
- 外部サイトへの取得頻度を不用意に増やさないでください。公開運用では識別可能な `USER_AGENT` と各サイトの利用規約を確認します。

## 検証方針

変更範囲に応じた最小限の検証を行い、最終報告に実行したコマンドと未実施項目を記載してください。

- 常に基本確認として `npm test` を実行します。
- スクレイパー変更では、可能なら `npm run scrape` の結果、会場別件数、`sources` のエラー、イベント ID の一意性を確認します。ただしこれはネットワークアクセスとキャッシュ更新を伴います。
- UI 変更ではサーバーを起動し、対象操作をデスクトップとモバイル幅で目視またはブラウザテストします。コンソールエラーと横スクロールも確認します。
- `npm run test:browser` は自動でブラウザやサーバーを起動しません。事前にアプリを `127.0.0.1:4173` で起動し、Chrome/Chromium を remote debugging port `9222` 付きで起動する必要があります。
- ブラウザテストには特定の日付、件数、検索語を前提とする箇所があり、ライブキャッシュ更新後は実装不具合でなく fixture の陳腐化で失敗する場合があります。失敗時は DOM、現在日付、キャッシュ内容を切り分けてください。
- lint や formatter の npm script は現在ありません。存在しないコマンドを成功した検証として報告しないでください。

## 変更完了の基準

- 要求された動作が実装され、関連する既存動作を壊していない
- `npm test` が成功する、または実行できない理由が明記されている
- 外部取得やブラウザ確認が必要な変更では、実施結果または未実施理由が明記されている
- キャッシュ、スクリーンショット、依存ファイルに意図しない差分を作っていない
- コマンド、構成、運用方法を変えた場合、`README.md` とこのファイルも整合している
