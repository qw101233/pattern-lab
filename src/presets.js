/* 斑图工坊 · 预置图案集合
 * Du=0.32, Dv=0.16 是 Karl Sims 标准 Du=0.16, Dv=0.08 的 2x 版本。
 * 这种"加速"等效在每次 PDE 步进里跑 2x 仿真时间，但仍满足 9 点 Laplacian 的稳定性条件。
 * 这样 swiftshader 软渲染下 10000 子步左右就能涌现完整图案。
 * https://www.karlsims.com/rd.html
 */

export const presets = [
  {
    id: 'coral',
    name: '珊瑚',
    emoji: '🪸',
    f: 0.055, k: 0.062, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '基础珊瑚生长——可看到清晰的前沿扩张'
  },
  {
    id: 'mitosis',
    name: '细胞分裂',
    emoji: '🧬',
    f: 0.0367, k: 0.0649, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '点状结构不断复制分裂，模拟细胞有丝分裂'
  },
  {
    id: 'maze',
    name: '迷宫',
    emoji: '🌀',
    f: 0.029, k: 0.057, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '细密的迷宫结构，像神经突触或迷宫路线'
  },
  {
    id: 'vortex',
    name: '漩涡',
    emoji: '🌊',
    f: 0.014, k: 0.054, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '缓慢自我旋转的漩涡'
  },
  {
    id: 'zebra',
    name: '斑马',
    emoji: '🦓',
    f: 0.026, k: 0.051, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '平行条纹如斑马纹'
  },
  {
    id: 'fingerprint',
    name: '指纹',
    emoji: '👆',
    f: 0.025, k: 0.060, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '紧密螺旋的纹路，类似指纹'
  },
  {
    id: 'solitons',
    name: '孤子',
    emoji: '⚛️',
    f: 0.030, k: 0.062, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '稳定的孤立波结构'
  },
  {
    id: 'worms',
    name: '蠕虫',
    emoji: '🪱',
    f: 0.078, k: 0.061, du: 0.32, dv: 0.16, dt: 1.00,
    desc: '不断蠕动分裂的蠕虫状结构'
  }
];

// 按特征分组的预置
export const patternGroups = {
  organic: ['coral', 'mitosis', 'worms'],
  geometric: ['maze', 'zebra', 'fingerprint'],
  chaotic: ['vortex', 'solitons']
};

