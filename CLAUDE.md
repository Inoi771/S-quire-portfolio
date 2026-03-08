# このリポジトリについて

## 自動デプロイの仕組み

`master` ブランチに push すると、GitHub Actions が自動で Google Apps Script にデプロイします。

- `clasp push --force` でコードをGASにアップロード
- `clasp deploy` で既存のデプロイメントを更新

**コードを変更したら必ず `master` ブランチに commit & push すること。GASへの反映は自動で行われる。**

## 主要ファイル

| ファイル | 説明 |
|---|---|
| `code.js` | GASにデプロイされるメインコード |
| `appsscript.json` | GASマニフェスト（必須） |
| `.clasp.json` | claspの設定（Script ID） |
| `.github/workflows/deploy.yml` | 自動デプロイのワークフロー |
| `subcode.js` | 生徒向けアプリ（GASにはアップロードされない） |
| `index.html` / `editor.html` | Webアプリ用HTML |

## GitHub Secrets（設定済み）

- `CLASPRC_JSON` : clasp認証トークン
- `GAS_DEPLOYMENT_ID` : GASのデプロイID

## 注意事項

- `subcode.js` は `.claspignore` により除外されているのでGASにはアップロードされない
- デプロイ対象は `master` ブランチのみ
