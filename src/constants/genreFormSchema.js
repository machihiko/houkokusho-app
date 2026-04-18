/**
 * genreFormSchema.js
 * ジャンルごとの入力フィールド定義（スキーマ駆動フォーム）
 *
 * 各フィールドの構造:
 *   key          : customFields に格納するキー名（select は key+'_key' に選択値も保存）
 *   label        : 表示ラベル
 *   type         : 'select' | 'textarea' | 'text'
 *   options      : type==='select' の場合の選択肢 [{ value, label }]
 *   allowOther   : type==='select' で「その他」選択時に自由入力を表示するか
 *   otherType    : 自由入力欄の種類 'text' | 'textarea'（省略時 'text'）
 *   otherLabel   : 自由入力欄の見出し（省略時 '詳しく入力'）
 *   otherPlaceholder : 自由入力欄のプレースホルダー
 *   allowVoice   : 音声入力ボタンを表示するか
 *   optional     : true の場合、任意フィールドとして扱う
 *   placeholder  : type=textarea/text 時のプレースホルダー
 */

// 全ジャンル共通：担当場所
const TARGET_PLACE_FIELD = {
  key:              'target_place',
  label:            '担当場所',
  type:             'select',
  allowOther:       true,
  otherType:        'text',
  otherLabel:       '場所を詳しく入力',
  otherPlaceholder: '場所を具体的に入力してください...',
  allowVoice:       true,
  options: [
    { value: 'entrance',  label: 'エントランス' },
    { value: '1f_toilet', label: '1Fトイレ' },
    { value: '2f_toilet', label: '2Fトイレ' },
    { value: 'corridor',  label: '廊下・通路' },
    { value: 'parking',   label: '駐車場' },
    { value: 'staircase', label: '階段' },
    { value: 'roof',      label: '屋上' },
    { value: 'elec_room', label: '電気室' },
    { value: 'mech_room', label: '機械室' },
    { value: 'other',     label: 'その他' },
  ],
};

export const GENRE_FORM_SCHEMA = {

  // ── 清掃 ──────────────────────────────────────────
  cleaning: [
    TARGET_PLACE_FIELD,
    {
      key:              'task_detail',
      label:            '清掃内容',
      type:             'select',
      allowOther:       true,
      otherType:        'textarea',
      otherLabel:       '詳しく入力',
      otherPlaceholder: '清掃内容を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'floor_mop',    label: '床面モップ掛け' },
        { value: 'trash',        label: 'ゴミ回収・分別' },
        { value: 'glass_wipe',   label: 'ガラス拭き' },
        { value: 'toilet_clean', label: 'トイレ清掃' },
        { value: 'supply',       label: '備品補充' },
        { value: 'other',        label: 'その他' },
      ],
    },
  ],

  // ── 点検 ──────────────────────────────────────────
  inspection: [
    TARGET_PLACE_FIELD,
    {
      key:              'task_detail',
      label:            '点検項目',
      type:             'select',
      allowOther:       true,
      otherType:        'textarea',
      otherLabel:       '詳しく入力',
      otherPlaceholder: '点検項目を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'fire_equip',   label: '消防設備' },
        { value: 'air_cond',     label: '空調設備' },
        { value: 'plumbing',     label: '給排水設備' },
        { value: 'electrical',   label: '電気設備' },
        { value: 'exterior',     label: '外観・建具' },
        { value: 'other',        label: 'その他' },
      ],
    },
    {
      key:              'symptom',
      label:            '症状',
      type:             'select',
      optional:         true,
      allowOther:       true,
      otherType:        'text',
      otherLabel:       '症状を詳しく入力',
      otherPlaceholder: '症状を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'malfunction',  label: '動作不良' },
        { value: 'noise_smell',  label: '異音・異臭' },
        { value: 'lamp_out',     label: 'ランプ切れ' },
        { value: 'dirt_clog',    label: '汚れ・詰まり' },
        { value: 'other',        label: 'その他' },
      ],
    },
  ],

  // ── 修理 ──────────────────────────────────────────
  repair: [
    TARGET_PLACE_FIELD,
    {
      key:              'task_detail',
      label:            '対象箇所',
      type:             'select',
      allowOther:       true,
      otherType:        'textarea',
      otherLabel:       '詳しく入力',
      otherPlaceholder: '対象箇所を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'toilet_tap',   label: 'トイレ水栓' },
        { value: 'door_knob',    label: 'ドアノブ' },
        { value: 'lighting',     label: '蛍光灯' },
        { value: 'wall_floor',   label: '壁紙・床材' },
        { value: 'other',        label: 'その他' },
      ],
    },
    {
      key:              'symptom',
      label:            '症状',
      type:             'select',
      optional:         true,
      allowOther:       true,
      otherType:        'text',
      otherLabel:       '症状を詳しく入力',
      otherPlaceholder: '症状を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'water_leak',   label: '水漏れ' },
        { value: 'broken',       label: '破損・割れ' },
        { value: 'light_fail',   label: '点灯不良' },
        { value: 'peeling',      label: '剥がれ' },
        { value: 'other',        label: 'その他' },
      ],
    },
    {
      key:              'action_taken',
      label:            '対応内容',
      type:             'select',
      optional:         true,
      allowOther:       true,
      otherType:        'textarea',
      otherLabel:       '対応内容を詳しく入力',
      otherPlaceholder: '対応内容を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'replaced',     label: '部品交換' },
        { value: 'temp_fix',     label: '応急処置済み（要経過観察）' },
        { value: 'reported',     label: '専門業者へ手配済み' },
        { value: 'other',        label: 'その他' },
      ],
    },
  ],

  // ── 巡回 ──────────────────────────────────────────
  patrol: [
    TARGET_PLACE_FIELD,
    {
      key:              'task_detail',
      label:            '巡回箇所',
      type:             'select',
      allowOther:       true,
      otherType:        'textarea',
      otherLabel:       '詳しく入力',
      otherPlaceholder: '巡回箇所を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'perimeter',    label: '建物外周' },
        { value: 'corridor',     label: '各階通路' },
        { value: 'parking',      label: '駐車場・駐輪場' },
        { value: 'other',        label: 'その他' },
      ],
    },
    {
      key:              'symptom',
      label:            '症状',
      type:             'select',
      optional:         true,
      allowOther:       true,
      otherType:        'text',
      otherLabel:       '症状を詳しく入力',
      otherPlaceholder: '症状を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'suspicious',   label: '不審物あり' },
        { value: 'bike',         label: '放置自転車あり' },
        { value: 'light_out',    label: '照明切れ' },
        { value: 'other',        label: 'その他' },
      ],
    },
  ],

  // ── 緊急対応 ──────────────────────────────────────
  emergency: [
    TARGET_PLACE_FIELD,
    {
      key:              'task_detail',
      label:            '状況・対応内容',
      type:             'select',
      allowOther:       true,
      otherType:        'textarea',
      otherLabel:       '詳しく入力',
      otherPlaceholder: '状況・対応内容を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'water_leak',   label: '水漏れ対応' },
        { value: 'power_out',    label: '停電対応' },
        { value: 'intrusion',    label: '不審者対応' },
        { value: 'injury',       label: '負傷者対応' },
        { value: 'other',        label: 'その他' },
      ],
    },
    {
      key:              'symptom',
      label:            '症状',
      type:             'select',
      optional:         true,
      allowOther:       true,
      otherType:        'text',
      otherLabel:       '症状を詳しく入力',
      otherPlaceholder: '症状を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'water_leak',   label: '水漏れ' },
        { value: 'power_out',    label: '停電' },
        { value: 'intrusion',    label: '不審者' },
        { value: 'injury',       label: '負傷者' },
        { value: 'other',        label: 'その他' },
      ],
    },
    {
      key:              'action_taken',
      label:            '対応内容',
      type:             'select',
      optional:         true,
      allowOther:       true,
      otherType:        'textarea',
      otherLabel:       '対応内容を詳しく入力',
      otherPlaceholder: '対応内容を具体的に入力してください...',
      allowVoice:       true,
      options: [
        { value: 'first_aid',    label: '応急処置済み' },
        { value: 'specialist',   label: '専門業者へ連絡済み' },
        { value: 'authorities',  label: '警察・消防へ通報済み' },
        { value: 'other',        label: 'その他' },
      ],
    },
  ],

  // ── カスタムジャンル向けフォールバック ──────────────
  _fallback: [
    TARGET_PLACE_FIELD,
    {
      key:         'task_detail',
      label:       '作業内容',
      type:        'textarea',
      placeholder: '作業の内容を具体的に入力してください...',
      allowVoice:  true,
    },
  ],
};

/**
 * ジャンル別「問題/異常の有無」ラベル設定
 * emergency は非表示のため定義なし
 */
export const HAS_PROBLEM_CONFIG = {
  inspection: { label: '異常の有無', noLabel: '異常無し', yesLabel: '異常あり' },
  patrol:     { label: '異常の有無', noLabel: '異常無し', yesLabel: '異常あり' },
  _default:   { label: '問題の有無', noLabel: '問題無し', yesLabel: '問題あり' },
};
