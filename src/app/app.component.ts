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

type WorkspaceView = 'compose' | 'checks' | 'review' | 'release' | 'versions';
type ReviewStatus = 'pending' | 'approved' | 'changes';
type NoticeStatus = 'draft' | 'in-review' | 'locked';
type CheckLevel = 'error' | 'warning' | 'info';
type ReleaseBatchStatus = 'blocked' | 'pending' | 'sending' | 'success' | 'failed';

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
  languages: LanguageVersion[];
  note: string;
  emergency: boolean;
  releasePlan?: ReleasePlan;
}

interface ReleaseBatch {
  id: string;
  channel: string;
  localeId: string;
  localeName: string;
  part: number;
  totalParts: number;
  content: string;
  scheduledAt: string;
  status: ReleaseBatchStatus;
  blockingReason?: string;
  attemptCount: number;
  dispatchedAt?: string;
  recordId?: string;
  failureReason?: string;
}

interface ReleasePlan {
  id: string;
  generatedAt: string;
  anchorAt: string;
  leadTimes: Record<string, number>;
  batches: ReleaseBatch[];
  sourceVersionId?: string;
  sourceVersionLabel?: string;
}

interface ReleaseChannelGroup {
  channel: string;
  leadMinutes: number;
  scheduledAt: string;
  batches: ReleaseBatch[];
}

interface ReleaseSource {
  id: string;
  title: string;
  severity: string;
  eventAt: string;
  effectiveAt: string;
  channels: string[];
  requiredLocales: string[];
  languages: LanguageVersion[];
}

interface NoticeDraft {
  id: string;
  title: string;
  eventType: string;
  severity: string;
  scope: string;
  channels: string[];
  releaseChannelLocales: Record<string, string[]>;
  releasePlan?: ReleasePlan;
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

const STORAGE_KEY = 'sologsb-1025-emergency-notice-v1';
const CHANNEL_ORDER = ['短信', '广播', '网站', '社区大屏', '政务新媒体', '应急喇叭'];
const RELEASE_LEAD_MINUTES: Record<string, Record<string, number>> = {
  红色: { 短信: 30, 广播: 15, 网站: 10, 社区大屏: 10, 政务新媒体: 10, 应急喇叭: 15 },
  橙色: { 短信: 25, 广播: 12, 网站: 8, 社区大屏: 8, 政务新媒体: 8, 应急喇叭: 12 },
  黄色: { 短信: 20, 广播: 10, 网站: 5, 社区大屏: 5, 政务新媒体: 5, 应急喇叭: 10 },
  蓝色: { 短信: 15, 广播: 8, 网站: 3, 社区大屏: 3, 政务新媒体: 3, 应急喇叭: 8 }
};
const CHANNEL_MAX_LENGTH: Record<string, number> = {
  短信: 70,
  广播: 180,
  网站: 600,
  社区大屏: 220,
  政务新媒体: 500,
  应急喇叭: 120
};
const DEFAULT_CHANNEL_LOCALES: Record<string, string[]> = {
  短信: ['zh-CN', 'en'],
  广播: ['zh-CN'],
  网站: ['zh-CN', 'en', 'ja', 'ko'],
  社区大屏: ['zh-CN', 'en', 'ja'],
  政务新媒体: ['zh-CN', 'en', 'ja'],
  应急喇叭: ['zh-CN']
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
        title: 'Red alert and evacuation notice for Typhoon Haiyan',
        body: 'Residents in Binhai New Area should stop outdoor activities immediately. Residents of coastal subdistricts must move to the nearest shelter before 17:00 today. Strong winds and heavy rain are expected this afternoon. Stay away from temporary structures and monitor further notices.'
      } as LanguageVersion
    ]
  };

  return {
    id: 'notice-haiyan-2026',
    title: '台风“海燕”红色预警及人员转移通知',
    eventType: '台风',
    severity: '红色',
    scope: '滨海新区全区，重点为沿海街道',
    channels: ['短信', '广播', '社区大屏', '政务新媒体', '网站'],
    releaseChannelLocales: {
      短信: ['zh-CN', 'en'],
      广播: ['zh-CN'],
      社区大屏: ['zh-CN', 'en', 'ja'],
      政务新媒体: ['zh-CN', 'en', 'ja'],
      网站: ['zh-CN', 'en', 'ja', 'ko'],
      应急喇叭: ['zh-CN']
    },
    eventAt: '2026-09-25T07:30',
    effectiveAt: '2026-09-25T09:00',
    expiresAt: '2026-09-26T08:00',
    requiredLocales: ['zh-CN', 'en', 'ja', 'ko'],
    languages: [
      {
        id: 'zh-CN', locale: 'zh-CN', name: '简体中文', title: '台风“海燕”红色预警及人员转移通知',
        body: '请滨海新区居民立即停止户外活动。沿海街道居民请于今日17时前转移至就近安置点。预计今天下午出现强风和暴雨。不要停留在临时建筑附近，并持续关注后续通知。',
        translator: '林晓', reviewed: true
      },
      {
        id: 'en', locale: 'en', name: 'English', title: 'Orange alert and evacuation notice for Typhoon Haiyan',
        body: 'Residents in Binhai New Area should stop outdoor activities immediately. Residents of coastal subdistricts must move to the nearest shelter before 17:00 today. Strong winds and heavy rain are expected this afternoon. Keep away from temporary buildings and continue to monitor further notices.',
        translator: '周晴', reviewed: true
      },
      {
        id: 'ja', locale: 'ja', name: '日本語', title: '台風「ハイエン」レッド警報',
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
  };
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
  readonly channelOrder = CHANNEL_ORDER;
  readonly releaseLeadMinutes = RELEASE_LEAD_MINUTES;
  readonly channelMaxLength = CHANNEL_MAX_LENGTH;
  readonly eventTypes = ['台风', '暴雨', '地震', '公共卫生', '公共设施', '公共安全'];
  readonly severities = ['蓝色', '黄色', '橙色', '红色'];
  readonly channelOptions = ['短信', '广播', '社区大屏', '政务新媒体', '应急喇叭', '网站'];
  readonly locales = [
    { id: 'zh-CN', name: '简体中文' },
    { id: 'en', name: 'English' },
    { id: 'ja', name: '日本語' },
    { id: 'ko', name: '한국어' },
    { id: 'es', name: 'Español' }
  ];
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
  historyPreviewVersionId = '';
  simulationOutcome: 'success' | 'failure' = 'success';
  historyPlanCache = new Map<string, ReleasePlan>();
  history: NoticeDraft[] = [];
  future: NoticeDraft[] = [];

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
    this.ensureReleasePlan(this.draft);
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
        const dependentChannels = this.draft.channels
          .filter((channel) => this.channelLocales(channel).includes(locale));
        checks.push({
          id: `missing-${locale}`, category: '语言完整性', level: 'warning', title: `${name}版本缺失`,
          detail: dependentChannels.length
            ? `仅阻断依赖该语言的渠道：${dependentChannels.join('、')}；其他渠道仍可预演。`
            : '当前没有已选渠道依赖该语言，暂不阻断发布渠道。'
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

  get historyPreviewVersion(): VersionSnapshot | undefined {
    return this.historyPreviewVersionId
      ? this.draft.versions.find((version) => version.id === this.historyPreviewVersionId)
      : undefined;
  }

  get isHistoryPreview(): boolean {
    return Boolean(this.historyPreviewVersion);
  }

  get releaseSource(): ReleaseSource {
    const version = this.historyPreviewVersion;
    if (version) {
      return {
        id: version.id,
        title: version.title,
        severity: version.severity,
        eventAt: version.eventAt,
        effectiveAt: version.effectiveAt,
        channels: version.channels,
        requiredLocales: version.requiredLocales,
        languages: version.languages
      };
    }
    return {
      id: this.draft.id,
      title: this.draft.title,
      severity: this.draft.severity,
      eventAt: this.draft.eventAt,
      effectiveAt: this.draft.effectiveAt,
      channels: this.draft.channels,
      requiredLocales: this.draft.requiredLocales,
      languages: this.draft.languages
    };
  }

  get activeReleasePlan(): ReleasePlan {
    const version = this.historyPreviewVersion;
    if (version) {
      if (!version.releasePlan) {
        const cached = this.historyPlanCache.get(version.id);
        if (cached) return cached;
        const rebuilt = this.buildReleasePlan(version, this.draft.releaseChannelLocales ?? {}, undefined, version);
        this.historyPlanCache.set(version.id, rebuilt);
        return rebuilt;
      }
      return version.releasePlan;
    }
    return this.draft.releasePlan!;
  }

  get releaseGroups(): ReleaseChannelGroup[] {
    const plan = this.activeReleasePlan;
    return this.orderedChannels(this.releaseSource.channels)
      .map((channel) => {
        const batches = plan.batches.filter((batch) => batch.channel === channel);
        const leadMinutes = plan.leadTimes[channel] ?? this.leadMinutesFor(channel, this.releaseSource.severity);
        const scheduledAt = batches.find((batch) => batch.scheduledAt)?.scheduledAt ?? '';
        return { channel, leadMinutes, scheduledAt, batches };
      })
      .filter((group) => group.batches.length);
  }

  get releaseSummary(): { total: number; success: number; failed: number; pending: number; blocked: number } {
    return this.activeReleasePlan.batches.reduce((summary, batch) => {
      summary.total += 1;
      if (batch.status === 'success') summary.success += 1;
      if (batch.status === 'failed') summary.failed += 1;
      if (batch.status === 'pending') summary.pending += 1;
      if (batch.status === 'blocked') summary.blocked += 1;
      return summary;
    }, { total: 0, success: 0, failed: 0, pending: 0, blocked: 0 });
  }

  get nextRunnableBatch(): ReleaseBatch | undefined {
    for (const group of this.releaseGroups) {
      const failed = group.batches.find((batch) => batch.status === 'failed' || batch.status === 'sending');
      const pending = group.batches.find((batch) => batch.status === 'pending');
      const runnable = failed ?? pending;
      if (runnable) return runnable;
    }
    return undefined;
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

  orderedChannels(channels: string[]): string[] {
    return CHANNEL_ORDER.filter((channel) => channels.includes(channel));
  }

  channelLocales(channel: string, localesMap: Record<string, string[]> = this.draft.releaseChannelLocales): string[] {
    const selected = localesMap[channel] ?? DEFAULT_CHANNEL_LOCALES[channel] ?? ['zh-CN'];
    return this.locales.map((locale) => locale.id).filter((locale) => selected.includes(locale));
  }

  localeName(localeId: string): string {
    return this.locales.find((locale) => locale.id === localeId)?.name ?? localeId;
  }

  leadMinutesFor(channel: string, severity: string): number {
    return RELEASE_LEAD_MINUTES[severity]?.[channel] ?? RELEASE_LEAD_MINUTES.橙色[channel] ?? 10;
  }

  toggleChannelLocale(channel: string, localeId: string, checked: boolean): void {
    if (this.isLocked || this.isHistoryPreview) return;
    this.commit((draft) => {
      const current = this.channelLocales(channel, draft.releaseChannelLocales);
      draft.releaseChannelLocales[channel] = checked
        ? [...new Set([...current, localeId])]
        : current.filter((item) => item !== localeId);
    });
  }

  groupStatus(group: ReleaseChannelGroup): ReleaseBatchStatus {
    const statuses = group.batches.map((batch) => batch.status);
    if (statuses.every((status) => status === 'blocked')) return 'blocked';
    if (statuses.every((status) => status === 'success')) return 'success';
    if (statuses.includes('sending')) return 'sending';
    if (statuses.includes('failed')) return 'failed';
    return 'pending';
  }

  groupStatusLabel(group: ReleaseChannelGroup): string {
    const status = this.groupStatus(group);
    return {
      blocked: '已阻断',
      pending: '待发送',
      sending: '发送中',
      success: '已成功',
      failed: '失败 · 后续待发'
    }[status];
  }

  canRunBatch(batch: ReleaseBatch): boolean {
    if (this.isHistoryPreview || (batch.status !== 'pending' && batch.status !== 'failed')) return false;
    const groupIndex = this.releaseGroups.findIndex((item) => item.channel === batch.channel);
    const priorChannelBlocked = this.releaseGroups
      .slice(0, groupIndex)
      .some((group) => group.batches.some((item) => item.status === 'failed' || item.status === 'sending'));
    const group = this.releaseGroups[groupIndex];
    const blockedBy = group?.batches.find((item) =>
      item.localeId === batch.localeId &&
      item.part < batch.part &&
      (item.status === 'failed' || item.status === 'sending')
    );
    return !priorChannelBlocked && !blockedBy;
  }

  simulateBatch(batch: ReleaseBatch, outcome: 'success' | 'failure'): void {
    if (!this.canRunBatch(batch)) return;
    this.commit((draft, sync) => {
      const current = draft.releasePlan?.batches.find((item) => item.id === batch.id);
      if (!current) {
        sync(false);
        return;
      }
      current.attemptCount += 1;
      if (outcome === 'success') {
        const dispatchedAt = new Date().toISOString();
        current.status = 'success';
        current.dispatchedAt = dispatchedAt;
        current.failureReason = undefined;
        if (!current.recordId) current.recordId = this.recordIdFor(current);
      } else {
        current.status = 'failed';
        current.failureReason = '模拟网关返回失败，可在修复后重试该批。';
      }
      sync(false);
    });
    this.toastrForBatch(outcome, batch.channel, batch.part);
  }

  runNextBatch(): void {
    const batch = this.nextRunnableBatch;
    if (!batch || this.isHistoryPreview) {
      this.toastr.info('没有可继续发送的批次；阻断批次不会进入队列。', '发布预演');
      return;
    }
    this.simulateBatch(batch, this.simulationOutcome);
  }

  runRemainingBatches(): void {
    if (this.isHistoryPreview) {
      this.toastr.info('历史版本预演为只读结果，不能模拟发送。', '发布预演');
      return;
    }
    let processed = 0;
    this.commit((draft, sync) => {
      const groups = this.planGroupsFromPlan(draft.releasePlan!, draft.channels);
      for (const group of groups) {
        const priorFailed = groups
          .slice(0, groups.indexOf(group))
          .some((item) => item.batches.some((batch) => batch.status === 'failed' || batch.status === 'sending'));
        if (priorFailed) break;
        for (const batch of group.batches) {
          if (batch.status === 'blocked') continue;
          const earlierInChannel = group.batches
            .slice(0, group.batches.indexOf(batch))
            .some((item) => item.status === 'failed' || item.status === 'sending');
          if (earlierInChannel) break;
          if (batch.status !== 'pending') continue;
          const dispatchedAt = new Date().toISOString();
          batch.status = 'success';
          batch.attemptCount += 1;
          batch.dispatchedAt = dispatchedAt;
          batch.failureReason = undefined;
          if (!batch.recordId) batch.recordId = this.recordIdFor(batch);
          processed += 1;
        }
      }
      sync(false);
    });
    if (processed) this.toastr.success(`已连续生成 ${processed} 条成功记录；已成功批次未重复生成。`, '一键跑通');
    else this.toastr.info('没有待发送且未被前序失败阻断的批次。', '发布预演');
  }

  resetReleaseRun(): void {
    if (this.isHistoryPreview || !this.draft.releasePlan) return;
    this.commit((draft, sync) => {
      draft.releasePlan?.batches.forEach((batch) => {
        if (batch.status !== 'blocked') {
          batch.status = 'pending';
          batch.attemptCount = 0;
          batch.dispatchedAt = undefined;
          batch.failureReason = undefined;
        }
      });
      sync(false);
    });
    this.toastr.warning('已清除模拟发送结果，批次内容和计划时间保留。', '重置预演');
  }

  rebuildReleasePlan(): void {
    if (this.isLocked || this.isHistoryPreview) return;
    this.commit((draft, sync) => {
      sync(true, draft);
    });
    this.toastr.success('已按当前渠道、语言、严重程度和正文重建批次。', '重新预演');
  }

  previewHistoryVersion(version: VersionSnapshot): void {
    this.historyPreviewVersionId = version.id;
    this.historyPlanCache.delete(version.id);
    this.activeView = 'release';
  }

  backToCurrentRelease(): void {
    this.historyPreviewVersionId = '';
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
      requiredLocales: [...this.draft.requiredLocales],
      languages: clone(this.draft.languages), note: '发布前检查通过并锁定。', emergency: false,
      releasePlan: this.draft.releasePlan ? clone(this.draft.releasePlan) : undefined
    };
    this.commit((draft) => {
      draft.versions.push(snapshot);
      draft.version = snapshot.version;
      draft.status = 'locked';
      draft.lockedAt = snapshot.createdAt;
      if (draft.releasePlan) {
        draft.releasePlan.sourceVersionId = snapshot.id;
        draft.releasePlan.sourceVersionLabel = snapshot.label;
      }
    }, false);
    const lockedSnapshot = this.draft.versions.find((version) => version.id === snapshot.id);
    if (lockedSnapshot && this.draft.releasePlan) lockedSnapshot.releasePlan = clone(this.draft.releasePlan);
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
      draft.releasePlan = undefined;
      this.historyPreviewVersionId = '';
    });
    this.activeView = 'compose';
    this.toastr.warning('已创建紧急修订稿；锁定版本仍完整保留。', '进入紧急修订');
  }

  showCheck(check: CheckResult): void {
    if (check.id.startsWith('missing-') || check.id.startsWith('required-') || check.id.startsWith('banned-') || check.id.startsWith('term-')) {
      const locale = check.id.split('-').at(-1);
      if (locale && this.draft.languages.some((language) => language.id === locale)) this.selectedLanguageId = locale;
      this.activeView = check.id.startsWith('missing-') ? 'release' : 'compose';
    } else if (check.id === 'discussions') {
      this.activeView = 'review';
    }
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

  private commit(mutator: (draft: NoticeDraft, sync: (sync?: boolean, source?: NoticeDraft) => void) => void, syncAfter = true): void {
    this.history.push(clone(this.draft));
    if (this.history.length > 50) this.history.shift();
    const next = clone(this.draft);
    let shouldSync = syncAfter;
    let syncSource = next;
    mutator(next, (doSync = true, source = next) => {
      shouldSync = doSync;
      syncSource = source;
    });
    if (shouldSync) this.ensureReleasePlan(syncSource);
    next.updatedAt = new Date().toISOString();
    this.draft = next;
    this.future = [];
    this.persist();
  }

  private persist(): void {
    this.lastSavedAt = this.formatDateTime(new Date().toISOString());
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...this.draft, updatedAt: new Date().toISOString() }));
  }

  private migrate(value: NoticeDraft): NoticeDraft {
    if (!value.id || !Array.isArray(value.languages) || !Array.isArray(value.versions)) return initialDraft();
    value.discussions ??= [];
    value.reviews ??= [];
    value.requiredLocales ??= ['zh-CN', 'en'];
    value.releaseChannelLocales ??= {};
    Object.keys(DEFAULT_CHANNEL_LOCALES).forEach((channel) => {
      const existing = value.releaseChannelLocales[channel];
      value.releaseChannelLocales[channel] = Array.isArray(existing) && existing.length
        ? existing
        : [...DEFAULT_CHANNEL_LOCALES[channel]];
    });
    value.versions.forEach((version) => {
      version.requiredLocales ??= [...value.requiredLocales];
      if (version.releasePlan) {
        version.releasePlan.batches.forEach((batch) => this.normalizeBatch(batch));
      }
    });
    if (value.releasePlan) value.releasePlan.batches.forEach((batch) => this.normalizeBatch(batch));
    return value;
  }

  private normalizeBatch(batch: ReleaseBatch): void {
    batch.attemptCount ??= 0;
    batch.status ??= batch.blockingReason ? 'blocked' : 'pending';
  }

  private ensureReleasePlan(draft: NoticeDraft): void {
    draft.releaseChannelLocales ??= {};
    this.channelOptions.forEach((channel) => {
      if (!Array.isArray(draft.releaseChannelLocales[channel]) || !draft.releaseChannelLocales[channel].length) {
        draft.releaseChannelLocales[channel] = [...(DEFAULT_CHANNEL_LOCALES[channel] ?? ['zh-CN'])];
      }
    });
    draft.releasePlan = this.buildReleasePlan(draft, draft.releaseChannelLocales, draft.releasePlan);
  }

  private buildReleasePlan(
    source: ReleaseSource,
    channelLocales: Record<string, string[]>,
    previous?: ReleasePlan,
    version?: VersionSnapshot
  ): ReleasePlan {
    const anchorMs = this.toTime(source.eventAt);
    const anchorValid = anchorMs > 0;
    const channels = this.orderedChannels(source.channels);
    const leadTimes = Object.fromEntries(channels.map((channel) => [
      channel,
      this.leadMinutesFor(channel, source.severity)
    ])) as Record<string, number>;
    const previousBatches = new Map(previous?.batches.map((batch) => [batch.id, batch]) ?? []);
    const batches: ReleaseBatch[] = [];

    channels.forEach((channel) => {
      const leadMinutes = leadTimes[channel];
      const scheduledAt = anchorValid ? new Date(anchorMs - leadMinutes * 60_000).toISOString() : '';
      const localeIds = this.channelLocales(channel, channelLocales);
      localeIds.forEach((localeId) => {
        const localeName = this.localeName(localeId);
        const language = source.languages.find((item) => item.id === localeId);
        let blockingReason = '';
        if (!anchorValid) {
          blockingReason = `事件时间无效，无法按“${source.severity}”严重程度提前 ${leadMinutes} 分钟排程。`;
        } else if (!language) {
          blockingReason = `缺少${localeName}翻译；仅阻断 ${channel} 渠道的该语言批次。`;
        } else if (!language.title.trim() || !language.body.trim()) {
          blockingReason = `${localeName}标题或正文不完整，不能生成 ${channel} 批次。`;
        }

        if (blockingReason) {
          const id = this.batchId(source, channel, localeId, 1, scheduledAt, blockingReason);
          const old = previousBatches.get(id);
          batches.push(old ? clone(old) : {
            id, channel, localeId, localeName, part: 1, totalParts: 1, content: '',
            scheduledAt, status: 'blocked', blockingReason, attemptCount: 0
          });
          return;
        }

        const maxLength = CHANNEL_MAX_LENGTH[channel] ?? 200;
        const chunks = this.splitForChannel(language!.title, language!.body, maxLength);
        chunks.forEach((content, index) => {
          const part = index + 1;
          const id = this.batchId(source, channel, localeId, part, scheduledAt, content);
          const old = previousBatches.get(id);
          batches.push(old ? clone(old) : {
            id, channel, localeId, localeName, part, totalParts: chunks.length, content,
            scheduledAt, status: 'pending', attemptCount: 0
          });
        });
      });
    });

    const sourceVersion = version
      ? { sourceVersionId: version.id, sourceVersionLabel: version.label }
      : source.id !== this.draft.id && previous?.sourceVersionId
        ? { sourceVersionId: previous.sourceVersionId, sourceVersionLabel: previous.sourceVersionLabel }
        : {};

    return {
      id: previous?.id ?? `release-plan-${this.stableHash(source.id + source.eventAt + channels.join('|'))}`,
      generatedAt: previous?.generatedAt ?? (version?.createdAt ?? new Date().toISOString()),
      anchorAt: anchorValid ? new Date(anchorMs).toISOString() : source.eventAt,
      leadTimes,
      batches,
      ...sourceVersion
    };
  }

  private batchId(source: ReleaseSource, channel: string, localeId: string, part: number, scheduledAt: string, content: string): string {
    return `batch-${this.stableHash([source.id, source.severity, channel, localeId, part, scheduledAt, content].join('|'))}`;
  }

  private recordIdFor(batch: ReleaseBatch): string {
    return `SR-${this.stableHash(batch.id)}`;
  }

  private splitForChannel(title: string, body: string, maxLength: number): string[] {
    const paragraphs = `${title.trim()}\n${body.trim()}`.trim().split(/\n+/).filter(Boolean);
    const limit = Math.max(20, maxLength - 8);
    const chunks: string[] = [];
    let current = '';

    const append = (piece: string, separator: string): void => {
      const normalized = piece.trim();
      if (!normalized) return;
      const candidate = current ? `${current}${separator}${normalized}` : normalized;
      if (Array.from(candidate).length <= limit) {
        current = candidate;
        return;
      }
      if (current) {
        chunks.push(current);
        current = '';
      }
      if (Array.from(normalized).length <= limit) {
        current = normalized;
        return;
      }
      const hardParts = normalized.match(new RegExp(`[\\s\\S]{1,${limit}}(?:[。！？!?，,、；;\\s]+|$)`, 'g')) ?? [normalized];
      hardParts.forEach((part) => {
        const clean = part.trim();
        if (!clean) return;
        if (Array.from(clean).length <= limit) {
          chunks.push(clean);
        } else {
          for (let index = 0; index < clean.length;) {
            const hardChunk = Array.from(clean.slice(index)).slice(0, limit).join('');
            chunks.push(hardChunk);
            index += Array.from(hardChunk).length;
          }
        }
      });
    };

    paragraphs.forEach((paragraph, paragraphIndex) => {
      const sentences = paragraph.match(/[^。！？!?]+[。！？!?]?/g) ?? [paragraph];
      sentences.forEach((sentence) => append(sentence, ''));
      if (paragraphIndex < paragraphs.length - 1 && current) {
        chunks.push(current);
        current = '';
      }
    });
    if (current) chunks.push(current);
    return chunks.map((chunk, index) => `${chunk}（${index + 1}/${chunks.length}）`);
  }

  private stableHash(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }

  private planGroupsFromPlan(plan: ReleasePlan, channels: string[]): ReleaseChannelGroup[] {
    return this.orderedChannels(channels)
      .map((channel) => ({
        channel,
        leadMinutes: plan.leadTimes[channel] ?? this.leadMinutesFor(channel, this.draft.severity),
        scheduledAt: plan.batches.find((batch) => batch.channel === channel && batch.scheduledAt)?.scheduledAt ?? '',
        batches: plan.batches.filter((batch) => batch.channel === channel)
      }))
      .filter((group) => group.batches.length);
  }

  private toastrForBatch(outcome: 'success' | 'failure', channel: string, part: number): void {
    if (outcome === 'success') {
      this.toastr.success(`${channel} 第 ${part} 批已生成成功记录。`, '模拟发送成功');
    } else {
      this.toastr.warning(`${channel} 第 ${part} 批失败；后续未开始批次保持待发。`, '模拟发送失败');
    }
  }

  private splitSentences(text: string): string[] {
    return (text.match(/[^。！？.!?]+[。！？.!?]?/g) ?? []).map((item) => item.trim()).filter(Boolean);
  }

  private toTime(value: string): number {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  }

  private diffSentences(left: string[], right: string[]): DiffRow[] {
    const rows: DiffRow[] = [];
    const lcs: number[][] = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = left.length - 1; i >= 0; i--) {
      for (let j = right.length - 1; j >= 0; j--) {
        lcs[i][j] = left[i] === right[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) {
        rows.push({ left: left[i], right: right[j], kind: 'same' }); i++; j++;
      } else if (i < left.length && j < right.length && lcs[i + 1][j] === lcs[i][j] && lcs[i][j + 1] === lcs[i][j]) {
        rows.push({ left: left[i], right: right[j], kind: 'changed' }); i++; j++;
      } else if (j < right.length && (i === left.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
        rows.push({ left: '', right: right[j], kind: 'added' }); j++;
      } else if (i < left.length) {
        rows.push({ left: left[i], right: '', kind: 'removed' }); i++;
      }
    }
    return rows;
  }
}
