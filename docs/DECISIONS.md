# TempuraTune 設計判断記録

重要な設計判断や、選択肢から選んだ理由を残す。

フォーマット:
- 日付
- 判断内容
- 選択肢
- 採用理由
- 代替案を採らなかった理由

---

## 2026-04-21: アプリ名
- 判断: TempuraTune
- 選択肢: TempuraTune / OilEar / FryAI など
- 採用理由: 「天ぷら(日本文化)」+「チューニング(調律)」で
  コンセプトが伝わる。海外メディアにも刺さる名前。
- 不採用理由: 他は機能直訳的で物語性が弱い

## 2026-04-21: フレームワーク選定
- 判断: Next.js 14 (App Router)
- 選択肢: Next.js / Vite + React / プレーンReact
- 採用理由: SSR可能、Vercelデプロイ簡単、Capacitor互換
- 不採用理由: ViteはSSR弱い、プレーンReactはルーティング自前

## 2026-04-21: AI判定にGemini採用
- 判断: Gemini 3.1 Flash
- 選択肢: Gemini / OpenAI Realtime / Claude
- 採用理由: 音声マルチモーダル対応、コスト最安、
  9.5時間まで音声処理可能
- 不採用理由: OpenAIは料金高、Claudeは音声非対応

## 2026-04-21: マネタイズ方針
- 判断: ポートフォリオ作品として無料公開
- 採用理由: API費用は月数千円で許容範囲、本業価値向上に直結
- 不採用理由: 揚げ物頻度が低い家庭が多く、有料化で離脱

## 2026-04-21: UI設計
- 判断: Claude Designで作成、HTMLを手動移植
- 場所: design/TempuraTune.html
- 採用理由: ビジュアルを先に固めた方が実装ブレない
- 不採用理由: コードファースト開発はバイブコーダーには厳しい

## 2026-04-21: 命名規則
- 判断: リポジトリ名は `tempura-tune`、表示名は `TempuraTune`
- 選択肢: `tempuratune` / `tempura-tune` / `TempuraTune`
- 採用理由: 物理パスはkebab-caseの方が読みやすく、表示名はブランドとしてCamelCaseが自然
- 不採用理由: `tempuratune` は単語境界が見えづらく、`TempuraTune` をパスに使うとCLI操作でぶれやすい
