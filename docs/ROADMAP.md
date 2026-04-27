# TempuraTune 開発ロードマップ

## ゴール
TempuraTuneのMVPをWeb版で公開、その後アプリ化して
App Storeに出す。ポートフォリオ作品として運用。

## Phase一覧

### Phase 0: プロジェクト初期化 ✅
- [x] CLAUDE.md, ROADMAP.md, PROGRESS.md, DECISIONS.md 確認
- [x] git init
- [x] .gitignore設定
- [x] README.md作成
- [x] design/ フォルダの内容確認

### Phase 1: Next.js環境構築 ✅
- [x] create-next-app
- [x] @google/genai インストール
- [x] .env.local 雛形作成
- [x] localhost:3000 起動確認

### Phase 2: APIエンドポイント実装 ✅
- [x] /api/analyze (POST) 作成
- [x] Gemini 2.5 Flash 連携
- [x] curlで動作確認

### Phase 3: 準リアルタイム実装設計 ✅
- [x] 実マイク入力を前提にMVP UIの仕様を固める
- [x] フロント実装用の状態パターンを整理する

### Phase 4: マイク録音UI実装 ✅
- [x] MediaRecorder API実装
- [x] 2秒録音 → 自動API送信
- [x] 録音と送信をループして準リアルタイム更新
- [x] エラーハンドリング

### Phase 5: UI改善 ✅
- [x] フルモデルチェンジ: 5段階ゾーン＆3種プリセット方式
- [x] Screen 1: 3枚フル幅横長カード（低温🥬 / 中温🍗 / 高温🍤）
- [x] Screen 2: StatusBadge / "Now Tuning" / 判定ピルバッジ
- [x] 音響物理ベースのシステムプロンプトに刷新
- [x] API動作確認済み

### Phase 5.5: Edge Impulse WebAssembly オンデバイス推論への移行 ✅
※ 詳細は `docs/PHASE_5.5.md` を参照
- クラス設計: noise / LOW（140〜150°C）/ MID（160〜180°C）/ HIGH（190°C〜）
- [x] 実油で各ゾーンの音を録音・Edge Impulseで学習
- [x] WebAssembly形式でエクスポート → public/model/ 配置
- [x] src/lib/ にWASMラッパー・マイクキャプチャを実装
- [x] UI全面刷新（ガイド画面新設、アンビエント全画面表示）
- [x] Vercelデプロイ・push完了
- [ ] 実油テストで精度検証（本番環境での動作確認）

### Phase 6: Vercelデプロイ ✅
※ Phase 4直後に完了済み（GitHubプッシュで自動デプロイ）
- [x] Vercel接続
- [x] 環境変数設定
- [x] 本番動作確認
- [ ] PWA化準備（manifest.json、アイコン）
- [ ] tempura-tune.app などのドメイン検討

### Phase 7: Capacitor化（App Store）
- [ ] Capacitorセットアップ
- [ ] iOSビルド確認
- [ ] App Store Connect申請準備
- [ ] アプリアイコン制作

## 完了基準
各Phaseの末尾の「完了条件」を満たしたら次へ。
詳細は各 `docs/PHASE_X.md` を参照。
