<div align="center">
  <h1>Compass：您的 AI 分析师团队</h1>
  <p><strong>以 AI 的速度和成本，获得分析师水准的研究。</strong></p>
</div>

<p align="center">
<a href="#license">
<img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-blue?style=for-the-badge" alt="License: PolyForm Noncommercial 1.0.0" />
</a>
<a href="https://www.python.org/downloads/">
<img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.10+" />
</a>
<a href="https://claude.com/claude-code">
<img src="https://img.shields.io/badge/Powered%20by-Claude%20Code-7C3AED?style=for-the-badge" alt="Powered by Claude Code" />
</a>
</p>

<p align="center">
  <a href="./README.md">English</a> | <strong>中文</strong> | <a href="./README.ar.md">العربية</a> | <a href="./README.es.md">Español</a>
</p>

## 目录

- [概览](#概览)
- [核心特性](#核心特性)
- [产品导览](#产品导览)
- [项目产出](#项目产出)
- [快速开始](#快速开始)
- [典型工作日](#典型工作日)
- [人物包](#人物包)
- [许可证](#许可证)
- [支持与反馈](#支持与反馈)

## 概览

Compass 是为投资组合经理（PM）打造的研究工作台。您可以**雇佣分析师** —— 通用分析师，或者沃伦·巴菲特、查理·芒格、瑞·达利欧等投资人格包 —— 给他们指派股票代码，让他们做买方分析师的日常工作：推介备忘录、财报点评、维护更新，以及开放式的主题探索。每一个论断都附带可点击的原始资料引用。

工作台是您的主界面 —— 一个浏览器 UI，聊天、覆盖股票、备忘录和实时知识图谱并排排列。每一份分析师的产出都是磁盘上的纯文本文件：可以用编辑器打开、grep 检索、版本控制、分享。没有隐藏的数据库。

<p align="center">
  <img src="assets/interface_main.PNG" alt="Compass 主界面" width="1000">
</p>

## 核心特性

- **🎓 把任何人雇佣成分析师** —— 从内置人物包（巴菲特、芒格、达利欧）中招聘，或者把某位公众人物的著作、访谈或一本书喂给我们，让一个新的"大脑"入职。每位入职的人物都成为可雇佣的分析师，拥有自己的语调与视角。
- **⚗️ 知识蒸馏管线** —— 输入一个 Wikipedia 页面、一摞致股东信，或一本书；输出一个结构化的分析师技能 —— 包含语调、思维模型、默认工作流 —— 您可以亲自打磨之后再让他上岗。
- **👥 经营一个团队，而不是一个 Agent** —— 您是 PM。雇佣股票分析师、风险经理、数据科学家、数据工程师、行业专家等多种席位。每个席位都有自己的覆盖股票、默认工作流和写作风格。
- **🧠 知识图谱即您的第二大脑** —— 备忘录、股票、主题、分析师以及引用，全部呈现在一张连通的图上。看看您的团队写过什么，论断的依据来自哪里，以及哪里还有空白。
- **💡 跨来源的想法研究** —— 综合团队中所有席位过往的备忘录、学术论文（arXiv、SSRN、Semantic Scholar）、卖方研报、线上内容和网络搜索。主控 Agent 会浮现团队已有的想法，并搜寻全新的想法。
- **🛠️ 每个交付物的工作流可控** —— 您可以编排每个输出背后的技能链：推介备忘录、晨报、财报点评、维护更新、主题探索。加入新技能、重新排序步骤，或者构建全新的备忘录类型。

## 产品导览

<details>
<summary><strong>🎓 人才库</strong> —— 蒸馏好的人物与已入职的分析师，随时可雇佣。</summary>

<p align="center">
  <img src="assets/talent_pool.PNG" alt="人才库" width="1000">
</p>

</details>

<details open>
<summary><strong>🧠 第二大脑</strong> —— 您的团队产出的每一份备忘录、股票、主题、分析师和引用的知识图谱。</summary>

<p align="center">
  <img src="assets/second_brain.PNG" alt="作为第二大脑的知识图谱" width="1000">
</p>

</details>

<details>
<summary><strong>🧰 技能库</strong> —— 分析师可以串联成工作流的原子技能 —— 无需写代码就能加入新技能。</summary>

<p align="center">
  <img src="assets/skills_lib.PNG" alt="技能库" width="1000">
</p>

</details>

<details>
<summary><strong>🧭 工作流库</strong> —— 每个交付物背后的模板化工作流：推介备忘录、财报点评、晨报 —— 完全可编排。</summary>

<p align="center">
  <img src="assets/workflow_lib.PNG" alt="工作流库" width="1000">
</p>

</details>

<details>
<summary><strong>🗄️ 数据库</strong> —— 团队中每个席位都可使用的可插拔数据源。</summary>

<p align="center">
  <img src="assets/data_lib.PNG" alt="数据库" width="1000">
</p>

</details>

## 项目产出

当一位分析师为某只股票工作时，所有产物都落在 `data/engagements/<analyst>/<TICKER>/` 下：

| | 文件 | 位置 | 描述 |
|---|---|---|---|
| 📄 | 备忘录 | `memos/` | 推介备忘录、财报点评、维护更新、想法写作 |
| 📚 | 公司文件 | `corpus/filings/<FORM>/<ACCESSION>/` | 10-K、10-Q、8-K —— 通过 `edgartools` 抓取为干净的 Markdown |
| 📈 | 市场快照 | `corpus/snapshots/yahoo/` | 每日价格、52 周高低点、分析师一致预期、财务数据 |
| 📰 | 新闻与公告 | `corpus/news/`, `corpus/press/` | 最近的新闻与公司新闻稿 |
| 🎤 | 电话会议记录 | `corpus/transcripts/` | 可获取的财报电话会议记录 |
| 🔬 | 研究资料 | `corpus/research/` | 网络搜索与学术文献调研笔记 |
| 📐 | 分析 | `analysis/kpis/`, `analysis/sections/` | 提取的 KPI 与起草的备忘录章节 |
| 🧾 | 覆盖简报 | `.pipeline/docs/coverage_brief.json` | 分析师关于该公司的活页简报 |

主题项目（通过主控聊天进行的开放式交易想法）会落到合成的 `house/IDEA-<slug>/` 下，避免污染真实覆盖树。

## 快速开始

### 前置条件

- **Python 3.10+**
- 一个 **[Claude Code](https://claude.com/claude-code) 订阅** —— Compass 通过 Claude Code 的 OAuth 进行认证，无需单独管理 API 密钥。
- **无需 Node.js** —— Web UI 已预编译并随包发布。

### 安装

```bash
git clone https://github.com/<your-username>/compass
cd compass
pip install -e .
```

### 登录 Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude /login
```

按 OAuth 提示操作。Compass 会自动读取凭据。

### 向 SEC EDGAR 表明身份

SEC 要求在文件请求的 User-Agent 中提供姓名和邮箱。把 `.env.example` 复制为 `.env`，然后设置：

```env
COMPASS_SEC_USER_NAME=您的姓名
COMPASS_SEC_USER_EMAIL=you@example.com
```

### 启动工作台

```bash
compass serve
```

在浏览器中打开 [http://127.0.0.1:8001](http://127.0.0.1:8001)。从这里开始，您可以雇佣分析师、构建关注列表、运行项目，全部无需再回到终端。

<details>
<summary><strong>更喜欢用 CLI？</strong></summary>

如果您想从终端驱动一切，可以使用以下命令：

```bash
compass templates                  # 列出可用的备忘录工作流
compass plan NVDA pitch-memo       # 规划一个项目（生成 tasks.json）
compass run NVDA pitch-memo        # 规划 + 端到端执行
compass status NVDA                # 查看简报与各任务状态
compass engagements                # 列出已落地的项目
compass universe --sector Technology   # 浏览美股行业目录
```

</details>

## 典型工作日

1. **挑选股票。** 打开 *My Universe*（"我的宇宙"），搜索美股目录，把您关注的股票加入关注列表。
2. **雇佣团队。** 加入一个人物包（巴菲特、芒格、达利欧），或者从 Wikipedia 页面蒸馏一个新人物。每位分析师都获得自己的工位、语调和默认工作流。
3. **打开聊天。** 让玛丽亚·陈（或者沃伦）"写一份 NVDA 的推介备忘录"。右侧栏会实时显示工作进展 —— 文件被抓取、新闻被阅读、章节被起草。
4. **阅读备忘录。** 每一个论断都是一个可点击的引用，回溯到原始文件、电话会议记录或新闻稿。不同意某个观点？在聊天中回复，分析师会重写。
5. **主控聊天里的主题工作。** 当您想要跨整个组合思考 —— 比如"如果联储维持高利率到 Q3，我们的暴露在哪里？" —— 主控聊天会运行一次调研，汇总成一份两节式备忘录：哪些已有想法暴露在该主题之下，加上值得考虑的新想法。

## 人物包

Compass 内置三个可立即雇佣的投资人物包：

| | 人物 | 风格 | 内置视角 |
|---|---|---|---|
| 🟦 | **沃伦·巴菲特** | 所有者思维、护城河优先、长期持有 | 经济护城河、所有者盈余、管理层质量 |
| 🟧 | **查理·芒格** | 多元思维模型的栅格、反向思考 | 多学科清单、"什么会让这件事变成糟糕的主意？" |
| 🟪 | **瑞·达利欧** | 宏观、原则驱动、范式感知 | 大周期、债务动态、范式切换 |

您也可以从一位公众人物的 Wikipedia 页面蒸馏一个新人物 —— Compass 会以内置的巴菲特技能作为模板，让 Claude 写出剩下的内容。把输出视作起点，之后亲手打磨。

## 许可证

[PolyForm Noncommercial 1.0.0](LICENSE)。可免费用于**个人项目、研究、教育及其他非商业用途**，可修改和分享。**不允许商业使用**，如需商业授权，请通过仓库联系信息联系我们。

## 支持与反馈

Compass 仍在积极开发中。核心工作流 —— 雇佣、关注列表、推介备忘录、财报点评、主题探索 —— 已端到端可用。某些边角情况可能仍不完善，特别是非美股票和小众数据源。

- 🐛 **发现了 bug？** 在 GitHub 上提交 issue。
- 💡 **有想法或希望某个工作流被实现？** 发起一个 discussion —— 您的反馈会影响产品路线图。
- 📬 **商业授权或合作咨询？** 通过仓库联系信息联系我们。
