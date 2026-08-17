import type { SkillGroup } from './types.ts'

/**
 * Preset groups. These are schema defaults, so they appear on first run and
 * can be freely replaced by the user layer afterwards.
 */
export const PRESET_GROUPS: SkillGroup[] = [
  {
    id: 'office',
    name: '办公',
    description: '文档、表格、演示与周报',
    skills: [
      'pdf', 'xlsx', 'pptx', 'docx',
      'weekly-report-generator', 'internal-comms', 'doc-coauthoring',
    ],
  },
  {
    id: 'vibecoding',
    name: 'Vibe Coding',
    description: '前端原型、全栈实现与代码评审',
    skills: [
      'frontend-design', 'web-artifacts-builder', 'webapp-testing',
      'code-review', 'implement', 'tdd', 'to-spec', 'domain-modeling',
      'diagnosing-bugs', 'research', 'wayfinder', 'codebase-design',
      'improve-codebase-architecture', 'prototype', 'resolving-merge-conflicts',
    ],
  },
  {
    id: 'academic-writing',
    name: '科研写作',
    description: '论文、图表、引用与写作协作',
    skills: [
      'doc-coauthoring', 'writing-for-agents', 'research',
      'pdf', 'xlsx', 'pptx', 'internal-comms', 'weekly-report-generator',
      'grill-with-docs', 'to-questionnaire', 'teach',
    ],
  },
  {
    id: 'all',
    name: '全部启用',
    description: '自动包含 Skill 库中的全部 Skill',
    skills: [],
  },
]
