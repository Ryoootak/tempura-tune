# TempuraTune デザイン参照メモ

## ファイル
- `TempuraTune.html`: Claude Designで作成したUI全体

## 命名ルール
- リポジトリ名は `tempura-tune`
- アプリ名は `TempuraTune`
- デザイン元HTMLは `design/TempuraTune.html` に固定
- 派生デザインを増やしても、このファイルを基準にする

## アプリ名と世界観
- **TempuraTune**(テンプラチューン)
- 日本の天ぷら職人の技をAIで再現するコンセプト
- 和の雰囲気と最新AIの融合
- カラーは温度ゾーンで信号機準拠(青/緑/赤)

## 主要画面
HTMLを参照。想定構成:
- 料理選択画面
- 測定中(メインメーター)画面
- 結果表示

## 実装方針
- HTMLをベースにNext.js + TailwindCSSで再現
- 完全一致でなくてOK、雰囲気重視
- レスポンシブ対応はClaude Codeに任せる
- アニメーション(脈動、フェード)はPhase 5で追加

## 注意
- iOSフレーム(プレビュー枠)はWeb版では不要
- PWA化(Phase 6)、ネイティブ化(Phase 7)を見越した実装
