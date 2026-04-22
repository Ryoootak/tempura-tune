# TempuraTune 開発ロードマップ

## ゴール
TempuraTuneのMVPをWeb版で公開、その後アプリ化して
App Storeに出す。ポートフォリオ作品として運用。

## Phase一覧

### Phase 0: プロジェクト初期化
- [ ] CLAUDE.md, ROADMAP.md, PROGRESS.md, DECISIONS.md 確認
- [ ] git init
- [ ] .gitignore設定
- [ ] README.md作成
- [ ] design/ フォルダの内容確認

### Phase 1: Next.js環境構築
- [ ] create-next-app
- [ ] @google/genai インストール
- [ ] .env.local 雛形作成
- [ ] localhost:3000 起動確認

### Phase 2: APIエンドポイント実装
- [ ] /api/analyze (POST) 作成
- [ ] Gemini 2.5 Flash 連携
- [ ] curlで動作確認

### Phase 3: 準リアルタイム実装設計
- [ ] 実マイク入力を前提にMVP UIの仕様を固める
- [ ] フロント実装用の状態パターンを整理する
- [ ] 実音声サンプル収集は後段タスクとして切り分ける

### Phase 4: マイク録音UI実装
- [ ] design/TempuraTune.html を Next.js に移植
- [ ] MediaRecorder API実装
- [ ] 2秒録音 → 自動API送信
- [ ] 録音と送信をループして準リアルタイム更新
- [ ] 結果表示(温度ゾーン色分け、推定温度、確信度)
- [ ] エラーハンドリング

### Phase 5: UI改善
- [ ] アニメーション追加(録音中の脈動、メーター更新)
- [ ] スマホ縦向きレスポンシブ最適化
- [ ] 結果表示の演出強化
- [ ] 準リアルタイム表示の視認性改善
- [ ] アクセシビリティ(大フォント、高コントラスト)

### Phase 5.5: 実音声検証・調整
- [ ] 自宅で160/180/200℃録音(各3回)
- [ ] curlバッチスクリプトで一括判定
- [ ] 精度集計
- [ ] 2秒窓でも判定が安定するか確認
- [ ] 必要ならプロンプトやUI文言を調整

### Phase 6: Vercelデプロイ
※ Phase 4直後に完了済み（GitHubプッシュで自動デプロイ）
- [x] Vercel接続
- [x] 環境変数設定
- [x] 本番動作確認
- [ ] PWA化準備(manifest.json, アイコン)
- [ ] tempura-tune.app などのドメイン検討

### Phase 7: Capacitor化(App Store)
- [ ] Capacitorセットアップ
- [ ] iOSビルド
- [ ] App Store Connect申請準備
- [ ] アプリアイコン制作

## 完了基準
各Phaseの末尾の「完了条件」を満たしたら次へ。
詳細は各 `docs/PHASE_X.md` を参照。
