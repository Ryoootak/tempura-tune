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
- [ ] Gemini 3.1 Flash 連携
- [ ] curlで動作確認

### Phase 3: 精度検証(私が手動実施)
- [ ] 自宅で160/180/200℃録音(各3回)
- [ ] curlバッチスクリプトで一括判定
- [ ] 精度集計
- [ ] **分岐点**: 6/9以上ならPhase 4へ、未満なら方針転換

### Phase 4: マイク録音UI実装
- [ ] design/TempuraTune.html を Next.js に移植
- [ ] MediaRecorder API実装
- [ ] 10秒録音 → 自動API送信
- [ ] 結果表示(温度ゾーン色分け、推定温度、確信度)
- [ ] エラーハンドリング

### Phase 5: UI改善
- [ ] アニメーション追加(録音中の脈動など)
- [ ] スマホ縦向きレスポンシブ最適化
- [ ] 結果表示の演出強化
- [ ] アクセシビリティ(大フォント、高コントラスト)

### Phase 6: Vercelデプロイ
- [ ] Vercel接続
- [ ] 環境変数設定
- [ ] 本番動作確認
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
