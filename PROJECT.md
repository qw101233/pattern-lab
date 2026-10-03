# 斑图工坊（Pattern Lab · Reaction-Diffusion Lab）

> 给接手的 AI 助手看的一份"项目体检报告"——读完你就能判断这是不是你接下来要做的活。

## 项目是什么

一个**实时化学反应扩散模拟器**。核心是经典的 **Gray-Scott 模型**：

```
∂u/∂t = Du·∇²u − u·v² + F·(1 − u)
∂v/∂t = Dv·∇²v + u·v² − (F + K)·v
```

两个虚拟化学物质 u、v 在平面上互相反应 + 扩散。某些 F/K 参数组合下，平面上会"涌现"出珊瑚、迷宫、斑马、漩涡、指纹、气泡、孤子等完全不同的图样——这是确定性方程里的"涌现生命"。

## 项目状态

**当前进度：核心完成，可演示，可发布。**

| 模块 | 状态 | 备注 |
|------|------|------|
| WebGL 模拟器（sim.js） | ✅ | 双纹理 PingPong，9 点拉普拉斯，60FPS |
| UI 控件（index.html + style.css） | ✅ | 5 个参数滑块、调色板、缩放、8 个预置 |
| 应用绑定（app.js） | ✅ | 鼠标笔刷、键盘快捷键、暴露 `window.__patternLab` 调试 API |
| 基本运行验证 | ✅ | Playwright 自动化脚本（tools/verify.js） |
| 9:16 介绍图文 | ✅ | docs/intro/ 5 张幻灯片 + 截图 |
| GitHub 公开仓库 | ✅ | https://github.com/qw101233/pattern-lab |
| README | ✅ | 含安装、运行、功能展示 |
| 通用经验沉淀 | ✅ | 工作区记忆文件 |

## 技术选型

| 维度 | 选择 | 理由 |
|------|------|------|
| 渲染 | WebGL1 + WebGL2 兼容（自动降级） | 覆盖率最高，swiftshader 软件渲染也能跑 |
| Shader | GLSL ES 1.00（attribute/varying/gl_FragColor） | 比 ES 3.00 兼容性更好 |
| 模拟精度 | RGBA8 8-bit 编码（u: R 通道，v: G 通道） | 精度够用，性能最高 |
| 物理步进 | 9 点拉普拉斯，中心 -1 / 边缘 0.2 / 对角 0.05 | 经典权重，能量守恒 |
| 求解器 | 双纹理乒乓（PingPong），每显示帧 N=30 次步进 | 1 rAF 内推进足够步数 |
| 资源 | 零 npm 依赖，纯浏览器原生 ES Module | 双击 index.html 即可运行 |
| 构建工具 | 无 | 单页 HTML + 5 个 JS/CSS |

## 目录结构

```
pattern-lab/
├── PROJECT.md          ← 本文档（给 AI 看的体检报告）
├── README.md           ← GitHub 项目说明
├── index.html          ← 入口（用浏览器直接打开）
├── src/
│   ├── style.css       ← 样式（深色主题 + 毛玻璃 UI）
│   ├── sim.js          ← Gray-Scott 模拟器核心
│   ├── presets.js      ← 8 个预置参数集合
│   └── app.js          ← 应用入口（UI 绑定 + 主循环 + 调试 API）
├── tools/
│   └── verify.js       ← Playwright 自动化验证
├── docs/
│   ├── intro/          ← 9:16 介绍图文（5 张幻灯片 HTML）
│   └── screenshots/    ← 验证时自动截图
└── .gitignore
```

## 运行方式

### 方式 A：直接打开（最简单）
双击 `index.html` 即可在浏览器中运行（需要本地 WebGL 支持的现代浏览器）。

### 方式 B：本地 HTTP server（推荐）
```bash
cd pattern-lab
python -m http.server 8000
# 然后访问 http://localhost:8000
```

### 方式 C：自动化验证
```bash
cd pattern-lab
NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" \
  node tools/verify.js
```
这会启动 HTTP server、加载页面、跑 6 种预置、调 3 种调色板，截图保存到 `docs/screenshots/`。

## 核心功能演示

打开页面后默认是"珊瑚"图案（Karl Sims 的经典参数 F=0.055, K=0.062）。

- **左侧滑块**：实时调 F/K/Du/Dv/dt
- **中间画布**：鼠标拖动 = 投放反应物 v（笔刷）；滚轮 = 缩放
- **右侧预置**：8 种图案（珊瑚、细胞分裂、迷宫、漩涡、斑马、指纹、孤子、蠕虫）
- **顶部按钮**：暂停、重置、截图
- **底部**：横纹种子、随机投放、中心投放
- **键盘**：空格=播放暂停 / R=重置 / S=截图 / 1-8=切预置

## 调色板

6 种内置：ember（炭火）/ ocean（深海洋）/ neon（霓虹）/ coral（珊瑚）/ mono（单色）/ aurora（极光）。

## 已知问题 & 决策记录

1. **RGBA8 精度限制**：u/v 在小数值下（< 1/255）会被舍入。表现是高速迭代时偶尔出现"颗粒感"。如需更高精度可改 RGBA16F（需要 WebGL2 + 扩展）。
2. **Playwright swiftshader 慢**：本地用软件渲染每帧 subSteps=30 仍只能跑 ~17 FPS。真实 GPU（Chrome / Edge 默认硬件加速）能跑满 60FPS。
3. **初始条件默认值**：中心 4% 半径一团 v + 2% 随机扰动。这比标准 Karl Sims（纯中心单点）反应更快涌现图案，但也牺牲了一点对称美感。如需纯学术演示可改 `sim.js:289` 的 `Math.random() < 0.020` 为 `0`。

## 重复项目判断

如果你（或别人）想再做类似项目，先看：

- **项目名不同 + 领域不同** → 完全可以做
- **项目名相似但只做 "Gray-Scott 实时模拟"** → 极大可能是重复，建议先读本项目的 `src/sim.js` 复用核心代码
- **想做"反应扩散"但用其他模型**（比如 FitzHugh-Nagumo、BZ 反应）→ 不是重复，本项目只覆盖 Gray-Scott

## 后续可扩展方向（仅供参考，非承诺）

- 加入 FitzHugh-Nagumo 神经冲动模型
- 多个 v 物种竞争
- 鼠标轨迹录制成 GIF/视频
- WebGL 性能优化到 4K × 4K
- 接入 TenCent 云保存用户的参数组合

---

**维护者注**：本项目由 AI 助手（狗蛋）于 2026-10-03 自主完成，与工作区其他三个项目（element-sandbox、idiom-wordle、photon-lab）完全独立。
