# Phase 5.5: Teachable Machine オンデバイス推論への移行

## 目的
Gemini API（クラウド推論）を、自分のキッチン音で学習した
Teachable Machine モデル（オンデバイス推論）に差し替える。
API コストゼロ・オフライン動作・環境特化の高精度を実現する。

---

## クラス設計方針

10°C 刻りの実測温度ラベルで学習し、UIにも温度数値を表示する。
境界（140°C以下・195°C以上）のみ "Too Low" / "Too High" で表示する。

### クラス一覧と UI 表示

| クラス名      | 録音目標温度 | UI 表示      | メモ |
|---|---|---|---|
| `TOO_LOW`     | ～135°C    | **Too Low**  | 加熱前〜ほぼ無音の状態 |
| `TEMP_140`    | 140°C      | **約140°C**  | ごく弱い気泡が出始める |
| `TEMP_150`    | 150°C      | **約150°C**  |  |
| `TEMP_160`    | 160°C      | **約160°C**  |  |
| `TEMP_170`    | 170°C      | **約170°C**  | 最重要クラス |
| `TEMP_180`    | 180°C      | **約180°C**  | 天ぷら帯 |
| `TEMP_190`    | 190°C      | **約190°C**  |  |
| `TOO_HIGH`    | 195°C      | **Too High** | 収録できた場合のみ追加。200°C以上は不要 |
| `BACKGROUND`  | —          | （非表示）   | 油なし・キッチン環境音 |

> **安全メモ**: サラダ油の発煙点は約200〜220°C。
> `TOO_HIGH` の録音は 195°C で切り上げ、それ以上は上げない。
> 収録が難しければ `TOO_HIGH` クラスは省いて 7 クラス構成でも OK。

---

## 前提条件
- 温度計（油温対応のサーモプローブ推奨）が手元にある
- 揚げ物ができる環境（油・鍋・コンロ）がある
- 現行の Gemini API 版が動作確認済み ✅

---

## Step 1: 録音データ収集

### 用意するもの
- 温度計（油温対応のもの）
- 録音用スマホまたは PC（本番環境と同じデバイス推奨）
- 油・鍋・コンロ

### 録音量の目安

| クラス | 最低録音時間 | 理想 |
|---|---|---|
| 各温度クラス（TOO_LOW 含む） | 60秒 | 90秒 |
| BACKGROUND | 30秒 | 60秒 |

> Teachable Machine は 1 秒単位でサンプルを区切る。
> 60秒 ≒ 60サンプル。各クラス最低 40 サンプル（40秒）以上が目標。

### 録音のコツ
- 温度計の数値が安定してから録音開始（±2°C 以内になるまで待つ）
- スマホのマイクを鍋の 20〜30cm 上に固定（毎回同じ位置）
- 換気扇は止める（ノイズになる）
- 各クラスを撮り終えたら Teachable Machine にすぐアップロードして確認

---

## Step 2: Teachable Machine でモデル作成

1. [Google Teachable Machine](https://teachablemachine.withgoogle.com/) を開く
2. **Audio Project** を選択
3. クラスを作成（TOO_LOW / TEMP_140 / TEMP_150 / TEMP_160 / TEMP_170 / TEMP_180 / TEMP_190 / [TOO_HIGH] / BACKGROUND）
4. 各クラスに録音データをアップロード（または直接マイク録音）
5. **Train Model** を押す（ブラウザ上で 3〜8 分）
6. **Preview** タブで各クラスの認識精度を確認
   - Confusion Matrix でクラス間の誤認識を確認
   - 隣接クラス（例: TEMP_160 と TEMP_170）の混同が多い場合は追加録音して再学習
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

### 3-4. クラスラベル → UI 表示のマッピング

```typescript
const LABEL_DISPLAY: Record<string, { text: string; temp: number | null }> = {
  TOO_LOW:    { text: "Too Low",  temp: null },
  TEMP_140:   { text: "約140°C", temp: 140 },
  TEMP_150:   { text: "約150°C", temp: 150 },
  TEMP_160:   { text: "約160°C", temp: 160 },
  TEMP_170:   { text: "約170°C", temp: 170 },
  TEMP_180:   { text: "約180°C", temp: 180 },
  TEMP_190:   { text: "約190°C", temp: 190 },
  TOO_HIGH:   { text: "Too High", temp: null },
  BACKGROUND: { text: "",         temp: null },
};
// temp が null でないクラスはメーター針を実温度で動かす
// confidence スコアで隣接クラス間を補間 → 針がなめらかに動く
```

---

## Step 4: 精度検証

- 実油で各温度 5 回ずつテスト（温度計で確認しながら）
- 正解率を記録（目標: 各クラス 75% 以上、隣接クラスとの混同は許容）
- 誤分類が多いクラスは追加サンプルで再学習
- リアルタイム推論で体感のラグを確認

---

## Step 5: UI 調整

- `temp` が数値のクラスはメーター針を実温度位置に表示
- confidence スコアで隣接クラス間を補間し、針をなめらかに動かす
- `BACKGROUND` 検出時は「油の音が聞こえません」を表示
- `TOO_LOW` / `TOO_HIGH` のゾーン色は現行デザインを維持

---

## 完了条件

- [ ] 各クラス 75% 以上の認識精度（隣接クラスとの混同は許容）
- [ ] 実油テスト 5 回以上で判定が安定
- [ ] API コールが完全にゼロ（オフライン動作確認）
- [ ] Vercel デプロイで本番動作確認
