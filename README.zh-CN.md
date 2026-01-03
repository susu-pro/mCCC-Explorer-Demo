# mCCC Explorer

> **面向顶刊审稿场景的代谢物介导细胞间通讯交互分析平台**
> 将 MEBOCOST 输出转化为可复现、可解释、论文级的可视化叙事。

[![React](https://img.shields.io/badge/React-19.2.0-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4.x-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Cytoscape.js](https://img.shields.io/badge/Cytoscape.js-3.x-F7DF1E?style=flat-square)](https://js.cytoscape.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

> **声明：** 本项目为快速原型开发的概念验证（POC），面向研究演示与教育用途，非生产环境就绪。

<p align="center">
  <img src="./public/demo.gif" alt="mCCC Explorer 演示" width="100%">
</p>

---

## 项目概述

**mCCC Explorer** 是一款专为探索**代谢物介导的细胞间通讯（metabolite-mediated cell–cell communication, mCCC）**分析结果而设计的专业交互式可视化平台。为顶刊审稿工作流量身打造，将原始 MEBOCOST 风格输出转化为证据支撑、可复现的可视化叙事。

> **从"我算出来了"到"可复现、可解释、可审稿"的闭环**

### 核心创新

传统单细胞通讯分析工具往往缺乏透明度与可复现性。mCCC Explorer 通过以下设计解决这一痛点：

- **证据优先设计** — 每个可视化元素均可追溯至源数据
- **可复现状态** — 完整分析状态编码于可分享 URL 中
- **统计严谨性** — 内置稳健性检验与负控机制
- **LLM 增强洞察** — AI 驱动的结构化证据链解读

**学术对齐：**
- MEBOCOST：基于代谢物的细胞间通讯推断
- Nature Computational Science：数据驱动的生物网络分析
- 可解释 AI：可追溯、可审计的分析流程

---

## 核心功能

### 1. 多视图交互可视化引擎

| 视图 | 功能描述 |
|------|----------|
| **网络图** | 基于 Cytoscape.js 的力导向发送-接收关系可视化 |
| **邻接矩阵热力图** | 用于识别密集通讯模式的矩阵视图 |
| **统计点图** | 按代谢物/感受器/细胞类型的分布分析 |
| **数据表格** | 可排序、可筛选、实时搜索的表格界面 |
| **对比模式** | 跨实验条件的并排差异分析 |

### 2. 证据优先的交互设计

- **跨视图联动绑定** — 点击任意细胞类型或 sender→receiver 配对，在所有视图中同步高亮
- **详情面板** — 展示 Top 通讯伙伴、代谢物与感受器，支持一键聚焦子网络
- **行级可追溯** — 每条洞察关联具体数据行
- **视觉一致性** — 统一的颜色编码与筛选状态贯穿所有视图

### 3. 稳健性与可复现框架

- **敏感性分析** — 跨 FDR 阈值与 Top-N 边数的参数变体测试
- **负控检验** — 基于随机化的显著性检验与 p 值计算
- **可复现 URL** — 查询字符串中的完整状态序列化，支持可分享分析
- **导出能力** — HTML 报告、Markdown 洞察、JSON 数据、TSV 筛选表格

### 4. LLM 驱动的智能分析（可选）

- **OpenAI 兼容 API** — 通过环境变量配置
- **数据锚定洞察** — 将筛选后数据注入提示词，避免幻觉
- **结构化输出解析** — 从 LLM 响应中提取论断与证据引用
- **优雅降级** — 演示 Mock 输出确保展示永不翻车

### 5. 多 Agent 分析架构（J2 风格）

平台围绕**多 Agent 编排范式**设计——将复杂的 mCCC 分析拆解为专业化、可组合的 Agent：

```
┌──────────────────────────────────────────────────────────────┐
│  🖥️  终端风格命令输入（打字机动画）                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  Agent 1    │  │  Agent 2    │  │  Agent 3    │   ...    │
│  │  数据加载   │→ │  网络分析   │→ │  统计汇总   │→         │
│  │  与解析     │  │             │  │             │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│       ↓                ↓                ↓                    │
│    进度条           进度条           进度条                   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [进入 Explorer →]  深度链接，数据集已预加载                   │
└──────────────────────────────────────────────────────────────┘
```

**架构愿景：**

| Agent | 职责 | 状态 |
|-------|------|------|
| **Data Agent** | 解析 CSV/TSV，验证 schema，自动映射列 | ✅ 已实现 |
| **Network Agent** | 构建 sender-receiver 图，计算拓扑指标 | ✅ 已实现 |
| **Statistics Agent** | FDR 筛选，稳健性检验，负控测试 | ✅ 已实现 |
| **Insight Agent** | LLM 驱动的证据链式解读 | ✅ 已实现 |
| **Orchestrator** | 协调 Agent 执行，管理状态，叙事 UI | 🚧 Demo 阶段 |

**当前 Demo 功能：**
- 打字机命令输入，沉浸式终端美学
- 顺序呈现 Agent 卡片，进度可视化
- 真实数据集集成（`communication_result.tsv`）
- 一键深度链接进入 Explorer，状态已预填充

**路线图：** 模块化 Agent 架构支持未来扩展——自定义分析流水线、插件 Agent、自动化报告生成。

这种设计将复杂的生物信息学工作流转化为**引人入胜的叙事驱动体验**——非常适合路演、演示与论文答辩场景。

---

## 技术架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        mCCC Explorer                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   演示落地页  │  │   Explorer  │  │       共享组件          │  │
│  │  (J2 风格)  │◄─┤     核心    │◄─┤  • NetworkView          │  │
│  │             │  │             │  │  • MatrixView           │  │
│  └──────┬──────┘  └──────┬──────┘  │  • DotPlotView          │  │
│         │                │         │  • TableView            │  │
│         ▼                ▼         │  • CompareView          │  │
│  ┌─────────────────────────────┐   │  • InsightsPanel        │  │
│  │     查询状态管理器           │   │  • LlmPanel             │  │
│  │   (URL ↔ 筛选条件同步)      │   └─────────────────────────┘  │
│  └─────────────────────────────┘                                │
├─────────────────────────────────────────────────────────────────┤
│                          数据层                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    解析器    │  │   转换引擎   │  │      LLM 客户端         │  │
│  │  • CSV/TSV  │  │  • 事件构建  │  │  • OpenAI 兼容         │  │
│  │  • 列映射   │  │  • 筛选过滤  │  │  • 流式响应            │  │
│  │  • 预设配置  │  │  • 统计计算  │  │  • Mock 回退           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术选型 |
|------|----------|
| **前端框架** | React 19.2, Vite 7, ES2024+ |
| **网络可视化** | Cytoscape.js 3, react-cytoscapejs |
| **图表绘制** | Recharts 3, 自定义 SVG 组件 |
| **样式方案** | TailwindCSS 4, CSS 自定义属性 |
| **数据处理** | PapaParse, 自定义转换流水线 |
| **AI 集成** | OpenAI 兼容 API, Mock 回退 |
| **图标库** | Lucide React |

---

## 快速开始

### 环境要求

- Node.js 18+（推荐 LTS 版本）
- pnpm 8+（推荐）或 npm

### 安装与启动

```bash
# 克隆仓库
git clone https://github.com/your-org/mccc-explorer.git
cd mccc-explorer

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

默认端口：`5174`（可在 `vite.config.js` 中配置）

### 演示落地页

适用于预加载数据的演示展示：

```
http://localhost:5174/demos/mccc_cascade_landing.html
```

落地页功能：
- 读取真实示例数据 `public/sample/communication_result.tsv`
- 以打字机动画呈现 4 个顺序分析 Agent
- 一键跳转 Explorer，Import 面板已预填充

---

## 数据输入

### 支持格式
- CSV（逗号分隔）
- TSV（制表符分隔）

### 列映射

| 字段 | 必填 | 说明 |
|------|------|------|
| `Sender` | 是 | 发送细胞类型 |
| `Receiver` | 是 | 接收细胞类型 |
| `Metabolite` | 否 | 代谢物名称 |
| `Sensor` | 否 | 感受器/受体名称 |
| `FDR` | 推荐 | 错误发现率 |
| `Score` | 推荐 | 通讯评分 |

### 权重计算优先级
1. `-log10(FDR)`（有效 FDR 时优先）
2. `Score` 作为回退
3. `1` 作为默认值

### MEBOCOST 输出预设

自动映射的典型 MEBOCOST 列：
- `Sender`, `Receiver`
- `Metabolite_Name` / `Metabolite`
- `Sensor`
- `permutation_test_fdr`
- `Commu_Score` / `Norm_Commu_Score`

审稿推荐筛选条件：
- `Flux_PASS = PASS`
- `permutation_test_fdr ≤ 0.05`

---

## 可复现 URL API

所有状态序列化至查询字符串，支持可复现分析：

| 参数 | 说明 |
|------|------|
| `sample=<file>` | 从 `public/sample/<file>` 自动加载 |
| `view=network\|matrix\|dotplot\|table\|insights\|compare\|llm` | 当前视图 |
| `w=neglog10_fdr\|commu_score\|norm_commu_score` | 权重模式 |
| `fdr=<number>` | 最大 FDR 阈值 |
| `top=<number>` | Top N 边数 |
| `self=0\|1` | 是否包含自环 |
| `flux=all\|pass\|unpass` | Flux 筛选 |
| `m=<string>` | 代谢物查询 |
| `s=<string>` | 感受器查询 |
| `focus=<string>` | 聚焦细胞类型 |
| `focusMode=any\|incoming\|outgoing` | 聚焦方向 |

**示例：**
```
/?sample=communication_result.tsv&view=network&flux=pass&fdr=0.05&top=300&self=0
```

---

## 快捷键

| 快捷键 | 操作 |
|--------|------|
| `⌘/Ctrl + ⇧ + C` | 复制可分享 URL |
| `⌘/Ctrl + ⇧ + E` | 导出 HTML 报告 |
| `⌘/Ctrl + K` | 切换 Actions 菜单 |

---

## LLM 配置（可选）

通过环境变量配置：

```bash
export VITE_LLM_API_URL="https://api.openai.com/v1"
pnpm dev
```

遇到 CORS 问题时，启用开发代理：

```bash
export VITE_LLM_API_URL="/llm/v1"
export MCCC_LLM_UPSTREAM="https://<your-endpoint>"
pnpm dev
```

> **注意：** 若 `VITE_LLM_API_URL` 为空或请求失败，系统将自动回退到演示 Mock 输出，包含结构化论断与证据。

---

## 项目结构

```
src/
├── components/              # React UI 组件
│   ├── NetworkView.jsx      # Cytoscape.js 网络图
│   ├── MatrixView.jsx       # 邻接矩阵热力图
│   ├── DotPlotView.jsx      # 统计点图
│   ├── TableView.jsx        # 可筛选数据表格
│   ├── CompareView.jsx      # 差异对比视图
│   ├── InsightsPanel.jsx    # AI 洞察与稳健性报告
│   ├── LlmPanel.jsx         # LLM 配置面板
│   ├── FileImport.jsx       # 数据导入与映射
│   ├── FiltersPanel.jsx     # 筛选控制面板
│   └── DetailsDrawer.jsx    # 选中详情面板
├── lib/                     # 核心工具库
│   ├── transform.js         # 数据转换流水线
│   ├── parse.js             # CSV/TSV 解析与映射
│   ├── robustness.js        # 统计检验
│   ├── intelligence.js      # 洞察生成
│   ├── compare.js           # 差异分析
│   ├── report.js            # 导出工具
│   ├── queryState.js        # URL 状态管理
│   └── llmClient.js         # LLM API 客户端
├── styles.css               # 全局样式与主题
└── App.jsx                  # 应用主壳
```

---

## 应用场景

### 系统生物学
- 绘制代谢物介导的细胞间信号网络
- 识别通讯生态系统中的枢纽细胞类型
- 表征组织特异性代谢串扰

### 药物发现
- 识别可靶向的代谢通讯轴
- 筛选扰动对通讯网络的影响
- 验证药物作用机制假说

### 学术发表
- 生成论文级图形
- 提供可复现的分析工作流
- 以透明方法论支撑同行评审

---

## 性能特性

- **可扩展性** — 流畅处理 10,000+ 通讯事件
- **响应式设计** — 优化桌面至平板多种视口
- **懒加载** — 视图组件按需加载
- **记忆化优化** — 策略性使用 `useMemo` 优化计算密集操作

---

## 构建

```bash
pnpm build
pnpm preview
```

---

## 参与贡献

欢迎计算生物学与系统生物学社区的贡献：

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 发起 Pull Request

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 致谢

本项目受以下计算生物学前沿研究启发：

- **MEBOCOST** — 代谢物介导的细胞间通讯推断
- **Harvard Medical School** — 系统生物学方法论
- **MIT Computational Biology** — 交互式分析范式

---

<p align="center">
  <strong>mCCC Explorer</strong><br>
  <em>代谢组学与细胞通讯的交汇点</em>
</p>
