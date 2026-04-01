# DEPLOY.md — デプロイ・インフラ詳細

> このファイルは Claude が必要時に自動で読み込む。
> デプロイ設定・認証・ワークフローの詳細はすべてここを参照。

---

## 自動デプロイの仕組み

1. Claude が `code.js` / `*.html` / `appsscript.json` を修正して GitHub にプッシュ
2. GitHub Actions が自動で以下を実行：
   - `npm install -g @google/clasp`
   - `~/.clasprc.json` の作成（認証情報セット）
   - `clasp push --force`
   - `clasp deploy`（固定IDで更新）
   - `clasp undeploy`（固定ID以外の古いデプロイを自動削除）
3. 約1〜2分で `/exec` URL に反映

---

## 固定デプロイID（変更・削除禁止）

| 項目 | 値 |
|------|-----|
| GASデプロイID | `AKfycbzrzZkyS42v_-kNNrmR4NumrVxfjdwNeJ0uCk3k5mha88Dm7ZarVzjVAkDY8WIqpKybWw` |
| アクセス設定 | ANYONE_ANONYMOUS |
| 用途 | LINE Webhook受信 ＋ Firebase HostingからのAPIコール |
| LINE Webhook URL | `https://script.google.com/macros/s/AKfycbzrzZkyS42v_-kNNrmR4NumrVxfjdwNeJ0uCk3k5mha88Dm7ZarVzjVAkDY8WIqpKybWw/exec` |

**禁止事項：**
- IDなしで `clasp deploy` を実行して新規デプロイを作ること
- このデプロイIDを変更・削除すること
- `appsscript.json` が `ANYONE` のまま `clasp deploy --deploymentId` を実行すること（LINEとFirebase APIが401エラーになる）

**ワークフローは必ず一時的にANYONE_ANONYMOUSに変更してからdeployし、その後元に戻す。**

---

## `.clasp.json`（設定済み・変更不要）
```json
{
  "scriptId": "1INhrY1K41tbSel-KrCCpPbZvJ12A-nCP6WuU5jNLOFee-OXNngwdnNjC",
  "rootDir": "./"
}
```

---

## `appsscript.json`（変更時はこの状態を維持）
```json
{
  "timeZone": "Asia/Tokyo",
  "dependencies": {
    "enabledAdvancedServices": [
      { "userSymbol": "Drive", "serviceId": "drive", "version": "v2" }
    ]
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "access": "ANYONE",
    "executeAs": "USER_DEPLOYING"
  }
}
```

`oauthScopes` を変更した場合、アプリオーナーが `/exec` URL をログイン状態で開き「追加の権限を許可する」で承認が必要。

---

## GitHubシークレット（設定済み）

| シークレット名 | 内容 |
|--------------|------|
| `CLASP_REFRESH_TOKEN` | Google OAuth リフレッシュトークン（GitHub Actions が使用） |

---

## 関連ファイル（設定済み・編集不要）

| ファイル | 役割 |
|---------|------|
| `.github/workflows/deploy-to-gas.yml` | GASデプロイワークフロー |
| `.github/workflows/merge-to-main.yml` | mainブランチへの自動マージ |
| `.clasp.json` | GASプロジェクトとの紐付け |
| `appsscript.json` | GASマニフェスト |

---

## ワークフローの動作条件

| ワークフロー | 起動条件 |
|------------|---------|
| `merge-to-main.yml` | `claude/*` ブランチへのあらゆるプッシュ |
| `deploy-to-gas.yml` | `.js`/`.html`/`appsscript.json`/`.github/workflows/*.yml` が変更された時のみ |
