# Harvard Lab mCCC Explorer Demo

面向顶刊审稿工作流的 MEBOCOST mCCC 浏览与分析 Demo：导入结果表 → 论文风格 Network/Matrix/DotPlot → 证据链（claim→evidence→图/表联动）→ 稳健性/负控 → 导出报告。

## 启动

在 `/Users/suapril/Desktop/哈佛/mccc-explorer`：

```bash
pnpm install
pnpm dev
```

## LLM（可选，部署友好）

- 所有 DeepSeek 调用的端点 **只从环境变量读取**：`VITE_LLM_API_URL`
- 如果 `VITE_LLM_API_URL` 为空，或请求失败/超时，会 **自动回退到 Demo Mock 输出**（含思考过程 + 结构化 claims/evidence），确保演示可用。

本地开发示例（可选）：

```bash
export VITE_LLM_API_URL="https://<your-runpod-proxy>/v1"
pnpm dev
```

如果你在本地开发遇到浏览器 CORS，推荐用“同源代理”方式：

```bash
export VITE_LLM_API_URL="/llm/v1"
export MCCC_LLM_UPSTREAM="https://<your-runpod-proxy>"   # 不带 /v1
pnpm dev
```

## 输入数据

支持 CSV/TSV。导入后在界面里把列映射到以下字段即可：

- `Sender`（必选）
- `Receiver`（必选）
- `Metabolite`（可选）
- `Sensor`（可选）
- `FDR`（可选，推荐）
- `Score`（可选，推荐）

权重（用于颜色/边宽）默认优先使用 `-log10(FDR)`；若无有效 FDR，则使用 `Score`；再否则回退为 `1`。

## 直接对接 MEBOCOST 输出（推荐）

MEBOCOST 的结果表通常包含这些列（Demo HTML 中可看到）：

- `Sender`, `Receiver`
- `Metabolite_Name`（或 `Metabolite`）
- `Sensor`
- `permutation_test_fdr`
- `Commu_Score`（或 `Norm_Commu_Score`）

在导入后点击 “MEBOCOST 预设” 可一键映射。

**推荐默认过滤：**
- `Flux_PASS = PASS`（通过 COMPASS 通量验证）
- `permutation_test_fdr ≤ 0.05`

## 交互

- DotPlot：点大小=该 sender→receiver 的记录数；点颜色=总强度（聚合 weight）
- 右侧详情：点击任意 cell type 弹出，包含 Top partners / metabolites / sensors，并可一键聚焦子网络
- 可复现链接：筛选条件会写入 URL query（复制地址栏即可复现同一视图）

## 示例

界面中点“加载示例”会读取 `public/sample/mebocost_example.csv`。
