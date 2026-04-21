# Phase 2: APIエンドポイント実装

## 目的
音声ファイルを受け取りGemini APIで温度判定する
APIエンドポイントを単体で動かす。UIはまだ作らない。

## 仕様

### エンドポイント
- パス: `/api/analyze`
- メソッド: POST
- 入力: `multipart/form-data`, フィールド名 `audio`
- 対応形式: m4a, mp3, wav, webm
- 出力: JSON

### 処理フロー
1. 音声ファイル受信、バリデーション
2. Gemini 2.5 Flash APIに送信
3. システムプロンプト適用
4. JSONレスポンス返却

### システムプロンプト

```
あなたは「TempuraTune」という油温判定アプリのAIです。
日本の天ぷら職人の技を再現する役割を持ちます。

ユーザーが油に濡れた箸を入れた時の音を録音して送ってきます。
その音から、3つのゾーンに分類してください:

- ぬるい (150℃以下): バブルが少なく静か、油の熱対流音
  が主。揚げ物には冷たい。
- 適温 (160-200℃): 安定したバブル音、揚げ物に最適。
  天ぷら・唐揚げ・トンカツの標準温度。
- 熱すぎ (210℃以上): 激しい破裂音、煙の発生リスク、
  油劣化加速。

判定根拠:
- バブルの大きさと数(高温ほど大きく多い)
- 音の高周波成分(高温ほど高音域が増える)
- 音の鋭さ・破裂感(高温ほど鋭い)

判定結果を以下のJSON形式で返してください:
```json
{
  "zone": "ぬるい" | "適温" | "熱すぎ",
  "estimated_temp_range": "160-180℃",
  "confidence": 0.85,
  "advice": "今が投入のタイミングです"
}
```

advice は天ぷら職人風の一言で、ユーザーに次のアクション
を伝える。
```

### エラーハンドリング
- ファイルなし: 400 `{ error: "audio file required" }`
- ファイル形式エラー: 400 `{ error: "unsupported format" }`
- ファイルサイズ超過(20MB超): 413
- Gemini API失敗: 502 `{ error: "AI service error" }`
- その他: 500

### セキュリティ
- GEMINI_API_KEY はサーバー側のみで使用
- フロントエンドに漏らさない
- レスポンスにキーを含めない

## 実装ファイル
- `src/app/api/analyze/route.ts`

## 完了条件
- [x] curlで音声ファイル送信 → JSONレスポンス
- [x] 各エラーケースで適切なステータス
- [x] README.mdにcurl実行例を追記
- [x] commit完了

## 動作確認方法

### 正常系
```bash
curl -X POST http://localhost:3000/api/analyze \
  -F "audio=@samples/sample1.m4a"
```

期待レスポンス:
```json
{
  "zone": "適温",
  "estimated_temp_range": "170-180℃",
  "confidence": 0.9,
  "advice": "油の熱がしっかりと安定しております。この調子で、最高の揚げ物を作り上げてください。"
}
```

### エラー系
```bash
# ファイルなし
curl -X POST http://localhost:3000/api/analyze
# 期待: 400

# 不正な形式
curl -X POST http://localhost:3000/api/analyze \
  -F "audio=@README.md"
# 期待: 400
```

## 注意事項
- 音声ファイルがまだ無くても、ダミーファイル(無音や
  適当な音声)でAPI接続できればOK
- `sample.m4a` は同梱ファイルではなく、確認用に自分で置く
  ダミー音声ファイル名の例
- 実確認では `samples/sample1.m4a` を使って 200 JSON を確認済み
- 実音声での精度検証は Phase 3 で実施
- Gemini APIのレスポンスを必ずJSON形式に整形してから返す

## 次のPhase
Phase 3: 精度検証(私が手動で録音実施)
