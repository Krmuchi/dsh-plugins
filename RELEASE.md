# 发布清单

两个包已具备发布条件，以下每条都在本机实测通过。

## 已完成（代码侧）

| 项 | 状态 |
| --- | --- |
| 包名 scoped 化 `@krmuchi/*` | ✅ npm 上未占用 |
| `peerDependencies: @deepseek-ai/dsh >=0.2.0-rc.2` | ✅ 匹配本机运行时 `0.2.0-rc.2` |
| `dsh.bundle.patch` 声明 | ✅ 指向 `./cordis.patch.yml`，文件在 tarball 内 |
| `publishConfig.access: public` | ✅ scoped 包必需 |
| `repository` / `files` / LICENSE | ✅ |
| `locale/{en,zh}.json` 展示元数据 | ✅ 市场卡片标题与描述 |
| README 安装段（市场 → CLI → 本地） | ✅ |
| git 提交并推送 | ✅ `bff07df` |

发布前实测（`npm pack` 真实 tarball + 本机 profile 解析）：

- 两个 tarball 各 7 个文件，内容与 `files` 白名单一致
- 入口 ESM import 成功，导出 `name` 与 `apply()`
- patch 文件存在且被 `files` 覆盖
- 本机 desktop profile 能解析两个 bundle 的 patch 路径
- loader 行名能解析到新包名

## 待你执行（需要 npm 凭据）

```powershell
# 1) 登录（首次会创建 @krmuchi scope，npm 用户名必须是 Krmuchi）
cd D:\Data\DSH\Workspace\dsh-plugins
npm login

# 2) 确认身份
npm whoami

# 3) 逐个发布
cd packages\dsh-perf-profiler ; npm publish
cd ..\dsh-shell-rescue        ; npm publish

# 4) 验证
npm view @krmuchi/dsh-perf-profiler version
npm view @krmuchi/dsh-shell-rescue version
```

发布后确认包能被 DSH 装到干净 profile：

```powershell
dsh plugin --profile web add @krmuchi/dsh-perf-profiler
dsh plugin --profile web add @krmuchi/dsh-shell-rescue
```

## 待你执行（上架市场）

见 [`awesome-submission/README.md`](../awesome-submission/README.md)：往
<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> 提 PR，字段已预填在
`entry-perf-profiler.json` 与 `entry-shell-rescue.json`。

## 回滚点

本机 desktop profile 改动前的备份：
`C:\Users\liuyihang\.dsh\profiles\desktop\package.json.pre-rename-20261014-122113.bak`

若需回退到旧包名，恢复该文件后在该目录重跑 `pnpm install` 即可。
