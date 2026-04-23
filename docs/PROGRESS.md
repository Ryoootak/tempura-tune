# TempuraTune 進捗管理

## 現在のPhase
**Phase 5.5 未着手（温度計・実油録音待ち）**

## 現在の構成方針
- リポジトリ名は `tempura-tune`
- アプリ表示名は `TempuraTune`
- デザイン参照元は `design/TempuraTune.html`
- 推論方式: 現在 Gemini API → Phase 5.5 で Teachable Machine に移行予定

## 各Phaseのステータス
- Phase 0: ✅ 完了
- Phase 1: ✅ 完了
- Phase 2: ✅ 完了
- Phase 3: ✅ 完了
- Phase 4: ✅ 完了
- Phase 5: ✅ 完了
- Phase 5.5: ⚪ 未着手（温度計購入・実油録音が前提条件）
- Phase 6: ✅ 完了（Phase 4直後に実施）
- Phase 7: ⚪ 未着手

凡例: ✅完了 🟡進行中 ⚪未着手 🔴ブロック中

## セッションログ
新セッション開始時、ここに記載してから作業開始。

### 2026-04-21
- TempuraTuneプロジェクト初期化
- .mdファイル群配置
- design/TempuraTune.html 配置
- 命名ルールを `tempura-tune` / `TempuraTune` に統一
- Phase 0 のドキュメント確認完了
- `tempura-tune/` で `git init` 実行
- 初回コミット作成
- Phase 0 完了、確認待ち
- Next.js 16 + TypeScript + Tailwind CSS を導入
- `@google/genai` を追加
- `.env.local.example` を作成
- `src/app/layout.tsx` の metadata を TempuraTune 用に更新
- `npm run dev` で localhost:3000 起動確認
- Phase 1 完了、確認待ち
- GitHub `origin` を設定
- `main` ブランチを GitHub に初回 push
- Phase 2 開始
- `/api/analyze` 実装着手
- エラー系: `audio file required` / `unsupported format` を確認
- 正常系: `samples/sample1.m4a` で 200 JSON レスポンスを確認
- `.env.local.example` を復元
- Phase 2 完了、確認待ち

### 2026-04-22
- 音声入力UXを見直し
- 10秒録音一括送信から、2秒録音を連続送信する準リアルタイム方式へ方針変更
- Phase 3〜5 の実装方針ドキュメントを更新
- 実音声サンプリングを後段に回し、API前提でMVPを先に作る方針に変更
- 実マイク入力の準リアルタイム判定を先に実装する方針を明文化
- Phase 3 の状態設計と Phase 4 実装方針を確定
- Phase 3 完了、確認待ち
- アプリアイコンとファビコンを `public/icons/` に追加
- metadata にアイコン設定を反映
- `src/app/page.tsx` に準リアルタイムMVP UIを実装
- 料理選択 / マイク許可 / 2秒録音ループ / API送信 / 結果表示を接続
- Phase 4 完了、確認待ち

### 2026-04-23
- Claude Design バンドルを移植、UIを全面刷新（Phase 5 開始）
- フルモデルチェンジ: 5段階ゾーン ＆ 3種プリセット（低温/中温/高温）方式へ
- 音響物理ベースのシステムプロンプトに刷新（周波数・バブル密度・テクスチャ定義）
- Screen 1: 2×3グリッド → 3枚フル幅横長カード
- Screen 2: StatusBadge / "Now Tuning" / 判定ピルバッジ（↑ HEAT UP / ✓ ON TARGET / ↓ COOL DOWN）
- acoustic_reasoning を削除（UIをシンプルに保つ判断）
- 擬音語を日本語カタカナに統一（ピチピチ・チリチリ等）
- API動作確認済み（実機テスト完了）
- Phase 5 完了
- Phase 5.5 工程表（docs/PHASE_5.5.md）作成
- ROADMAP.md / PROGRESS.md を最新状態に更新

## 次のアクション
- 温度計を購入
- 実油で各ゾーン（TOO_LOW〜TOO_HIGH）の音を録音
- Google Teachable Machine でモデル作成
- Phase 5.5 開始（詳細は docs/PHASE_5.5.md 参照）
