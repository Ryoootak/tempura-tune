# TempuraTune - Claude Codeへの指示

## プロジェクト概要
スマホをキッチンに置き、濡れた箸を油に入れた音をマイクで
録音し、Gemini APIで温度を判定するアプリ。
日本の天ぷら職人の技をAIで再現するコンセプト。
ポートフォリオ作品として開発、最終的にApp Store配布視野。

## アプリ名
**TempuraTune**(テンプラチューン)
- 「Tempura(天ぷら)」+「Tune(調律する/合わせる)」
- 油の温度を音で「チューニング」するイメージ

## 技術スタック
- Next.js 14+ (App Router, TypeScript, Tailwind CSS)
- @google/genai (Gemini 3.1 Flash)
- Vercelデプロイ
- 将来Capacitorでネイティブアプリ化(Phase 7)

## 開発者プロフィール
バイブコーダー。説明は簡潔に、専門用語には解説を添えて。

## 必須ルール

### Phase進行(最重要)
- `docs/ROADMAP.md` に全Phase記載
- 現在Phaseは `docs/PROGRESS.md` で管理
- **1Phaseずつ完了確認しながら進める**
- 各Phase最後に「動作確認方法」を提示
- 私の明示的なOKを待ってから次のPhaseへ
- 勝手に複数Phaseを進めない

### コーディング原則
- **シンプル優先、過剰抽象化禁止**
- セキュリティ: APIキーは絶対サーバー側のみ
- ファイル作成前に「これから作ります」と宣言
- 大きな変更前に計画を提示

### デザイン参照
- UI素材は `design/` フォルダにある
- Claude Designで作成したHTMLが基本
- TailwindCSSで再現すること

### 質問
- 不明な仕様は実装前に質問する
- 設計判断が分かれる時は選択肢を提示
- 重要判断は `docs/DECISIONS.md` に記録

### Git
- 各Phase最後にcommit推奨
- コミットメッセージは日本語OK

## 参照ファイル
- 全体計画: `docs/ROADMAP.md`
- 現在の作業: `docs/PROGRESS.md`
- 設計判断: `docs/DECISIONS.md`
- Phase詳細: `docs/PHASE_X.md`
- UI素材: `design/`

## 開始方法
新セッション時はまず `docs/PROGRESS.md` を読み、現在
Phaseを確認してから作業を再開すること。
