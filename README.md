# GitHubリポジトリ連携ガイド

このドキュメントでは、ローカルのGitリポジトリをGitHubと連携する手順を説明します。

---

## 1. 現在の接続状態を確認する

まず、リモートリポジトリが設定されているか確認します。

```bash
git remote -v
```

出力例（設定済みの場合）：
```
origin  https://github.com/あなたのユーザー名/リポジトリ名.git (fetch)
origin  https://github.com/あなたのユーザー名/リポジトリ名.git (push)
```

何も表示されない場合は、手順3でリモートを追加してください。

---

## 2. GitHubの認証設定

GitHubにコードをプッシュするには、認証が必要です。

### 方法A: HTTPS（Personal Access Token）

1. GitHubにログインし、**Settings > Developer settings > Personal access tokens** を開く
2. **Generate new token** をクリックし、`repo` スコープにチェックを入れてトークンを生成
3. プッシュ時にパスワードの代わりにこのトークンを使用する

```bash
git push origin main
# Username: あなたのGitHubユーザー名
# Password: 生成したPersonal Access Token
```

### 方法B: SSH（推奨）

1. SSHキーを生成する：

```bash
ssh-keygen -t ed25519 -C "your_email@example.com"
```

2. 公開鍵をコピーする：

```bash
cat ~/.ssh/id_ed25519.pub
```

3. GitHubの **Settings > SSH and GPG keys > New SSH key** に貼り付ける

4. 接続テスト：

```bash
ssh -T git@github.com
# Hi ユーザー名! You've successfully authenticated...
```

---

## 3. GitHubリポジトリを連携する

### 新しくGitHubリポジトリを作成した場合

GitHubでリポジトリを作成後、以下のコマンドでリモートを追加します。

```bash
# HTTPSの場合
git remote add origin https://github.com/あなたのユーザー名/リポジトリ名.git

# SSHの場合
git remote add origin git@github.com:あなたのユーザー名/リポジトリ名.git
```

設定を確認：
```bash
git remote -v
```

---

## 4. ファイルを追加してGitHubにプッシュする

```bash
# 1. ファイルをステージングエリアに追加
git add .

# 2. コミット（変更内容の説明を記録）
git commit -m "最初のコミット"

# 3. GitHubにプッシュ
git push -u origin main
```

> **注意**: デフォルトブランチが `master` の場合は `main` を `master` に置き換えてください。

---

## 5. よくあるエラーと対処法

### エラー: `remote: Repository not found`
- GitHubのリポジトリURLが正しいか確認する
- `git remote set-url origin <正しいURL>` でURLを修正する

### エラー: `Authentication failed`
- HTTPSの場合はPersonal Access Tokenが正しいか確認する
- SSHの場合は `ssh -T git@github.com` で認証テストを行う

### エラー: `rejected - non-fast-forward`
- GitHubのリポジトリに他の変更がある場合に発生
- まず `git pull origin main` で変更を取り込んでからプッシュする

```bash
git pull origin main
git push origin main
```

---

## 毎日の作業フロー

```bash
# 最新の変更を取得
git pull origin main

# ファイルを編集...

# 変更をコミット&プッシュ
git add .
git commit -m "変更内容の説明"
git push origin main
```

---

## 参考リンク

- [GitHub公式ドキュメント](https://docs.github.com/ja)
- [SSH接続の設定](https://docs.github.com/ja/authentication/connecting-to-github-with-ssh)
- [Personal Access Token](https://docs.github.com/ja/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
