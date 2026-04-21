# Phase 1: Next.js環境構築

## 目的
TempuraTuneのNext.jsプロジェクトを作成し、開発サーバー
を起動できる状態にする。

## 注意点
プロジェクトルートには既に CLAUDE.md, docs/, design/ が
あるので、`create-next-app .` で**既存ディレクトリに
作成する**こと。空ディレクトリではない。

## タスク

### 1. create-next-app実行
```bash
npx create-next-app@latest .
```

質問への回答:
- Would you like to use TypeScript? **Yes**
- Would you like to use ESLint? **Yes**
- Would you like to use Tailwind CSS? **Yes**
- Would you like your code inside a `src/` directory? **Yes**
- Would you like to use App Router? **Yes**
- Would you like to use Turbopack? **Yes**
- Would you like to customize the import alias? **No**

既存ファイルの上書き確認が出た場合は、
README.md と .gitignore は **No(上書きしない)** を選択。
他は Yes。

### 2. 依存パッケージ追加
```bash
npm install @google/genai
```

### 3. 環境変数雛形作成
プロジェクトルートに `.env.local.example` を作成:
```
GEMINI_API_KEY=your_api_key_here
```

`.env.local` は私が手動で作成しキーを記載する。

### 4. メタデータ更新
`src/app/layout.tsx` のmetadataを更新:
```typescript
export const metadata: Metadata = {
  title: "TempuraTune",
  description: "AIが油の温度を音で判定する、天ぷら職人のためのアプリ",
};
```

### 5. 動作確認
```bash
npm run dev
```

## 完了条件
- [ ] Next.jsプロジェクトが作成されている
- [ ] @google/genai がpackage.jsonにある
- [ ] .env.local.example が存在
- [ ] layout.tsx のmetadataがTempuraTune用に更新
- [ ] localhost:3000で初期画面が表示される
- [ ] commit完了

## 動作確認方法
1. ブラウザで http://localhost:3000 を開く
2. Next.jsの初期画面が表示される
3. ブラウザタブのタイトルが「TempuraTune」になっている

## 私への確認
- [ ] Gemini APIキーを.env.localに貼った?
- [ ] localhost:3000 が表示された?
- [ ] タブのタイトルが「TempuraTune」になっている?

すべてYESなら次のPhaseへ。

## 次のPhase
Phase 2: APIエンドポイント実装
