// segmenterData.ts — 内容感知字幕分段词表/权重常量
// 移植自 OpenChatCut src/captions/segmenterData.ts（原样保留，不许改动）

export const LATIN_BREAK_PATTERNS: ReadonlyArray<{ pattern: RegExp; score: number }> = [
  { pattern: /[.!?:;,]$/, score: 100 },
];

export const LATIN_PENALTY_PATTERNS: ReadonlyArray<{ pattern: RegExp; penalty: number }> = [
  { pattern: /^(a|an|the|i|we|you|he|she|it|they|this|that|these|those|and|but|or|so)[,;:]\s+\w+$/i, penalty: 95 },
  { pattern: /^(lot|lots|kind|kinds|sort|sorts|type|types|part|parts|number|numbers|couple|couples|bit|bits|piece|pieces|group|groups|bunch|series|set|sets|range|ranges|variety|varieties)\s+of$/i, penalty: 95 },
  { pattern: /^(and|but|or|so|yet|nor|for|however|although|because|since|while|whereas|who|which|that|where|when|why|whose|in|on|at|by|with|from|to|of|about|through|during|before|after|above|below|between|among|under|over|without|within|beyond|across|against|around|behind|beside|beneath|inside|outside|towards|throughout|upon|the|a|an)\s+\w+$/i, penalty: 90 },
  { pattern: /^(the|a|an|this|that|these|those)\s+\w+$/i, penalty: 60 },
  { pattern: /\w+(ed|ing|ly|er|est|ful|less|ous|ive|able|ible)\s+\w+$/i, penalty: 55 },
  { pattern: /^[A-Z][a-z]+\s+[A-Z][a-z]+$/, penalty: 70 },
  { pattern: /^(Dr|Mr|Mrs|Ms|Prof|President|Director|Professor|Minister|Secretary|Ambassador)\s+[A-Z][a-z]+$/i, penalty: 75 },
  { pattern: /^\w+\s+(up|down|in|out|on|off|over|under|through|around|across|along|away|back|forward|ahead|behind|beside|between|among|above|below|inside|outside|onto|into|upon|within|without|throughout|against|towards|beyond|beneath|underneath|alongside)$/i, penalty: 80 },
  { pattern: /^(I|you|he|she|it|we|they|this|that)\s+\w+$/i, penalty: 65 },
  { pattern: /^(can|will|would|could|should|might|may|must|have|has|had|do|does|did|am|is|are|was|were|being|been)\s+\w+$/i, penalty: 70 },
  { pattern: /^(not|never|no|nothing|nobody|nowhere|neither|none|hardly|scarcely|barely|seldom|rarely)\s+\w+$/i, penalty: 75 },
  { pattern: /^\d+\s+(years?|months?|weeks?|days?|hours?|minutes?|seconds?|miles?|kilometers?|feet|inches?|pounds?|kilograms?|degrees?|percent)$/i, penalty: 80 },
];

export const SHORT_FUNCTION_WORD =
  /^(a|an|the|of|in|on|at|by|to|for|with|and|but|or|if|as|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|might|may|must|can|shall)$/i;

export const CJK_PUNCT = {
  clauseBreak: ['，', '；', '：', '、', '､'],
  quoteEnd: ['\u201D', '\u2019', '）', '】', '》', '」', '』', '〉'],
  sentenceEnd: ['。', '！', '？', '…', '．', '｡'],
} as const;

export const MODAL_PARTICLES = ['啊', '吧', '呗', '哈', '啦', '嘛', '呢', '哦', '呀'] as const;

export const CJK_PARTICLES = [
  '的', '地', '得', '了', '着', '过', '是', '在', '有', '和', '与', '或', '及', '并', '但', '而', '却',
  '因', '为', '由', '若', '如', '虽', '然', '则', '即', '便', '把', '被', '让', '给', '对', '向', '从',
  '到', '于', '按', '依', '据', '以', '吗', '呢', '吧', '啊', '呀', '哦', '哇', '嘛', '呐', '这', '那',
  '些', '个', '位', '一', '二', '三', '几', '多', '少',
  'は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ', 'も', 'や',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만',
] as const;

export const NO_LINE_START = [
  '的', '地', '得', '了', '着', '过', '个', '些', '们', '吗', '呢', '吧', '啊', '呀', '哦', '哇', '嘛',
  '呐', '下',
  'は', 'が', 'を', 'に', 'で', 'と', 'の', 'へ', 'も', 'や',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만',
] as const;

export const LATIN_FUNCTION_WORDS = [
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'by', 'to', 'for', 'with', 'and', 'but', 'or', 'if', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'might', 'may', 'must', 'can', 'shall',
] as const;

export const LATIN_QUANTIFIERS = [
  'bit', 'bits', 'bunch', 'couple', 'couples', 'group', 'groups', 'kind', 'kinds', 'lot', 'lots',
  'number', 'numbers', 'part', 'parts', 'piece', 'pieces', 'range', 'ranges', 'series', 'set', 'sets',
  'sort', 'sorts', 'type', 'types', 'varieties', 'variety',
] as const;

export const PAUSE_SUPPRESSED_CONNECTORS = [
  'a', 'an', 'and', 'but', 'he', 'i', 'it', 'or', 'she', 'so', 'that', 'the', 'these', 'they', 'this',
  'those', 'we', 'you',
] as const;

export const CJK_WORD_SUFFIXES = ['们', '化', '性', '者', '度', '流', '栈', '后'] as const;

export const QUESTION_TAIL = /(?:有|没有|还有|是|是不是|叫|做|干|看到|看见|找到)(?:什么|啥|谁|哪里|哪儿)$/u;
export const QUESTION_TAIL_EXCLUDE = /(?:为|凭)什么$/u;
export const QUESTION_HEAD = /^(?:我|你|您|他|她|它|这|那|咱|我们|你们|他们|她们|现在|然后|接着|对了)/u;

export function pauseBreakPriority(gapMs: number): number {
  if (gapMs >= 400) return 90;
  if (gapMs >= 250) return 70;
  return 55;
}

export const ORPHAN_PICK_DEMOTION = 30;
export const PAUSE_MIN_MS = 150;
export const PAUSE_SUPPRESSED_MIN_MS = 400;
