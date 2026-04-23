# Phase 5.5: Teachable Machine オンデバイス推論への移行

## 目的
Gemini API（クラウド推論）を、自分のキッチン音で学習した
Teachable Machine モデル（オンデバイス推論）に差し替える。
API コストゼロ・オフライン動作・環境特化の高精度を実現する。

---

## 前提条件
- 温度計（サーモプローブ推奨）が手元にある
- 揚げ物ができる環境（油・鍋・コンロ）がある
- 現行の Gemini API 版が動作確認済み ✅

---

## Step 1: 録音データ収集

### 用意するもの
- 温度計（油温対応のもの）
- 録音用スマホまたは PC（本番環境と同じデバイス推奨）
- 油・鍋・コンロ

### 各クラスの目標温度と録音量

| クラス名 | 目標温度 | 最低録音時間 | メモ |
|---|---|---|---|
| `TOO_LOW` | ～155°C | 40秒以上 | 加熱前〜弱火直後 |
| `LOW` | 160〜165°C | 40秒以上 | 温度計で確認しながら |
| `MEDIUM` | 170〜175°C | 40秒以上 | 最重要クラス |
| `HIGH` | 180〜185°C | 40秒以上 | 天ぷら帯 |
| `TOO_HIGH` | 195°C〜 | 40秒以上 | 危険なので短時間で |
| `BACKGROUND` | — | 30秒以上 | 油なし・キッチン環境音 |

> **ポイント**: Teachable Machine は 2 秒単位でサンプルを区切るため、
> 40秒 = 約20サンプル相当。各クラス 30 サンプル以上（60秒）が理想。

---

## Step 2: Teachable Machine でモデル作成

1. [Google Teachable Machine](https://teachablemachine.withgoogle.com/) を開く
2. **Audio Project** を選択
3. クラスを 6 個作成（TOO_LOW / LOW / MEDIUM / HIGH / TOO_HIGH / BACKGROUND）
4. 各クラスに録音データをアップロード（または直接マイク録音）
5. **Train Model** を押す（ブラウザ上で 2〜5 分）
6. **Preview** タブで各クラスの認識精度を確認
   - Confusion Matrix でクラス間の誤認識を確認
   - 精度が低いクラスは追加録音して再学習
7. **Export Model** → **TensorFlow.js** 形式でダウンロード

### エクスポートされるファイル構成
```
model.json       ← モデルアーキテクチャ
weights.bin      ← 学習済み重み
metadata.json    ← クラスラベル等のメタ情報
```

---

## Step 3: Next.js への統合

### 3-1. パッケージインストール
```bash
npm install @tensorflow/tfjs @tensorflow-models/speech-commands
```

### 3-2. モデルファイルの配置
```
public/
  model/
    model.json
    weights.bin
    metadata.json
```

### 3-3. コードの差し替え

`analyzeAudioChunk()` 関数を差し替えるだけ。
既存の `/api/analyze` との切り替えは定数 1 行で制御できるようにする。

```typescript
// src/lib/inferenceMode.ts
export const INFERENCE_MODE: "api" | "local" = "local";
```

`page.tsx` 側は `INFERENCE_MODE` を見て呼び出し先を切り替える。
Teachable Machine 側は 2 秒録音でなく **リアルタイムストリーム推論** になるため、
ループ構造も変更が必要（`recognizer.listen()` を使う）。

### 3-4. 推論結果のマッピング

Teachable Machine は各クラスの確率スコアを返す。
```typescript
// 例: { TOO_LOW: 0.02, LOW: 0.05, MEDIUM: 0.81, HIGH: 0.10, TOO_HIGH: 0.01 }
// → argmax で current_zone を決定
// → confidence スコアを UI に活用可能
```

---

## Step 4: 精度検証

- 実油で各温度帯 5 回ずつテスト
- 正解率を記録（目標: 各クラス 80% 以上）
- 誤分類が多いクラスは追加サンプルで再学習
- 2 秒窓で安定した判定ができるか確認

---

## Step 5: UI 調整

- メーター針のリアルタイム感改善（confidence × ゾーン幅でドリフト計算）
- BACKGROUND クラス検出時は「油の音が聞こえません」を表示
- 推論モード表示（API / Local）をデバッグ用に追加

---

## 完了条件

- [ ] 各クラス 80% 以上の認識精度
- [ ] 実油テスト 5 回以上でゾーン判定が安定
- [ ] API コールが完全にゼロ（オフライン動作確認）
- [ ] Vercel デプロイで本番動作確認
