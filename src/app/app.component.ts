import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NbAlertModule,
  NbBadgeModule,
  NbButtonModule,
  NbCardModule,
  NbCheckboxModule,
  NbIconModule,
  NbInputModule,
  NbLayoutModule,
  NbOptionModule,
  NbSelectModule,
  NbTabsetModule,
  NbToastrModule,
  NbToastrService
} from '@nebular/theme';

type WorkspaceView = 'compose' | 'checks' | 'rehearsal' | 'review' | 'versions';
type ReviewStatus = 'pending' | 'approved' | 'changes';
type NoticeStatus = 'draft' | 'in-review' | 'locked';
type CheckLevel = 'error' | 'warning' | 'info';
type ChannelGroup = 'sms' | 'broadcast' | 'web';
type RehearsalStatus = 'pending' | 'sent' | 'failed' | 'blocked';

interface LanguageVersion {
  id: string;
  locale: string;
  name: string;
  title: string;
  body: string;
  translator: string;
  reviewed: boolean;
}

interface Discussion {
  id: string;
  languageId: string;
  sentenceIndex: number;
  author: string;
  role: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

interface RoleReview {
  role: '编辑' | '法务' | '翻译' | '发布人';
  owner: string;
  status: ReviewStatus;
  note: string;
}

interface RehearsalAttempt {
  id: string;
  batchId: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  reason?: string;
}

interface RehearsalBatch {
  id: string;
  channel: string;
  channelGroup: ChannelGroup;
  locale: string;
  languageName: string;
  title: string;
  content: string;
  sequence: number;
  total: number;
  plannedAt: string;
  leadMinutes: number;
  status: RehearsalStatus;
  blockedReason?: string;
  sentAt?: string;
  failureReason?: string;
  attempts: RehearsalAttempt[];
}

interface RehearsalEvent {
  id: string;
  type: 'plan-generated' | 'send-result' | 'reset' | 'rebuild';
  message: string;
  createdAt: string;
  ok?: boolean;
}

interface RehearsalState {
  signature: string;
  generatedAt: string;
  source: string;
  channelLocales: Record<string, string[]>;
  batches: RehearsalBatch[];
  events: RehearsalEvent[];
}

interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  version: string;
  title: string;
  severity: string;
  scope: string;
  eventAt: string;
  effectiveAt: string;
  expiresAt: string;
  channels: string[];
  requiredLocales: string[];
  channelLocales?: Record<string, string[]>;
  rehearsal?: RehearsalState;
  languages: LanguageVersion[];
  note: string;
  emergency: boolean;
}

interface NoticeDraft {
  id: string;
  title: string;
  eventType: string;
  severity: string;
  scope: string;
  channels: string[];
  channelLocales: Record<string, string[]>;
  rehearsal: RehearsalState;
  eventAt: string;
  effectiveAt: string;
  expiresAt: string;
  requiredLocales: string[];
  languages: LanguageVersion[];
  discussions: Discussion[];
  reviews: RoleReview[];
  versions: VersionSnapshot[];
  status: NoticeStatus;
  version: string;
  lockedAt?: string;
  emergencyRevision: boolean;
  updatedAt: string;
}

interface CheckResult {
  id: string;
  category: string;
  level: CheckLevel;
  title: string;
  detail: string;
}

interface DiffRow {
  left: string;
  right: string;
  kind: 'same' | 'changed' | 'added' | 'removed';
}

interface NoticeTemplate {
  id: string;
  name: string;
  description: string;
  eventType: string;
  severity: string;
  scope: string;
  channels: string[];
  title: Record<string, string>;
  body: Record<string, string>;
}

interface ChannelSpec {
  group: ChannelGroup;
  capacity: number;
}

interface RehearsalChannelModel {
  channel: string;
  group: ChannelGroup;
  groupLabel: string;
  leadMinutes: number;
  plannedAt: string;
  locales: string[];
  batches: RehearsalBatch[];
  status: RehearsalStatus;
  blockedReason?: string;
  waitingReason?: string;
}

const STORAGE_KEY = 'sologsb-1025-emergency-notice-v1';

const LOCALE_OPTIONS = [
  { id: 'zh-CN', name: '简体中文' },
  { id: 'en', name: 'English' },
  { id: 'ja', name: '日本語' },
  { id: 'ko', name: '한국어' },
  { id: 'es', name: 'Español' }
];

const CHANNEL_SPECS: Record<string, ChannelSpec> = {
  短信: { group: 'sms', capacity: 70 },
  广播: { group: 'broadcast', capacity: 300 },
  社区大屏: { group: 'broadcast', capacity: 500 },
  应急喇叭: { group: 'broadcast', capacity: 200 },
  政务新媒体: { group: 'web', capacity: 2000 },
  网站: { group: 'web', capacity: 5000 }
};

const GROUP_LABELS: Record<ChannelGroup, string> = {
  sms: '短信',
  broadcast: '广播 / 大屏 / 喇叭',
  web: '网站 / 政务新媒体'
};

const LEAD_MINUTES: Record<string, Record<ChannelGroup, number>> = {
  红色: { sms: 30, broadcast: 15, web: 10 },
  橙色: { sms: 20, broadcast: 10, web: 5 },
  黄色: { sms: 10, broadcast: 5, web: 0 },
  蓝色: { sms: 5, broadcast: 0, web: 0 }
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function stableId(prefix: string, value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}-${text.length.toString(36)}`;
}

function parseTime(value: string): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function localeDisplayName(locale: string): string {
  return LOCALE_OPTIONS.find((item) => item.id === locale)?.name ?? locale;
}

function resolveChannelSpec(channel: string): ChannelSpec {
  return CHANNEL_SPECS[channel] ?? { group: 'web', capacity: 1000 };
}

function groupLabel(group: ChannelGroup): string {
  return GROUP_LABELS[group];
}

function leadForGroup(severity: string, group: ChannelGroup): number {
  return LEAD_MINUTES[severity]?.[group] ?? 0;
}

function leadForChannel(severity: string, channel: string): number {
  return leadForGroup(severity, resolveChannelSpec(channel).group);
}

function defaultChannelLocales(channels: string[], requiredLocales: string[]): Record<string, string[]> {
  return Object.fromEntries(channels.map((channel) => {
    if (channel === '社区大屏') return [channel, ['zh-CN', 'en']];
    const group = resolveChannelSpec(channel).group;
    if (group === 'web') return [channel, LOCALE_OPTIONS.filter((locale) => requiredLocales.includes(locale.id)).map((locale) => locale.id)];
    return [channel, ['zh-CN']];
  }));
}

function normalizeChannelLocales(
  channels: string[],
  requiredLocales: string[],
  current?: Record<string, string[]>
): Record<string, string[]> {
  const defaults = defaultChannelLocales(channels, requiredLocales);
  return Object.fromEntries(channels.map((channel) => [
    channel,
    current?.[channel]?.length ? current[channel] : defaults[channel]
  ]));
}

function splitLongContent(text: string, capacity: number): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  if (normalized.length <= capacity) return [normalized];

  const markerReserve = 8;
  const chunkSize = Math.max(10, capacity - markerReserve);
  const chunks: string[] = [];
  for (let start = 0; start < normalized.length; start += chunkSize) {
    chunks.push(normalized.slice(start, start + chunkSize));
  }
  return chunks.map((chunk, index) => `${chunk}（${index + 1}/${chunks.length}）`);
}

type RehearsalInput = Pick<
  NoticeDraft,
  'eventAt' | 'severity' | 'channels' | 'requiredLocales' | 'channelLocales' | 'languages'
>;

function buildRehearsalPlan(
  input: RehearsalInput,
  options: { source: string; preserve?: RehearsalState; generatedAt?: string }
): RehearsalState {
  const channelLocales = normalizeChannelLocales(input.channels, input.requiredLocales, input.channelLocales);
  const eventTime = parseTime(input.eventAt);
  const orderedChannels = input.channels
    .map((channel, originalIndex) => ({
      channel,
      originalIndex,
      lead: leadForChannel(input.severity, channel)
    }))
    .sort((left, right) => right.lead - left.lead || left.originalIndex - right.originalIndex);

  const signature = stableId('plan', {
    eventAt: input.eventAt,
    severity: input.severity,
    channels: orderedChannels.map((item) => item.channel),
    channelLocales,
    languages: input.languages.map((language) => ({
      id: language.id,
      title: language.title,
      body: language.body
    }))
  });

  if (options.preserve?.signature === signature) return options.preserve;

  const batches: RehearsalBatch[] = [];

  orderedChannels.forEach(({ channel, lead }) => {
    const spec = resolveChannelSpec(channel);
    const plannedAt = eventTime ? new Date(eventTime - lead * 60_000).toISOString() : '';
    const locales = channelLocales[channel] ?? [];
    const blockers: string[] = [];

    if (!eventTime) blockers.push('事件时间无效');
    if (!locales.length) blockers.push('未配置依赖语言');

    locales.forEach((locale) => {
      const language = input.languages.find((item) => item.id === locale);
      if (!language) blockers.push(`${localeDisplayName(locale)}翻译缺失`);
      else if (!language.title.trim() || !language.body.trim()) blockers.push(`${language.name}标题或正文为空`);
    });

    const blockedReason = blockers.length ? `${Array.from(new Set(blockers)).join('、')}，${channel}暂不发送。` : undefined;

    if (!locales.length) {
      const id = stableId('batch', [channel, 'no-locale', plannedAt, lead, blockers.join('|')]);
      const previous = options.preserve?.batches.find((batch) => batch.id === id);
      batches.push(previous ?? {
        id, channel, channelGroup: spec.group, locale: '', languageName: '未配置语言', title: '', content: '',
        sequence: 1, total: 1, plannedAt, leadMinutes: lead, status: 'blocked', blockedReason, attempts: []
      });
      return;
    }

    locales.forEach((locale) => {
      const language = input.languages.find((item) => item.id === locale);
      const languageName = language?.name ?? localeDisplayName(locale);

      if (!language || !language.title.trim() || !language.body.trim()) {
        const id = stableId('batch', [channel, locale, 'missing', plannedAt, lead, blockers.join('|')]);
        const previous = options.preserve?.batches.find((batch) => batch.id === id);
        batches.push(previous ?? {
          id, channel, channelGroup: spec.group, locale, languageName,
          title: language?.title ?? `${languageName}翻译缺失`, content: '',
          sequence: 1, total: 1, plannedAt, leadMinutes: lead, status: 'blocked', blockedReason, attempts: []
        });
        return;
      }

      const rawContent = spec.group === 'sms'
        ? language.body.trim()
        : `${language.title.trim()}\n\n${language.body.trim()}`;
      const chunks = splitLongContent(rawContent, spec.capacity);

      chunks.forEach((content, index) => {
        const sequence = index + 1;
        const id = stableId('batch', [
          channel, locale, sequence, chunks.length, content, plannedAt, lead, input.severity
        ]);
        const previous = options.preserve?.batches.find((batch) => batch.id === id);
        batches.push(previous ?? {
          id, channel, channelGroup: spec.group, locale, languageName: language.name,
          title: language.title, content, sequence, total: chunks.length, plannedAt, leadMinutes: lead,
          status: blockedReason ? 'blocked' : 'pending', blockedReason, attempts: []
        });
      });
    });
  });

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const sourceLabel = options.source === 'draft' ? '当前草稿' : `历史版本 ${options.source}`;
  const events = options.preserve ? [...options.preserve.events] : [];
  events.push({
    id: uid('rehearsal-event'),
    type: options.source === 'draft' ? 'plan-generated' : 'rebuild',
    createdAt: generatedAt,
    message: `已根据${sourceLabel}生成发布预演计划，共 ${batches.length} 个批次。`
  });
  if (events.length > 80) events.splice(0, events.length - 80);

  return { signature, generatedAt, source: options.source, channelLocales, batches, events };
}

function initialDraft(): NoticeDraft {
  const first: VersionSnapshot = {
    id: 'version-1-0-0',
    label: '首次发布稿',
    createdAt: '2026-09-23T08:10:00+08:00',
    version: '1.0.0',
    title: '台风“海燕”橙色预警通知',
    scope: '滨海新区沿海街道',
    severity: '橙色',
    eventAt: '2026-09-23T07:30:00+08:00',
    effectiveAt: '2026-09-23T09:00:00+08:00',
    expiresAt: '2026-09-24T08:00:00+08:00',
    channels: ['短信', '广播', '社区大屏'],
    requiredLocales: ['zh-CN', 'en'],
    note: '发布范围覆盖滨海新区。',
    emergency: false,
    languages: [
      {
        id: 'zh-CN', locale: 'zh-CN', name: '简体中文', title: '台风“海燕”橙色预警通知',
        body: '请滨海新区居民立即停止户外活动。预计今天下午出现强风和暴雨。请远离临时建筑，并关注后续通知。',
        translator: '林晓', reviewed: true
      },
      {
        id: 'en', locale: 'en', name: 'English', title: 'Orange alert for Typhoon Haiyan',
        body: 'Residents in Binhai New Area should stop outdoor activities immediately. Strong winds and heavy rain are expected this afternoon. Stay away from temporary structures and monitor further notices.',
        translator: '周晴', reviewed: true
      }
    ]
  };

  const second: VersionSnapshot = {
    ...clone(first),
    id: 'version-1-1-0',
    label: '扩大影响范围',
    createdAt: '2026-09-24T10:35:00+08:00',
    version: '1.1.0',
    title: '台风“海燕”橙色预警及人员转移通知',
    scope: '滨海新区全区，重点为沿海街道',
    note: '增加沿海街道转移要求。',
    languages: [
      {
        ...clone(first.languages[0]),
        id: 'zh-CN',
        title: '台风“海燕”橙色预警及人员转移通知',
        body: '请滨海新区居民立即停止户外活动。沿海街道居民请于今日17时前转移至就近安置点。预计今天下午出现强风和暴雨。请远离临时建筑，并关注后续通知。'
      } as LanguageVersion,
      {
        ...clone(first.languages[1]),
        id: 'en',
        title: 'Orange alert and evacuation notice for Typhoon Haiyan',
        body: 'Residents in Binhai New Area should stop outdoor activities immediately. Residents of coastal subdistricts must move to the nearest shelter before 17:00 today. Strong winds and heavy rain are expected this afternoon. Stay away from temporary structures and monitor further notices.'
      } as LanguageVersion
    ]
  };

  const draft = {
    id: 'notice-haiyan-2026',
    title: '台风“海燕”橙色预警及人员转移通知',
    eventType: '台风',
    severity: '橙色',
    scope: '滨海新区全区，重点为沿海街道',
    channels: ['短信', '广播', '社区大屏', '政务新媒体', '网站'],
    eventAt: '2026-09-25T07:30',
    effectiveAt: '2026-09-25T09:00',
    expiresAt: '2026-09-26T08:00',
    requiredLocales: ['zh-CN', 'en', 'ja'],
    languages: [
      {
        id: 'zh-CN', locale: 'zh-CN', name: '简体中文', title: '台风“海燕”橙色预警及人员转移通知',
        body: '请滨海新区居民立即停止户外活动。沿海街道居民请于今日17时前转移至就近安置点。预计今天下午出现强风和暴雨。不要停留在临时建筑附近，并持续关注后续通知。',
        translator: '林晓', reviewed: true
      },
      {
        id: 'en', locale: 'en', name: 'English', title: 'Orange alert and evacuation notice for Typhoon Haiyan',
        body: 'Residents in Binhai New Area should stop outdoor activities immediately. Residents of coastal subdistricts must move to the nearest shelter before 17:00 today. Strong winds and heavy rain are expected this afternoon. Keep away from temporary buildings and continue to monitor further notices.',
        translator: '周晴', reviewed: true
      },
      {
        id: 'ja', locale: 'ja', name: '日本語', title: '台風「ハイエン」オレンジ警報',
        body: '浜海新区の住民は直ちに屋外活動を中止してください。本日午後、強風と大雨が見込まれます。仮設建物に近づかず、今後の通知を確認してください。',
        translator: '佐藤 明', reviewed: false
      }
    ],
    discussions: [
      {
        id: 'comment-1', languageId: 'zh-CN', sentenceIndex: 1, author: '陈冉', role: '法务审阅',
        text: '建议明确安置点地址由属地另行发送，避免通知被理解为完整点位清单。', createdAt: '2026-09-25T08:16:00+08:00', resolved: false
      }
    ],
    reviews: [
      { role: '编辑', owner: '林晓', status: 'approved', note: '事件要素完整。' },
      { role: '法务', owner: '陈冉', status: 'changes', note: '转移表述需补充依据。' },
      { role: '翻译', owner: '周晴', status: 'pending', note: '等待日文版复核。' },
      { role: '发布人', owner: '值班中心', status: 'pending', note: '' }
    ],
    versions: [first, second],
    status: 'in-review',
    version: '1.2.0-draft',
    emergencyRevision: false,
    updatedAt: new Date().toISOString()
  } as NoticeDraft;

  draft.channelLocales = defaultChannelLocales(draft.channels, draft.requiredLocales);
  draft.rehearsal = buildRehearsalPlan(draft, { source: 'draft', generatedAt: draft.updatedAt });
  return draft;
}

const TEMPLATES: NoticeTemplate[] = [
  {
    id: 'typhoon', name: '台风人员转移', description: '适用于沿海区域人员转移和停业停课提醒。',
    eventType: '台风', severity: '橙色', scope: '沿海街道', channels: ['短信', '广播', '社区大屏'],
    title: { 'zh-CN': '台风预警及人员转移通知', en: 'Typhoon alert and evacuation notice', ja: '台風警報・避難のお知らせ' },
    body: {
      'zh-CN': '请相关区域居民立即停止户外活动。危险区域人员请按属地安排转移至安全场所。预计将出现强风和暴雨，请远离临时建筑并关注后续通知。',
      en: 'Residents in the affected area should stop outdoor activities immediately. People in high-risk areas must follow local evacuation arrangements. Strong winds and heavy rain are expected. Stay away from temporary structures and monitor further notices.',
      ja: '対象地域の住民は直ちに屋外活動を中止してください。危険地域の方は自治体の避難指示に従ってください。強風と大雨が見込まれます。仮設建物に近づかず、今後の通知を確認してください。'
    }
  },
  {
    id: 'water', name: '供水异常', description: '适用于计划停水和恢复供水通知。',
    eventType: '公共设施', severity: '黄色', scope: '城市供水片区', channels: ['短信', '政务新媒体'],
    title: { 'zh-CN': '计划停水通知', en: 'Planned water service interruption', ja: '断水のお知らせ' },
    body: {
      'zh-CN': '因管网维护，相关区域将于指定时间暂停供水。请提前储水并关闭用水设备。恢复供水后可能出现短时浑浊，请排放后再使用。',
      en: 'Water service will be temporarily suspended for network maintenance. Please store water in advance and close water fixtures. Water may appear cloudy when service resumes; run the tap before use.',
      ja: '管路保守作業のため、対象地域では一時的に断水します。事前に水を確保し、水道設備を閉めてください。復旧後は濁りが生じる場合があるため、しばらく通水してから使用してください。'
    }
  },
  {
    id: 'public-safety', name: '公共安全提醒', description: '适用于大型活动周边临时管控。',
    eventType: '公共安全', severity: '黄色', scope: '活动周边道路', channels: ['广播', '社区大屏', '政务新媒体'],
    title: { 'zh-CN': '大型活动期间临时交通提醒', en: 'Temporary traffic notice during major event', ja: '大規模イベント期間中の交通規制' },
    body: {
      'zh-CN': '活动期间部分道路将采取临时管控措施。请服从现场指引，合理规划出行路线，非必要不前往管控区域。',
      en: 'Temporary traffic controls will be in place during the event. Follow on-site directions, plan your route, and avoid restricted areas unless necessary.',
      ja: 'イベント期間中、一部道路で交通規制を行います。現場の案内に従い、移動経路を事前に確認してください。不要な場合は規制区域への立入りを控えてください。'
    }
  }
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NbLayoutModule,
    NbCardModule,
    NbButtonModule,
    NbInputModule,
    NbSelectModule,
    NbOptionModule,
    NbCheckboxModule,
    NbTabsetModule,
    NbIconModule,
    NbBadgeModule,
    NbAlertModule,
    NbToastrModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  readonly templates = TEMPLATES;
  readonly eventTypes = ['台风', '暴雨', '地震', '公共卫生', '公共设施', '公共安全'];
  readonly severities = ['蓝色', '黄色', '橙色', '红色'];
  readonly channelOptions = ['短信', '广播', '社区大屏', '政务新媒体', '应急喇叭', '网站'];
  readonly locales = LOCALE_OPTIONS;
  readonly channelGroups: ChannelGroup[] = ['sms', 'broadcast', 'web'];
  readonly bannedTerms = ['大概', '可能吧', '无需恐慌', '绝对不会', '保证安全'];
  readonly glossary = [
    { canonical: '立即', variants: ['马上', '赶紧'] },
    { canonical: '安置点', variants: ['避难所', '庇护所'] },
    { canonical: '持续关注', variants: ['随时留意', '保持观看'] }
  ];
  readonly roles: RoleReview['role'][] = ['编辑', '法务', '翻译', '发布人'];

  draft: NoticeDraft = initialDraft();
  activeView: WorkspaceView = 'compose';
  selectedLanguageId = 'zh-CN';
  selectedSentenceIndex = 0;
  selectedTemplateId = 'typhoon';
  discussionText = '';
  currentRole: RoleReview['role'] = '编辑';
  compareBaseId = '';
  compareTargetId = '';
  lastSavedAt = '';
  history: NoticeDraft[] = [];
  future: NoticeDraft[] = [];
  rehearsalRunning = false;
  faultChannels: string[] = [];

  constructor(private readonly toastr: NbToastrService) {}

  ngOnInit(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        this.draft = this.migrate(JSON.parse(saved) as NoticeDraft);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        this.draft = initialDraft();
      }
    }
    this.compareBaseId = this.draft.versions.at(-2)?.id ?? '';
    this.compareTargetId = this.draft.versions.at(-1)?.id ?? '';
    this.lastSavedAt = this.formatDateTime(this.draft.updatedAt);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier) return;
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveNow();
      this.toastr.success('草稿已保存在当前浏览器。', '保存成功');
    }
  }

  get selectedLanguage(): LanguageVersion {
    return this.draft.languages.find((language) => language.id === this.selectedLanguageId) ?? this.draft.languages[0];
  }

  get selectedTemplateDescription(): string {
    return this.templates.find((template) => template.id === this.selectedTemplateId)?.description ?? '请选择一个模板';
  }

  get unresolvedDiscussionCount(): number {
    return this.draft.discussions.filter((discussion) => !discussion.resolved).length;
  }

  get currentSentences(): string[] {
    return this.splitSentences(this.selectedLanguage?.body ?? '');
  }

  get activeDiscussions(): Discussion[] {
    return this.draft.discussions.filter((discussion) => discussion.languageId === this.selectedLanguageId);
  }

  get checks(): CheckResult[] {
    const checks: CheckResult[] = [];
    const requiredMeta: Array<[string, string]> = [
      ['标题', this.draft.title], ['事件类型', this.draft.eventType], ['严重程度', this.draft.severity],
      ['影响范围', this.draft.scope], ['事件时间', this.draft.eventAt], ['生效时间', this.draft.effectiveAt],
      ['失效时间', this.draft.expiresAt]
    ];
    requiredMeta.filter(([, value]) => !value).forEach(([label]) => checks.push({
      id: `meta-${label}`, category: '必填信息', level: 'error', title: `缺少${label}`,
      detail: `请补全通知的${label}后再提交发布。`
    }));
    if (!this.draft.channels.length) checks.push({
      id: 'channels', category: '发布渠道', level: 'error', title: '未选择目标渠道', detail: '至少选择一个目标发布渠道。'
    });

    this.draft.requiredLocales.forEach((locale) => {
      if (!this.draft.languages.some((language) => language.id === locale)) {
        const name = this.locales.find((item) => item.id === locale)?.name ?? locale;
        checks.push({
          id: `missing-${locale}`, category: '语言完整性', level: 'warning', title: `${name}版本缺失`,
          detail: `该语言只会阻断勾选依赖${name}的渠道；不要求该语言的渠道仍可预演和发送。`
        });
      }
    });

    this.draft.languages.forEach((language) => {
      if (!language.title.trim() || !language.body.trim()) checks.push({
        id: `required-${language.id}`, category: '必填信息', level: 'error', title: `${language.name}内容不完整`,
        detail: '语言版本必须包含标题和正文。'
      });
      if (!language.reviewed) checks.push({
        id: `review-${language.id}`, category: '版本审阅', level: language.id === 'ja' ? 'warning' : 'info',
        title: `${language.name}尚未完成语言复核`, detail: '发布前应确认措辞、术语和本地化表达。'
      });
      const banned = this.bannedTerms.filter((term) => language.body.includes(term));
      if (banned.length) checks.push({
        id: `banned-${language.id}`, category: '禁用词', level: 'error', title: `${language.name}包含禁用词`,
        detail: `请替换：${banned.join('、')}。`
      });
      const inconsistent = this.glossary.filter((entry) => {
        const variantCount = entry.variants.filter((variant) => language.body.includes(variant)).length;
        return variantCount > 0 && (!language.body.includes(entry.canonical) || variantCount > 1);
      });
      if (inconsistent.length) checks.push({
        id: `term-${language.id}`, category: '术语一致性', level: 'warning', title: `${language.name}术语不统一`,
        detail: inconsistent.map((item) => `统一使用“${item.canonical}”，避免“${item.variants.join('、')}”`).join('；')
      });
    });

    const eventAt = this.toTime(this.draft.eventAt);
    const effectiveAt = this.toTime(this.draft.effectiveAt);
    const expiresAt = this.toTime(this.draft.expiresAt);
    if (eventAt && effectiveAt && effectiveAt < eventAt) checks.push({
      id: 'time-effective', category: '时间冲突', level: 'warning', title: '生效时间早于事件时间',
      detail: '请确认这是预防性通知；否则调整事件时间或生效时间。'
    });
    if (effectiveAt && expiresAt && expiresAt <= effectiveAt) checks.push({
      id: 'time-expires', category: '时间冲突', level: 'error', title: '失效时间早于生效时间',
      detail: '通知有效期必须晚于生效时间。'
    });
    const unresolved = this.draft.discussions.filter((discussion) => !discussion.resolved).length;
    if (unresolved) checks.push({
      id: 'discussions', category: '逐句讨论', level: 'warning', title: `${unresolved} 条讨论尚未解决`,
      detail: '发布前请处理或明确忽略未解决讨论。'
    });
    return checks;
  }

  get blockingChecks(): CheckResult[] {
    return this.checks.filter((check) => check.level === 'error');
  }

  get warningCount(): number {
    return this.checks.filter((check) => check.level === 'warning').length;
  }

  get isLocked(): boolean {
    return this.draft.status === 'locked';
  }

  get allReviewsApproved(): boolean {
    return this.draft.reviews.every((review) => review.status === 'approved');
  }

  get hasIncompleteReviews(): boolean {
    return this.draft.reviews.some((review) => review.status !== 'approved');
  }

  get rehearsal(): RehearsalState {
    return this.draft.rehearsal;
  }

  get rehearsalChannels(): RehearsalChannelModel[] {
    const models = new Map<string, RehearsalChannelModel>();

    this.rehearsal.batches.forEach((batch) => {
      let model = models.get(batch.channel);
      if (!model) {
        model = {
          channel: batch.channel,
          group: batch.channelGroup,
          groupLabel: groupLabel(batch.channelGroup),
          leadMinutes: batch.leadMinutes,
          plannedAt: batch.plannedAt,
          locales: [],
          batches: [],
          status: 'pending'
        };
        models.set(batch.channel, model);
      }
      model.batches.push(batch);
      if (batch.locale && !model.locales.includes(batch.locale)) model.locales.push(batch.locale);
      if (batch.plannedAt && (!model.plannedAt || batch.plannedAt < model.plannedAt)) model.plannedAt = batch.plannedAt;
    });

    const result = [...models.values()];
    result.forEach((model) => {
      if (model.batches.every((batch) => batch.status === 'blocked')) model.status = 'blocked';
      else if (model.batches.some((batch) => batch.status === 'failed')) model.status = 'failed';
      else if (model.batches.every((batch) => batch.status === 'sent' || batch.status === 'blocked')) model.status = 'sent';
      else model.status = 'pending';
      model.blockedReason = model.batches.find((batch) => batch.blockedReason)?.blockedReason;
    });
    result.forEach((model, index) => {
      if (model.status === 'pending' && result.slice(0, index).some((previous) => previous.status === 'failed')) {
        const failedChannel = result.slice(0, index).find((previous) => previous.status === 'failed')?.channel;
        model.waitingReason = `前序渠道“${failedChannel}”尚未重试成功，本渠道保持待发。`;
      }
    });
    return result;
  }

  get rehearsalSentCount(): number {
    return this.rehearsal.batches.filter((batch) => batch.status === 'sent').length;
  }

  get rehearsalFailedCount(): number {
    return this.rehearsal.batches.filter((batch) => batch.status === 'failed').length;
  }

  get rehearsalBlockedCount(): number {
    return this.rehearsal.batches.filter((batch) => batch.status === 'blocked').length;
  }

  get rehearsalPendingCount(): number {
    return this.rehearsal.batches.filter((batch) => batch.status === 'pending').length;
  }

  get rehearsalComplete(): boolean {
    return this.rehearsal.batches.length > 0
      && !this.rehearsal.batches.some((batch) => batch.status === 'pending' || batch.status === 'failed');
  }

  get rehearsalActionLabel(): string {
    return this.rehearsalFailedCount ? '重试失败渠道并继续' : '开始发布预演';
  }

  get rehearsalSourceLabel(): string {
    if (this.rehearsal.source === 'draft') return '当前草稿';
    const version = this.draft.versions.find((item) => item.id === this.rehearsal.source);
    return version ? `历史版本 ${version.version}` : this.rehearsal.source;
  }

  isSentenceDiscussed(index: number): boolean {
    return this.activeDiscussions.some((discussion) => discussion.sentenceIndex === index && !discussion.resolved);
  }

  get nextVersion(): string {
    const numbers = this.draft.version.match(/\d+/g)?.map(Number) ?? [1, 2, 0];
    return `${numbers[0] || 1}.${(numbers[1] || 0) + 1}.0`;
  }

  get versionDiff(): DiffRow[] {
    const base = this.draft.versions.find((version) => version.id === this.compareBaseId);
    const target = this.draft.versions.find((version) => version.id === this.compareTargetId);
    if (!base || !target) return [];
    const baseLanguage = base.languages.find((language) => language.id === this.selectedLanguageId);
    const targetLanguage = target.languages.find((language) => language.id === this.selectedLanguageId);
    return this.diffSentences(this.splitSentences(baseLanguage?.body ?? ''), this.splitSentences(targetLanguage?.body ?? ''));
  }

  updateMeta(field: 'title' | 'eventType' | 'severity' | 'scope' | 'eventAt' | 'effectiveAt' | 'expiresAt', value: string): void {
    this.commit((draft) => {
      (draft as unknown as Record<string, unknown>)[field] = value;
      draft.status = draft.status === 'locked' ? 'draft' : draft.status;
    });
  }

  toggleChannel(channel: string, checked: boolean): void {
    this.commit((draft) => {
      draft.channels = checked ? [...new Set([...draft.channels, channel])] : draft.channels.filter((item) => item !== channel);
    });
  }

  toggleRequiredLocale(locale: string, checked: boolean): void {
    this.commit((draft) => {
      draft.requiredLocales = checked
        ? [...new Set([...draft.requiredLocales, locale])]
        : draft.requiredLocales.filter((item) => item !== locale);
    });
  }

  updateLanguage(field: 'title' | 'body' | 'translator', value: string): void {
    this.commit((draft) => {
      const language = draft.languages.find((item) => item.id === this.selectedLanguageId);
      if (language) language[field] = value;
    });
  }

  setLanguageReviewed(checked: boolean): void {
    this.commit((draft) => {
      const language = draft.languages.find((item) => item.id === this.selectedLanguageId);
      if (language) language.reviewed = checked;
    });
  }

  selectSentence(index: number): void {
    this.selectedSentenceIndex = index;
  }

  addDiscussion(): void {
    const text = this.discussionText.trim();
    if (!text || this.isLocked) return;
    this.commit((draft) => {
      draft.discussions.push({
        id: uid('discussion'), languageId: this.selectedLanguageId, sentenceIndex: this.selectedSentenceIndex,
        author: this.currentRole === '法务' ? '陈冉' : this.currentRole === '翻译' ? '周晴' : '林晓',
        role: `${this.currentRole}审阅`, text, createdAt: new Date().toISOString(), resolved: false
      });
    });
    this.discussionText = '';
    this.toastr.success('讨论已绑定到当前句。', '已添加');
  }

  toggleDiscussion(discussionId: string): void {
    this.commit((draft) => {
      const item = draft.discussions.find((discussion) => discussion.id === discussionId);
      if (item) item.resolved = !item.resolved;
    });
  }

  setReviewStatus(role: RoleReview['role'], status: ReviewStatus): void {
    this.commit((draft) => {
      const review = draft.reviews.find((item) => item.role === role);
      if (review) review.status = status;
    });
  }

  setReviewNote(role: RoleReview['role'], note: string): void {
    this.commit((draft) => {
      const review = draft.reviews.find((item) => item.role === role);
      if (review) review.note = note;
    });
  }

  applyTemplate(): void {
    const template = this.templates.find((item) => item.id === this.selectedTemplateId);
    if (!template || this.isLocked) return;
    this.commit((draft) => {
      draft.eventType = template.eventType;
      draft.severity = template.severity;
      draft.scope = template.scope;
      draft.channels = [...template.channels];
      draft.languages.forEach((language) => {
        language.title = template.title[language.id] ?? language.title;
        language.body = template.body[language.id] ?? language.body;
        language.reviewed = false;
      });
    });
    this.toastr.success(`已应用“${template.name}”模板，请根据事件信息调整。`, '模板复用');
  }

  lockVersion(): void {
    if (this.blockingChecks.length) {
      this.toastr.warning(`仍有 ${this.blockingChecks.length} 项阻断问题，不能锁定。`, '发布检查未通过');
      this.activeView = 'checks';
      return;
    }
    const snapshot: VersionSnapshot = {
      id: uid('version'), label: '最终锁定版本', createdAt: new Date().toISOString(), version: this.nextVersion,
      title: this.draft.title, severity: this.draft.severity, scope: this.draft.scope, eventAt: this.draft.eventAt,
      effectiveAt: this.draft.effectiveAt, expiresAt: this.draft.expiresAt, channels: [...this.draft.channels],
      requiredLocales: [...this.draft.requiredLocales], channelLocales: clone(this.draft.channelLocales),
      rehearsal: clone(this.draft.rehearsal),
      languages: clone(this.draft.languages), note: '发布前检查通过并锁定。', emergency: false
    };
    this.commit((draft) => {
      draft.versions.push(snapshot);
      draft.version = snapshot.version;
      draft.status = 'locked';
      draft.lockedAt = snapshot.createdAt;
    });
    this.compareBaseId = this.draft.versions.at(-2)?.id ?? '';
    this.compareTargetId = this.draft.versions.at(-1)?.id ?? '';
    this.toastr.success(`版本 ${snapshot.version} 已锁定。`, '最终版本已冻结');
  }

  startEmergencyRevision(): void {
    const baseVersion = this.draft.version.split('-')[0];
    const [major = 1, minor = 0] = baseVersion.split('.').map(Number);
    this.commit((draft) => {
      draft.status = 'draft';
      draft.emergencyRevision = true;
      draft.version = `${major}.${minor + 1}.0-emergency`;
      draft.lockedAt = undefined;
    });
    this.activeView = 'compose';
    this.toastr.warning('已创建紧急修订稿；锁定版本仍完整保留。', '进入紧急修订');
  }

  showCheck(check: CheckResult): void {
    if (check.id.startsWith('missing-') || check.id.startsWith('required-') || check.id.startsWith('banned-') || check.id.startsWith('term-')) {
      const locale = check.id.split('-').at(-1);
      if (locale && this.draft.languages.some((language) => language.id === locale)) this.selectedLanguageId = locale;
      this.activeView = 'compose';
    } else if (check.id === 'discussions') {
      this.activeView = 'review';
    }
  }

  leadForGroup(group: ChannelGroup): number {
    return leadForGroup(this.draft.severity, group);
  }

  channelDependencyLocales(channel: string): string[] {
    return this.rehearsal.channelLocales[channel] ?? [];
  }

  toggleChannelDependency(channel: string, locale: string, checked: boolean): void {
    this.commit((draft) => {
      const selected = draft.channelLocales[channel] ?? [];
      draft.channelLocales[channel] = checked
        ? [...new Set([...selected, locale])]
        : selected.filter((item) => item !== locale);
    });
  }

  isFaultChannel(channel: string): boolean {
    return this.faultChannels.includes(channel);
  }

  toggleFaultChannel(channel: string, checked: boolean): void {
    this.faultChannels = checked
      ? [...new Set([...this.faultChannels, channel])]
      : this.faultChannels.filter((item) => item !== channel);
  }

  rehearsalStatusName(status: RehearsalStatus): string {
    return status === 'sent' ? '已发送' : status === 'failed' ? '发送失败' : status === 'blocked' ? '已阻断' : '待发送';
  }

  async runRehearsal(): Promise<void> {
    if (this.rehearsalRunning || this.rehearsalComplete) return;

    this.rehearsalRunning = true;
    const state = clone(this.rehearsal);
    let failureFound = state.batches.some((batch) => batch.status === 'failed');

    for (const batch of state.batches) {
      if (batch.status === 'blocked' || batch.status === 'sent') continue;
      if (batch.status === 'pending' && failureFound) break;

      const startedAt = new Date().toISOString();
      await this.delay(140);
      const willFail = this.faultChannels.includes(batch.channel);
      const finishedAt = new Date().toISOString();
      const attempt: RehearsalAttempt = {
        id: uid('rehearsal-attempt'),
        batchId: batch.id,
        startedAt,
        finishedAt,
        ok: !willFail,
        reason: willFail ? '模拟渠道网关返回失败，请检查接口后重试。' : undefined
      };
      batch.attempts.push(attempt);

      if (willFail) {
        batch.status = 'failed';
        batch.failureReason = attempt.reason;
        failureFound = true;
        state.events.push({
          id: uid('rehearsal-event'),
          type: 'send-result',
          createdAt: finishedAt,
          ok: false,
          message: `${batch.channel}第 ${batch.sequence}/${batch.total} 批发送失败，后续未开始渠道保持待发。`
        });
        this.syncRehearsal(state);
        break;
      }

      batch.status = 'sent';
      batch.sentAt = finishedAt;
      batch.failureReason = undefined;
      failureFound = false;
      state.events.push({
        id: uid('rehearsal-event'),
        type: 'send-result',
        createdAt: finishedAt,
        ok: true,
        message: `${batch.channel}第 ${batch.sequence}/${batch.total} 批已生成成功发送记录。`
      });
      this.syncRehearsal(state);
    }

    this.rehearsalRunning = false;
    if (state.batches.some((batch) => batch.status === 'failed')) {
      this.toastr.warning('已停止在失败点之后；后续未开始渠道仍为待发送。', '预演遇到失败');
    } else if (state.batches.some((batch) => batch.status === 'blocked')) {
      this.toastr.info('可执行批次已完成，存在被语言依赖阻断的渠道。', '预演完成');
    } else {
      this.toastr.success('所有批次均已生成模拟发送成功记录。', '预演完成');
    }
  }

  resetRehearsalResults(): void {
    if (this.rehearsalRunning) return;
    const state = clone(this.rehearsal);
    state.batches.forEach((batch) => {
      if (batch.status === 'blocked') return;
      batch.status = 'pending';
      batch.sentAt = undefined;
      batch.failureReason = undefined;
      batch.attempts = [];
    });
    state.events.push({
      id: uid('rehearsal-event'),
      type: 'reset',
      createdAt: new Date().toISOString(),
      message: '已手动清空发送结果；阻断原因仍依据当前翻译和渠道依赖重新展示。'
    });
    this.syncRehearsal(state);
    this.toastr.info('可重新开始预演。', '结果已清空');
  }

  rebuildFromVersion(version: VersionSnapshot): void {
    if (this.rehearsalRunning) return;
    const requiredLocales = version.requiredLocales?.length ? [...version.requiredLocales] : ['zh-CN'];
    const context: NoticeDraft = {
      ...this.draft,
      title: version.title,
      severity: version.severity,
      scope: version.scope,
      eventAt: version.eventAt,
      effectiveAt: version.effectiveAt,
      expiresAt: version.expiresAt,
      channels: [...version.channels],
      requiredLocales,
      languages: clone(version.languages),
      channelLocales: normalizeChannelLocales(version.channels, requiredLocales, version.channelLocales)
    };

    this.commit((draft) => {
      draft.rehearsal = buildRehearsalPlan(context, {
        source: version.id,
        preserve: version.rehearsal
      });
    }, false);
    this.faultChannels = [];
    this.activeView = 'rehearsal';
    this.toastr.info(`已按版本 ${version.version} 的内容重建预演，当前草稿正文不会被覆盖。`, '历史重建');
  }

  useDraftRehearsal(): void {
    if (this.rehearsalRunning) return;
    this.commit((draft) => {
      const state = buildRehearsalPlan(draft, { source: 'draft', preserve: draft.rehearsal });
      state.source = 'draft';
      draft.rehearsal = state;
    }, false);
  }

  undo(): void {
    const previous = this.history.pop();
    if (!previous) {
      this.toastr.info('没有可撤销的操作。', '撤销');
      return;
    }
    this.future.push(clone(this.draft));
    this.draft = previous;
    this.persist();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) {
      this.toastr.info('没有可重做的操作。', '重做');
      return;
    }
    this.history.push(clone(this.draft));
    this.draft = next;
    this.persist();
  }

  saveNow(): void {
    this.persist();
  }

  formatDateTime(value: string): string {
    if (!value) return '未设置';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  private commit(mutator: (draft: NoticeDraft) => void, rebuildRehearsal = true): void {
    this.history.push(clone(this.draft));
    if (this.history.length > 50) this.history.shift();
    const next = clone(this.draft);
    mutator(next);
    next.channelLocales = normalizeChannelLocales(next.channels, next.requiredLocales, next.channelLocales);
    if (rebuildRehearsal) {
      const rehearsal = buildRehearsalPlan(next, { source: 'draft', preserve: next.rehearsal });
      rehearsal.source = 'draft';
      next.rehearsal = rehearsal;
    }
    next.updatedAt = new Date().toISOString();
    this.draft = next;
    this.future = [];
    this.persist();
  }

  private syncRehearsal(state: RehearsalState): void {
    this.draft = { ...this.draft, rehearsal: clone(state) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.draft));
    this.lastSavedAt = this.formatDateTime(new Date().toISOString());
  }

  private persist(): void {
    this.lastSavedAt = this.formatDateTime(new Date().toISOString());
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.draft, updatedAt: new Date().toISOString() }));
  }

  private migrate(value: NoticeDraft): NoticeDraft {
    if (!value.id || !Array.isArray(value.languages) || !Array.isArray(value.versions)) return initialDraft();
    value.discussions ??= [];
    value.reviews ??= [];
    value.requiredLocales ??= ['zh-CN'];
    value.channelLocales = normalizeChannelLocales(value.channels, value.requiredLocales, value.channelLocales);
    if (!value.rehearsal || !Array.isArray(value.rehearsal.batches)) {
      value.rehearsal = buildRehearsalPlan(value, { source: 'draft', generatedAt: value.updatedAt });
    }
    return value;
  }

  private splitSentences(text: string): string[] {
    return (text.match(/[^。！？.!?]+[。！？.!?]?/g) ?? []).map((item) => item.trim()).filter(Boolean);
  }

  private toTime(value: string): number {
    return parseTime(value);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private diffSentences(left: string[], right: string[]): DiffRow[] {
    const rows: DiffRow[] = [];
    const lcs: number[][] = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) {
        lcs[i][j] = left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        rows.push({ left: left[i], right: right[j], kind: 'same' }); i += 1; j += 1;
      } else if (i < left.length && j < right.length && lcs[i + 1][j] === lcs[i][j] && lcs[i][j + 1] === lcs[i][j]) {
        rows.push({ left: left[i], right: right[j], kind: 'changed' }); i += 1; j += 1;
      } else if (j < right.length && (i === left.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
        rows.push({ left: '', right: right[j], kind: 'added' }); j += 1;
      } else if (i < left.length) {
        rows.push({ left: left[i], right: '', kind: 'removed' }); i += 1;
      }
    }
    return rows;
  }
}
