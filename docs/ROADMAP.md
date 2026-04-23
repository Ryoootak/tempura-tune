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
- [x] 設計ファイル(design/TempuraTune.html)を忠実に移植
- [x] フルモデルチェンジ: 5段階ゾーン＆3種プリセット方式
- [x] Screen 1: 3枚フル幅横長カード（低温🥬 / 中温🍗 / 高温🍤）
- [x] Screen 2: StatusBadge / "Now Tuning" / 判定ピルバッジ
- [x] 音響物理ベースのシステムプロンプトに刷新
- [x] 擬音語の日本語化（ピチピチ・チリチリ等）
- [x] API動作確認済み

### Phase 5.5: Teachable Machine オンデバイス推論への移行
※ 詳細は `docs/PHASE_5.5.md` を参照
- クラス設計: TOO_LOW / 140°C / 150°C / 160°C / 170°C / 180°C / 190°C / [TOO_HIGH] / BACKGROUND
- UI表示: 数値クラスは「約170°C」形式、境界のみ "Too Low" / "Too High"
- [ ] 温度計で実測しながら各温度の油音を録音（各クラス60秒以上）
- [ ] Google Teachable Machine でモデル作成・学習・エクスポート
- [ ] @tensorflow/tfjs を導入し analyzeAudioChunk() を差し替え
- [ ] 実油テストで精度検証（目標: 各クラス75%以上）
- [ ] confidence スコアでメーター針を補間しなめらかに動かす
- [ ] オフライン動作確認・Vercelデプロイ

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
