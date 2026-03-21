# GitHub 同步说明

这个项目当前还不是 git 仓库，因此先完成初始化，再执行同步脚本。

## 1. 初始化并绑定 GitHub

```bash
git init
git branch -M main
git remote add origin git@github.com:你的用户名/你的仓库名.git
```

如果你还没有 SSH key，先在本机生成并把公钥添加到 GitHub：

```bash
ssh-keygen -t ed25519 -C "你的邮箱"
cat ~/.ssh/id_ed25519.pub
```

## 2. 首次提交并推送

```bash
git add .
git commit -m "initial commit"
git push -u origin main
```

## 3. 日常同步

推荐使用仓库自带脚本：

```bash
bash scripts/sync-github.sh
```

带自定义提交信息：

```bash
bash scripts/sync-github.sh -m "feat: update homepage"
```

如果你的 remote 名称不是 `origin`：

```bash
bash scripts/sync-github.sh -r upstream -m "sync: update"
```

脚本会做这些事：

- 校验当前目录必须是 git 仓库
- 校验指定 remote 已存在
- 如果有上游分支，先 `pull --rebase --autostash`
- `git add -A`
- 没有改动时直接退出
- 有改动时自动 commit 并 push 当前分支

## 4. 提交前自动检查

仓库提供了一个 `pre-commit` 钩子，提交前会自动执行：

- `pnpm lint`
- `pnpm ts-check`

安装方式：

```bash
bash scripts/setup-git-hooks.sh
```

这会把 Git 的 `core.hooksPath` 指向 `.githooks/`，并给钩子脚本加执行权限。

## 5. 被忽略的内容

仓库根目录的 `.gitignore` 已忽略：

- `node_modules/`
- `.next/`、`out/`、`dist/`、`build/`
- `.env`、`.env.local`、`.env.*.local`、备份环境文件
- 日志、缓存、构建报告、TypeScript build info
- `.DS_Store`、IDE 配置、临时文件

## 6. 注意事项

- 不要把 `.env.local`、数据库密码、COS 密钥提交到 GitHub
- 如果脚本提示没有 remote，先手动执行 `git remote add origin <github-url>`
- 如果你要从多台设备同步，先 `git pull --rebase` 再 `git push`
