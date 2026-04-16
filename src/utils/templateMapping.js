const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

export const DEFAULT_CELL_MAPPING = {
  commonFields: {
    date: 3,
    department: 4,
    submitter: 5,
    time: 6,
    progress: 7,
    delayReason: 8,
  },
  taskBlock: {
    startRow: 10,
    blockSize: 20,
  },
  offsets: {
    header: 0,
    target_place: 1,
    task_detail: 2,
    symptom: 3,
    action_taken: 4,
    has_problem: 5,
    findings_hdr: 6,
    findings_body: 7,
    photos_hdr: 11,
    photo_pair_0: 12,
    photo_pair_1: 13,
  },
};

export const MOCK_TEMPLATES = [
  {
    id: 'tpl_default',
    template_name: 'デフォルトフォーマット（V5）',
    cell_mapping: deepClone(DEFAULT_CELL_MAPPING),
  },
  {
    id: 'tpl_a_company',
    template_name: 'A社指定フォーマット（サンプル）',
    cell_mapping: {
      commonFields: {
        date: 2,
        department: 3,
        submitter: 4,
        time: 5,
        progress: 6,
        delayReason: 7,
      },
      taskBlock: {
        startRow: 9,
        blockSize: 18,
      },
      offsets: {
        header: 0,
        target_place: 1,
        task_detail: 2,
        symptom: 3,
        action_taken: 4,
        has_problem: 5,
        findings_hdr: 6,
        findings_body: 7,
        // findings_body は4行マージ（7〜10）なので photos_hdr は11以降が必須
        photos_hdr: 11,
        photo_pair_0: 12,
        photo_pair_1: 13,
      },
    },
  },
];

const toSafeNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const normalizeTemplateMapping = (cellMapping) => {
  const source = cellMapping && typeof cellMapping === 'object' ? cellMapping : {};
  const commonFields = source.commonFields && typeof source.commonFields === 'object'
    ? source.commonFields
    : {};
  const taskBlock = source.taskBlock && typeof source.taskBlock === 'object'
    ? source.taskBlock
    : {};
  const offsets = source.offsets && typeof source.offsets === 'object'
    ? source.offsets
    : {};

  const normalizedOffsets = Object.fromEntries(
    Object.entries(DEFAULT_CELL_MAPPING.offsets).map(([key, fallback]) => [
      key,
      toSafeNumber(offsets[key], fallback),
    ]),
  );

  // ── ガード①: findings_body 4行マージ範囲と photos_hdr の重複防止 ──
  // findings_body は ExcelJS で bRow〜bRow+3 の4行マージになる。
  // photos_hdr が そのマージ範囲（bRow+3 以下）に入ると重複マージエラーになるため強制補正。
  const minPhotosHdr = normalizedOffsets.findings_body + 4;
  if (normalizedOffsets.photos_hdr < minPhotosHdr) {
    const shift = minPhotosHdr - normalizedOffsets.photos_hdr;
    normalizedOffsets.photos_hdr   += shift;
    normalizedOffsets.photo_pair_0 += shift;
    normalizedOffsets.photo_pair_1 += shift;
  }

  // ── ガード②: blockSize がオフセット最大値+1 かつ最低20行を確保 ──
  // blockSize が小さすぎると次タスクブロックのマージ範囲と衝突してエラーになる。
  const maxOffset     = Math.max(...Object.values(normalizedOffsets));
  const minBlockSize  = Math.max(20, maxOffset + 2); // +2 = オフセット行自体 + 次ブロックとの余白1行
  const rawBlockSize  = toSafeNumber(taskBlock.blockSize, DEFAULT_CELL_MAPPING.taskBlock.blockSize);
  const safeBlockSize = Math.max(rawBlockSize, minBlockSize);

  return {
    commonFields: Object.fromEntries(
      Object.entries(DEFAULT_CELL_MAPPING.commonFields).map(([key, fallback]) => [
        key,
        toSafeNumber(commonFields[key], fallback),
      ]),
    ),
    taskBlock: {
      startRow:  toSafeNumber(taskBlock.startRow, DEFAULT_CELL_MAPPING.taskBlock.startRow),
      blockSize: safeBlockSize,
    },
    offsets: normalizedOffsets,
  };
};
