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
  music: string
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
  moreLikeThis: string
  openOriginChat: string
  attachImage: string
  attachUnsupported: string
  attachNotSupported: (model: string) => string
  attachBadType: (name: string) => string
  thumbSize: string
  keyLabel: string
  keyPlaceholder: string
  keySave: string
  keySaved: string
  keyRemove: string
  keyGetAt: (host: string) => string
  musicGenre: string
  musicMood: string
  musicBpm: string
  musicKeySig: string
  musicInstruments: string
  musicTakes: string
  musicVocal: string
  musicLyrics: string
  musicLyricsEdit: string
  musicInstrumental: string
  // audio studio (AudioPanel/MixBar/CoverPanel)
  audioEdit: string
  audioAnalyze: string
  audioTempo: string
  audioLength: string
  audioSectionsCount: string
  audioExportLoop: string
  audioExportHook: string
  audioBars: string
  audioSeconds: string
  audioSmartMaster: string
  audioMasterPreset: string
  audioJob: string
  audioFreeLocal: string
  audioEditCrop: string
  audioEditFade: string
  audioEditSpeed: string
  audioEditReverse: string
  audioCoverThis: string
  audioEditMaster: string
  fileMissing: string
  regenerate: string
  audioStructureLine: string
  audioLoopBars: string
  audioHookSeconds: string
  audioApply: string
  audioStartS: string
  audioEndS: string
  audioFadeInS: string
  audioFadeOutS: string
  audioSpeedFactor: string
  audioSaved: (name: string) => string
  audioDone: string
  audioEditSaved: string
  audioCropInvalid: string
  audioSpeedInvalid: string
  audioPanelFootnote: string
  mixBarForMix: (n: number) => string
  mixBarMix: string
  mixBarBars: string
  mixBarClear: string
  mixBarSubmitted: string
  mixBarNeedTwo: string
  coverAnalyzing: string
  coverLyrics: string
  coverDirection: string
  coverRenderCost: string
  coverRender: string
  lyricsEditPlaceholder: string
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
  music: 'Music',
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
  moreLikeThis: 'More like this (4 variations)',
  openOriginChat: 'Open originating chat',
  attachImage: 'Attach start image (or drag one here)',
  attachUnsupported: 'This model does not take an input image',
  attachNotSupported: model => `${model || 'This model'} does not take an input image`,
  attachBadType: name => `${name}: not a supported image (png, jpg, webp, gif)`,
  thumbSize: 'Thumbnail size',
  keyLabel: 'API key',
  keyPlaceholder: 'Paste API key…',
  keySave: 'Save key',
  keySaved: 'Key saved — provider is live',
  keyRemove: 'Remove key',
  keyGetAt: host => `Create one at ${host}`,
  musicGenre: 'Genre',
  musicMood: 'Mood',
  musicBpm: 'BPM',
  musicKeySig: 'Key',
  musicInstruments: 'Instruments',
  musicTakes: 'Takes',
  musicVocal: 'Vocal',
  musicLyrics: 'Lyrics (optional — auto-written if blank)',
  musicLyricsEdit: 'Edit lyrics (LLM)',
  musicInstrumental: 'Instrumental (no vocals)',
  audioEdit: 'Edit',
  audioAnalyze: 'Analyze',
  audioTempo: 'Tempo',
  audioLength: 'Length',
  audioSectionsCount: 'Sections',
  audioExportLoop: 'Export loop',
  audioExportHook: 'Export hook',
  audioBars: 'bars',
  audioSeconds: 'seconds',
  audioSmartMaster: 'Smart master',
  audioMasterPreset: 'Master preset',
  audioJob: 'job',
  audioFreeLocal: 'all local (free)',
  audioEditCrop: 'Crop…',
  audioEditFade: 'Fade…',
  audioEditSpeed: 'Speed…',
  audioEditReverse: 'Reverse',
  audioCoverThis: 'Cover this track',
  audioEditMaster: 'Edit & master',
  fileMissing: 'File no longer on disk',
  regenerate: 'Regenerate',
  audioStructureLine: 'Structure',
  audioLoopBars: 'Loop (bars)',
  audioHookSeconds: 'Hook (seconds)',
  audioApply: 'Apply',
  audioStartS: 'Start (s)',
  audioEndS: 'End (s)',
  audioFadeInS: 'Fade in (s)',
  audioFadeOutS: 'Fade out (s)',
  audioSpeedFactor: 'Speed ×',
  audioSaved: name => `Saved ${name}`,
  audioDone: 'Done',
  audioEditSaved: 'Edit saved to library',
  audioCropInvalid: 'Crop needs an end after the start',
  audioSpeedInvalid: 'Speed needs a positive factor',
  audioPanelFootnote: 'Edits render alongside the source; each result becomes a new library row. Loop picks the seam-smoothest region on the measured downbeat grid; hook finds the most energetic window and snaps it to a downbeat.',
  mixBarForMix: n => `${n} for mix`,
  mixBarMix: 'Mix',
  mixBarBars: 'bars',
  mixBarClear: 'Clear',
  mixBarSubmitted: 'Mix rendering in the queue',
  mixBarNeedTwo: 'Select at least 2 tracks to mix',
  coverAnalyzing: 'Analyzing reference (free — ASR + structure)…',
  coverLyrics: 'Lyrics (extracted — edit before the cover renders)',
  coverDirection: 'Cover direction (style prompt for the new render)',
  coverRenderCost: 'ASR + structure free · one render bills one cover',
  coverRender: 'Render cover',
  lyricsEditPlaceholder: "Edit direction — e.g. 'darker chorus', 'make verse 2 about rain'"
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
  music: '音楽',
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
  moreLikeThis: '似た画像を生成 (4枚)',
  openOriginChat: '元のチャットを開く',
  attachImage: '開始画像を添付（ここにドラッグも可）',
  attachUnsupported: 'このモデルは入力画像に対応していません',
  attachNotSupported: model => `${model || 'このモデル'}は入力画像に対応していません`,
  attachBadType: name => `${name}: 対応していない画像形式です (png, jpg, webp, gif)`,
  thumbSize: 'サムネイルサイズ',
  keyLabel: 'APIキー',
  keyPlaceholder: 'APIキーを貼り付け…',
  keySave: 'キーを保存',
  keySaved: 'キーを保存しました — プロバイダーが利用可能になりました',
  keyRemove: 'キーを削除',
  keyGetAt: host => `${host} で作成できます`,
  musicGenre: 'ジャンル',
  musicMood: 'ムード',
  musicBpm: 'BPM',
  musicKeySig: 'キー',
  musicInstruments: '楽器',
  musicTakes: 'テイク数',
  musicVocal: 'ボーカル',
  musicLyrics: '歌詞（任意 — 空欄なら自動生成）',
  musicLyricsEdit: '歌詞を編集 (LLM)',
  musicInstrumental: 'インストゥルメンタル（ボーカルなし）',
  audioEdit: '編集',
  audioAnalyze: '解析',
  audioTempo: 'テンポ',
  audioLength: '長さ',
  audioSectionsCount: 'セクション',
  audioExportLoop: 'ループを書き出す',
  audioExportHook: 'フックを書き出す',
  audioBars: '小節',
  audioSeconds: '秒',
  audioSmartMaster: 'スマートマスター',
  audioMasterPreset: 'マスタープリセット',
  audioJob: 'ジョブ',
  audioFreeLocal: 'すべてローカル（無料）',
  audioEditCrop: 'クロップ…',
  audioEditFade: 'フェード…',
  audioEditSpeed: '速度…',
  audioEditReverse: '反転',
  audioCoverThis: 'このトラックをカバー',
  audioEditMaster: '編集とマスタリング',
  fileMissing: 'ファイルがディスクにありません',
  regenerate: '再生成',
  audioStructureLine: '構造',
  audioLoopBars: 'ループ（小節）',
  audioHookSeconds: 'フック（秒）',
  audioApply: '適用',
  audioStartS: '開始（秒）',
  audioEndS: '終了（秒）',
  audioFadeInS: 'フェードイン（秒）',
  audioFadeOutS: 'フェードアウト（秒）',
  audioSpeedFactor: '速度 ×',
  audioSaved: name => `${name} を保存しました`,
  audioDone: '完了',
  audioEditSaved: '編集をライブラリに保存しました',
  audioCropInvalid: 'クロップは開始より後の終了が必要です',
  audioSpeedInvalid: '速度には正の倍率が必要です',
  audioPanelFootnote: '編集はソースと並んで書き出され、それぞれが新しいライブラリ項目になります。ループは計測済みダウンビートグリッド上で最も継ぎ目の滑らかな領域を、フックは最もエネルギーの高い区間を選びます。',
  mixBarForMix: n => `${n} 件をミックス`,
  mixBarMix: 'ミックス',
  mixBarBars: '小節',
  mixBarClear: 'クリア',
  mixBarSubmitted: 'ミックスをキューに入れました',
  mixBarNeedTwo: 'ミックスには2曲以上選択してください',
  coverAnalyzing: '参照を解析中（無料 — ASR + 構造）…',
  coverLyrics: '歌詞（抽出済み — カバーをレンダリングする前に編集）',
  coverDirection: 'カバーの方向性（新しいレンダリング用のスタイルプロンプト）',
  coverRenderCost: 'ASR + 構造は無料 · レンダリング1回でカバー1枚課金',
  coverRender: 'カバーをレンダリング',
  lyricsEditPlaceholder: '編集の方向性 — 例：「サビをもっと暗く」「バース2を雨について」'
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
  music: '音乐',
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
  moreLikeThis: '生成相似图 (4张)',
  openOriginChat: '打开来源对话',
  attachImage: '添加起始图（也可拖拽到此处）',
  attachUnsupported: '该模型不支持输入图像',
  attachNotSupported: model => `${model || '该模型'}不支持输入图像`,
  attachBadType: name => `${name}：不支持的图像格式 (png, jpg, webp, gif)`,
  thumbSize: '缩略图大小',
  keyLabel: 'API 密钥',
  keyPlaceholder: '粘贴 API 密钥…',
  keySave: '保存密钥',
  keySaved: '密钥已保存 — 提供商已可用',
  keyRemove: '删除密钥',
  keyGetAt: host => `在 ${host} 创建`,
  musicGenre: '风格',
  musicMood: '情绪',
  musicBpm: 'BPM',
  musicKeySig: '调性',
  musicInstruments: '乐器',
  musicTakes: '版本数',
  musicVocal: '人声',
  musicLyrics: '歌词（可选 — 留空自动生成）',
  musicLyricsEdit: '编辑歌词 (LLM)',
  musicInstrumental: '纯音乐（无人声）',
  audioEdit: '编辑',
  audioAnalyze: '分析',
  audioTempo: '速度 (BPM)',
  audioLength: '时长',
  audioSectionsCount: '段落',
  audioExportLoop: '导出循环',
  audioExportHook: '导出副歌',
  audioBars: '小节',
  audioSeconds: '秒',
  audioSmartMaster: '智能母带',
  audioMasterPreset: '母带预设',
  audioJob: '任务',
  audioFreeLocal: '全部本地（免费）',
  audioEditCrop: '裁剪…',
  audioEditFade: '淡入/淡出…',
  audioEditSpeed: '变速…',
  audioEditReverse: '反转',
  audioCoverThis: '翻唱此曲',
  audioEditMaster: '编辑与母带',
  fileMissing: '文件已不在磁盘上',
  regenerate: '重新生成',
  audioStructureLine: '结构',
  audioLoopBars: '循环（小节）',
  audioHookSeconds: '副歌（秒）',
  audioApply: '应用',
  audioStartS: '开始（秒）',
  audioEndS: '结束（秒）',
  audioFadeInS: '淡入（秒）',
  audioFadeOutS: '淡出（秒）',
  audioSpeedFactor: '速度 ×',
  audioSaved: name => `已保存 ${name}`,
  audioDone: '完成',
  audioEditSaved: '编辑已保存到媒体库',
  audioCropInvalid: '裁剪的结束时间需晚于开始时间',
  audioSpeedInvalid: '速度需要正数倍率',
  audioPanelFootnote: '编辑结果与源文件并存，每个结果都会成为新的媒体库条目。循环会在测得的强拍网格上选取接缝最平滑的区域；副歌会找到能量最高的片段并对齐强拍。',
  mixBarForMix: n => `已选 ${n} 首混音`,
  mixBarMix: '混音',
  mixBarBars: '小节',
  mixBarClear: '清空',
  mixBarSubmitted: '混音已加入队列',
  mixBarNeedTwo: '混音至少需要选择 2 首曲目',
  coverAnalyzing: '正在分析参考音轨（免费 — ASR + 结构）…',
  coverLyrics: '歌词（已提取 — 渲染前先编辑）',
  coverDirection: '翻唱方向（新一次渲染的风格提示词）',
  coverRenderCost: 'ASR + 结构免费 · 渲染一次计一次翻唱费用',
  coverRender: '渲染翻唱',
  lyricsEditPlaceholder: '编辑方向 — 例如：“副歌更暗一些”“第2段写雨”'
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
  music: '音樂',
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
  moreLikeThis: '生成相似圖 (4張)',
  openOriginChat: '開啟來源對話',
  attachImage: '加入起始圖（也可拖曳到此處）',
  attachUnsupported: '此模型不支援輸入圖像',
  attachNotSupported: model => `${model || '此模型'}不支援輸入圖像`,
  attachBadType: name => `${name}：不支援的圖像格式 (png, jpg, webp, gif)`,
  thumbSize: '縮圖大小',
  keyLabel: 'API 金鑰',
  keyPlaceholder: '貼上 API 金鑰…',
  keySave: '儲存金鑰',
  keySaved: '金鑰已儲存 — 供應商已可用',
  keyRemove: '刪除金鑰',
  keyGetAt: host => `在 ${host} 建立`,
  musicGenre: '風格',
  musicMood: '情緒',
  musicBpm: 'BPM',
  musicKeySig: '調性',
  musicInstruments: '樂器',
  musicTakes: '版本數',
  musicVocal: '人聲',
  musicLyrics: '歌詞（可選 — 留空自動生成）',
  musicLyricsEdit: '編輯歌詞 (LLM)',
  musicInstrumental: '純音樂（無人聲）',
  audioEdit: '編輯',
  audioAnalyze: '解析',
  audioTempo: '速度 (BPM)',
  audioLength: '時長',
  audioSectionsCount: '段落',
  audioExportLoop: '匯出循環',
  audioExportHook: '匯出副歌',
  audioBars: '小節',
  audioSeconds: '秒',
  audioSmartMaster: '智慧母帶',
  audioMasterPreset: '母帶預設',
  audioJob: '任務',
  audioFreeLocal: '全部本地（免費）',
  audioEditCrop: '裁剪…',
  audioEditFade: '淡入/淡出…',
  audioEditSpeed: '變速…',
  audioEditReverse: '反轉',
  audioCoverThis: '翻唱此曲',
  audioEditMaster: '編輯與母帶',
  fileMissing: '檔案已不在磁碟上',
  regenerate: '重新生成',
  audioStructureLine: '結構',
  audioLoopBars: '循環（小節）',
  audioHookSeconds: '副歌（秒）',
  audioApply: '套用',
  audioStartS: '開始（秒）',
  audioEndS: '結束（秒）',
  audioFadeInS: '淡入（秒）',
  audioFadeOutS: '淡出（秒）',
  audioSpeedFactor: '速度 ×',
  audioSaved: name => `已儲存 ${name}`,
  audioDone: '完成',
  audioEditSaved: '編輯已儲存到媒體庫',
  audioCropInvalid: '裁剪的結束時間需晚於開始時間',
  audioSpeedInvalid: '速度需要正數倍率',
  audioPanelFootnote: '編輯結果與來源檔案並存，每個結果都會成為新的媒體庫項目。循環會在測得的強拍網格上選取接縫最平滑的區域；副歌會找到能量最高的片段並對齊強拍。',
  mixBarForMix: n => `已選 ${n} 首混音`,
  mixBarMix: '混音',
  mixBarBars: '小節',
  mixBarClear: '清空',
  mixBarSubmitted: '混音已加入佇列',
  mixBarNeedTwo: '混音至少需要選擇 2 首曲目',
  coverAnalyzing: '正在分析參考音軌（免費 — ASR + 結構）…',
  coverLyrics: '歌詞（已擷取 — 渲染前先編輯）',
  coverDirection: '翻唱方向（新一次渲染的風格提示詞）',
  coverRenderCost: 'ASR + 結構免費 · 渲染一次計一次翻唱費用',
  coverRender: '渲染翻唱',
  lyricsEditPlaceholder: '編輯方向 — 例如：「副歌更暗一些」「第2段寫雨」'
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
