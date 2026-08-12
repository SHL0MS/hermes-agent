/**
 * Media Studio plugin-scoped i18n — bundles registered under the plugin id
 * via ctx.i18n.register, never touching core en.ts. `useStudio()` binds the
 * stringly-typed t() to the message shape for typed component access.
 */

import { type PluginLocaleBundles, type PluginTranslate, usePluginI18n } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

type StudioMessages = {
  nav: string
  title: string
  create: string
  queue: string
  library: string
  prompt: string
  promptPlaceholder: string
  negativePrompt: string
  provider: string
  model: string
  aspectRatio: string
  resolution: string
  duration: string
  seconds: (n: number) => string
  seed: string
  seedPlaceholder: string
  audio: string
  startImage: string
  clearStartImage: string
  generate: string
  generating: string
  image: string
  video: string
  all: string
  cancel: string
  retry: string
  remove: string
  sendToChat: string
  useAsInput: string
  revealFile: string
  copyPath: string
  copiedPath: string
  stateQueued: string
  stateRunning: string
  stateDone: string
  stateFailed: string
  stateCancelled: string
  stateExpired: string
  emptyQueue: string
  emptyLibrary: string
  emptyLibraryHint: string
  noProviders: string
  notConfigured: string
  agentSource: string
  jobCount: (n: number) => string
  errorSubmit: string
  paletteOpen: string
  paletteAttachLatest: string
  attachMenuLatest: string
  attachLatestEmpty: string
  notifDone: string
  notifFailed: string
  notifView: string
  count: string
  countCustom: string
  parameters: string
  copyPrompt: string
  copiedPrompt: string
  lightboxPrev: string
  lightboxNext: string
  keyLabel: string
  keyPlaceholder: string
  keySave: string
  keySaved: string
  keyRemove: string
  keyGetAt: (host: string) => string
}

const en: StudioMessages = {
  nav: 'Media',
  title: 'Media Studio',
  create: 'Create',
  queue: 'Queue',
  library: 'Library',
  prompt: 'Prompt',
  promptPlaceholder: 'Describe what to generate…',
  negativePrompt: 'Negative prompt',
  provider: 'Provider',
  model: 'Model',
  aspectRatio: 'Aspect ratio',
  resolution: 'Resolution',
  duration: 'Duration',
  seconds: n => `${n}s`,
  seed: 'Seed',
  seedPlaceholder: 'Random',
  audio: 'Audio',
  startImage: 'Start image',
  clearStartImage: 'Clear start image',
  generate: 'Generate',
  generating: 'Generating…',
  image: 'Image',
  video: 'Video',
  all: 'All',
  cancel: 'Cancel',
  retry: 'Retry',
  remove: 'Remove',
  sendToChat: 'Send to chat',
  useAsInput: 'Use as input',
  revealFile: 'Reveal in Finder',
  copyPath: 'Copy path',
  copiedPath: 'Path copied',
  stateQueued: 'Queued',
  stateRunning: 'Running',
  stateDone: 'Done',
  stateFailed: 'Failed',
  stateCancelled: 'Cancelled',
  stateExpired: 'Expired',
  emptyQueue: 'Nothing generating right now.',
  emptyLibrary: 'No media yet.',
  emptyLibraryHint: 'Generate something above — try "a matte ceramic sphere on concrete, soft studio light".',
  noProviders: 'No providers are configured.',
  notConfigured: 'Not configured',
  agentSource: 'Agent',
  jobCount: n => (n === 1 ? '1 job' : `${n} jobs`),
  errorSubmit: 'Generation failed to submit',
  paletteOpen: 'Media Studio: Open',
  paletteAttachLatest: 'Media Studio: Attach latest generation to chat',
  attachMenuLatest: 'Latest generation',
  attachLatestEmpty: 'No finished generation yet.',
  notifDone: 'Generation complete',
  notifFailed: 'Generation failed',
  notifView: 'View',
  count: 'Generations',
  countCustom: 'Custom',
  parameters: 'Parameters',
  copyPrompt: 'Copy prompt',
  copiedPrompt: 'Prompt copied',
  lightboxPrev: 'Previous (←)',
  lightboxNext: 'Next (→)',
  keyLabel: 'API key',
  keyPlaceholder: 'Paste API key…',
  keySave: 'Save key',
  keySaved: 'Key saved — provider is live',
  keyRemove: 'Remove key',
  keyGetAt: host => `Create one at ${host}`
}

const ja: StudioMessages = {
  nav: 'メディア',
  title: 'メディアスタジオ',
  create: '作成',
  queue: 'キュー',
  library: 'ライブラリ',
  prompt: 'プロンプト',
  promptPlaceholder: '生成する内容を記述…',
  negativePrompt: 'ネガティブプロンプト',
  provider: 'プロバイダー',
  model: 'モデル',
  aspectRatio: 'アスペクト比',
  resolution: '解像度',
  duration: '長さ',
  seconds: n => `${n}秒`,
  seed: 'シード',
  seedPlaceholder: 'ランダム',
  audio: '音声',
  startImage: '開始画像',
  clearStartImage: '開始画像をクリア',
  generate: '生成',
  generating: '生成中…',
  image: '画像',
  video: '動画',
  all: 'すべて',
  cancel: 'キャンセル',
  retry: '再試行',
  remove: '削除',
  sendToChat: 'チャットに送る',
  useAsInput: '入力として使用',
  revealFile: 'Finderで表示',
  copyPath: 'パスをコピー',
  copiedPath: 'パスをコピーしました',
  stateQueued: '待機中',
  stateRunning: '実行中',
  stateDone: '完了',
  stateFailed: '失敗',
  stateCancelled: 'キャンセル済み',
  stateExpired: '期限切れ',
  emptyQueue: '現在生成中のものはありません。',
  emptyLibrary: 'メディアはまだありません。',
  emptyLibraryHint: '上で生成してみてください。例:「コンクリートの上のマットなセラミック球、柔らかいスタジオ照明」',
  noProviders: 'プロバイダーが設定されていません。',
  notConfigured: '未設定',
  agentSource: 'エージェント',
  jobCount: n => `${n}件のジョブ`,
  errorSubmit: '生成の送信に失敗しました',
  paletteOpen: 'メディアスタジオ: 開く',
  paletteAttachLatest: 'メディアスタジオ: 最新の生成をチャットに添付',
  attachMenuLatest: '最新の生成',
  attachLatestEmpty: '完了した生成はまだありません。',
  notifDone: '生成が完了しました',
  notifFailed: '生成に失敗しました',
  notifView: '表示',
  count: '生成数',
  countCustom: 'カスタム',
  parameters: 'パラメータ',
  copyPrompt: 'プロンプトをコピー',
  copiedPrompt: 'プロンプトをコピーしました',
  lightboxPrev: '前へ (←)',
  lightboxNext: '次へ (→)',
  keyLabel: 'APIキー',
  keyPlaceholder: 'APIキーを貼り付け…',
  keySave: 'キーを保存',
  keySaved: 'キーを保存しました — プロバイダーが利用可能になりました',
  keyRemove: 'キーを削除',
  keyGetAt: host => `${host} で作成できます`
}

const zh: StudioMessages = {
  nav: '媒体',
  title: '媒体工作室',
  create: '创建',
  queue: '队列',
  library: '媒体库',
  prompt: '提示词',
  promptPlaceholder: '描述要生成的内容…',
  negativePrompt: '负面提示词',
  provider: '提供商',
  model: '模型',
  aspectRatio: '宽高比',
  resolution: '分辨率',
  duration: '时长',
  seconds: n => `${n}秒`,
  seed: '种子',
  seedPlaceholder: '随机',
  audio: '音频',
  startImage: '起始图像',
  clearStartImage: '清除起始图像',
  generate: '生成',
  generating: '生成中…',
  image: '图像',
  video: '视频',
  all: '全部',
  cancel: '取消',
  retry: '重试',
  remove: '删除',
  sendToChat: '发送到聊天',
  useAsInput: '用作输入',
  revealFile: '在 Finder 中显示',
  copyPath: '复制路径',
  copiedPath: '已复制路径',
  stateQueued: '排队中',
  stateRunning: '运行中',
  stateDone: '完成',
  stateFailed: '失败',
  stateCancelled: '已取消',
  stateExpired: '已过期',
  emptyQueue: '当前没有正在生成的任务。',
  emptyLibrary: '还没有媒体。',
  emptyLibraryHint: '在上方生成一些内容。例如:"混凝土上的哑光陶瓷球,柔和的摄影棚光线"',
  noProviders: '未配置任何提供商。',
  notConfigured: '未配置',
  agentSource: '智能体',
  jobCount: n => `${n} 个任务`,
  errorSubmit: '生成提交失败',
  paletteOpen: '媒体工作室: 打开',
  paletteAttachLatest: '媒体工作室: 将最新生成附加到聊天',
  attachMenuLatest: '最新生成',
  attachLatestEmpty: '还没有完成的生成。',
  notifDone: '生成完成',
  notifFailed: '生成失败',
  notifView: '查看',
  count: '生成数量',
  countCustom: '自定义',
  parameters: '参数',
  copyPrompt: '复制提示词',
  copiedPrompt: '已复制提示词',
  lightboxPrev: '上一个 (←)',
  lightboxNext: '下一个 (→)',
  keyLabel: 'API 密钥',
  keyPlaceholder: '粘贴 API 密钥…',
  keySave: '保存密钥',
  keySaved: '密钥已保存 — 提供商已可用',
  keyRemove: '删除密钥',
  keyGetAt: host => `在 ${host} 创建`
}

const zhHant: StudioMessages = {
  nav: '媒體',
  title: '媒體工作室',
  create: '建立',
  queue: '佇列',
  library: '媒體庫',
  prompt: '提示詞',
  promptPlaceholder: '描述要生成的內容…',
  negativePrompt: '負面提示詞',
  provider: '供應商',
  model: '模型',
  aspectRatio: '寬高比',
  resolution: '解析度',
  duration: '時長',
  seconds: n => `${n}秒`,
  seed: '種子',
  seedPlaceholder: '隨機',
  audio: '音訊',
  startImage: '起始影像',
  clearStartImage: '清除起始影像',
  generate: '生成',
  generating: '生成中…',
  image: '影像',
  video: '影片',
  all: '全部',
  cancel: '取消',
  retry: '重試',
  remove: '刪除',
  sendToChat: '傳送到聊天',
  useAsInput: '用作輸入',
  revealFile: '在 Finder 中顯示',
  copyPath: '複製路徑',
  copiedPath: '已複製路徑',
  stateQueued: '排隊中',
  stateRunning: '執行中',
  stateDone: '完成',
  stateFailed: '失敗',
  stateCancelled: '已取消',
  stateExpired: '已過期',
  emptyQueue: '目前沒有正在生成的任務。',
  emptyLibrary: '還沒有媒體。',
  emptyLibraryHint: '在上方生成一些內容。例如:「混凝土上的霧面陶瓷球,柔和的攝影棚光線」',
  noProviders: '未設定任何供應商。',
  notConfigured: '未設定',
  agentSource: '智慧代理',
  jobCount: n => `${n} 個任務`,
  errorSubmit: '生成提交失敗',
  paletteOpen: '媒體工作室: 開啟',
  paletteAttachLatest: '媒體工作室: 將最新生成附加到聊天',
  attachMenuLatest: '最新生成',
  attachLatestEmpty: '還沒有完成的生成。',
  notifDone: '生成完成',
  notifFailed: '生成失敗',
  notifView: '檢視',
  count: '生成數量',
  countCustom: '自訂',
  parameters: '參數',
  copyPrompt: '複製提示詞',
  copiedPrompt: '已複製提示詞',
  lightboxPrev: '上一個 (←)',
  lightboxNext: '下一個 (→)',
  keyLabel: 'API 金鑰',
  keyPlaceholder: '貼上 API 金鑰…',
  keySave: '儲存金鑰',
  keySaved: '金鑰已儲存 — 供應商已可用',
  keyRemove: '刪除金鑰',
  keyGetAt: host => `在 ${host} 建立`
}

export const STUDIO_LOCALES: PluginLocaleBundles = { en, ja, zh, 'zh-hant': zhHant }

function bind(t: PluginTranslate): StudioMessages {
  const messages = {} as Record<string, unknown>

  for (const key of Object.keys(en) as Array<keyof StudioMessages>) {
    const value = en[key]

    messages[key] = typeof value === 'function' ? (...args: unknown[]) => t(key, ...args) : t(key)
  }

  return messages as StudioMessages
}

export function useStudio(): StudioMessages {
  const t = usePluginI18n('media-studio')

  return useMemo(() => bind(t), [t])
}
