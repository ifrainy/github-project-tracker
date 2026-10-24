# GitHub 实用项目追踪站

一个免费的静态网站：从 GitHub 收集实用工具、学习资料和资源目录，每天自动更新，并由 GitHub Pages 发布。

## 功能

- 工具、学习、资源分类筛选和关键词搜索
- 浏览器本地收藏；收藏和个人状态不会上传
- 显示 stars、最近更新时间、最新正式 release 和采集时间
- 显示项目许可检测信息；项目免费条件默认“待核实”，不会把开源直接当成免费证明
- GitHub Actions 每天更新一次，也支持手动运行
- 不用付费 API、数据库、AI key 或服务器

## 发布到 GitHub Pages

1. 在 GitHub 新建一个**公开**仓库，例如 `github-project-tracker`，将本目录中的文件推送到仓库根目录。
2. 打开仓库 **Settings → Pages**，将 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 推送到 `main` 会自动运行发布流程；也可以在 **Actions** 手动运行 `Update and publish tracker`。
4. 首次工作流成功后，在 **Settings → Pages** 查看网站地址。工作流之后计划每天北京时间约 09:20（UTC 01:20）更新；GitHub 可能延后定时任务，且公开仓库连续 60 天无活动会暂停 schedule。

工作流读取公开 GitHub API，使用 Actions 临时令牌，不需要个人 Token。GitHub 官方说明标准托管运行器用于公开仓库时 Actions 免费，Pages 可通过 Actions workflow 发布静态文件；仓库、Actions 与 Pages 的可用性仍受 GitHub 当前政策约束。公开网站会展示抓取到的仓库信息；不要在仓库里放个人收藏、密钥或私人数据。

## 本地预览

在本目录运行：

```powershell
python -m http.server 8000
```

浏览器访问 `http://localhost:8000`。本机若需要刷新数据，可执行：

```powershell
python scraper.py --output data/projects.json
```

## 定制

编辑 `config.json` 中的关注分类、搜索词和种子仓库。分类目前使用规则映射；新增搜索结果的免费状态保持“待核实”。只有具备可核对的官方许可或费用证据后，才应手动更新相应状态。

## 文件

- `index.html`、`styles.css`、`app.js`：静态网站
- `config.json`：搜索词、初始关注列表和分类
- `scraper.py`：仅用 Python 标准库访问 GitHub API、整理公开元数据
- `data/projects.json`：网站读取的数据；工作流运行时生成
- `.github/workflows/publish.yml`：每日采集并部署到 GitHub Pages

