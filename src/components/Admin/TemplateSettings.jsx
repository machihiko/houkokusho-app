import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Save, ChevronLeft, Copy } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import {
  DEFAULT_CELL_MAPPING,
  MOCK_TEMPLATES,
  normalizeTemplateMapping,
} from '../../utils/templateMapping';
import './TemplateSettings.css';

// ── フィールド定義（共通情報）────────────────────────────
const COMMON_FIELD_DEFS = [
  { key: 'date',        label: '報告日' },
  { key: 'department',  label: '所属（案件名）' },
  { key: 'submitter',   label: '氏名' },
  { key: 'time',        label: '対応時間' },
  { key: 'progress',    label: '全体進捗' },
  { key: 'delayReason', label: '遅延理由' },
];

// ── フィールド定義（タスクブロック内オフセット）───────────
const OFFSET_FIELD_DEFS = [
  { key: 'header',        label: 'タスクヘッダー' },
  { key: 'target_place',  label: '担当場所' },
  { key: 'task_detail',   label: '作業内容' },
  { key: 'symptom',       label: '症状' },
  { key: 'action_taken',  label: '対応内容' },
  { key: 'has_problem',   label: '問題 / 異常' },
  { key: 'findings_hdr',  label: '報告内容 (H)' },
  { key: 'findings_body', label: '報告内容本文' },
  { key: 'photos_hdr',    label: '写真 (H)' },
  { key: 'photo_pair_0',  label: '写真①' },
  { key: 'photo_pair_1',  label: '写真②' },
];

// ── フィールドカラー定義 ────────────────────────────────
const FIELD_COLORS = {
  date:         { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  department:   { bg: '#ede9fe', text: '#5b21b6', border: '#c4b5fd' },
  submitter:    { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' },
  time:         { bg: '#fef3c7', text: '#78350f', border: '#fcd34d' },
  progress:     { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  delayReason:  { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' },
  header:       { bg: '#cffafe', text: '#155e75', border: '#67e8f9' },
  target_place: { bg: '#e0e7ff', text: '#3730a3', border: '#a5b4fc' },
  task_detail:  { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' },
  symptom:      { bg: '#ffedd5', text: '#9a3412', border: '#fdba74' },
  action_taken: { bg: '#ccfbf1', text: '#134e4a', border: '#5eead4' },
  has_problem:  { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af' },
  findings_hdr: { bg: '#e0f2fe', text: '#0c4a6e', border: '#7dd3fc' },
  findings_body:{ bg: '#dbeafe', text: '#1e3a8a', border: '#60a5fa' },
  photos_hdr:   { bg: '#ecfccb', text: '#365314', border: '#a3e635' },
  photo_pair_0: { bg: '#dcfce7', text: '#14532d', border: '#86efac' },
  photo_pair_1: { bg: '#d1fae5', text: '#064e3b', border: '#34d399' },
};

// ── ユーティリティ ─────────────────────────────────────
const genId    = () => `tpl_${Date.now()}`;
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

// ── スタンプラベル取得 ──────────────────────────────────
const getFieldLabel = (key) =>
  COMMON_FIELD_DEFS.find(f => f.key === key)?.label
  ?? OFFSET_FIELD_DEFS.find(f => f.key === key)?.label
  ?? key;

// ══════════════════════════════════════════════════════
//  TemplateSettings — モーダルコンポーネント
// ══════════════════════════════════════════════════════
const TemplateSettings = ({ onClose }) => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [view,      setView]      = useState('list'); // 'list' | 'edit'
  const [draft,     setDraft]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [isSaving,  setIsSaving]  = useState(false);

  // スタンプUI用 state
  const [selectedStamp, setSelectedStamp] = useState(null); // { key } | null

  // ── 初回マウント時にDBからテンプレートを取得 ──────
  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[TemplateSettings] テンプレート取得失敗:', error);
        setTemplates(MOCK_TEMPLATES);
      } else if (data.length === 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('report_templates')
          .insert({
            template_name: 'デフォルトフォーマット（V5）',
            cell_mapping:  DEFAULT_CELL_MAPPING,
            company_id:    user?.companyId ?? null,
          })
          .select()
          .single();
        if (insertError) {
          console.error('[TemplateSettings] デフォルトインサート失敗:', insertError);
          setTemplates(MOCK_TEMPLATES);
        } else {
          setTemplates([{
            id: inserted.id,
            template_name: inserted.template_name,
            cell_mapping: normalizeTemplateMapping(inserted.cell_mapping),
          }]);
        }
      } else {
        setTemplates(data.map((tpl) => ({
          ...tpl,
          cell_mapping: normalizeTemplateMapping(tpl.cell_mapping),
        })));
      }
      setLoading(false);
    };
    loadTemplates();
  }, []);

  // ── 新規作成 ──────────────────────────────────────
  const handleNew = () => {
    setDraft({ id: genId(), template_name: '', cell_mapping: deepClone(DEFAULT_CELL_MAPPING) });
    setSelectedStamp(null);
    setView('edit');
  };

  // ── 編集開始 ──────────────────────────────────────
  const handleEdit = (tpl) => {
    setDraft(deepClone(tpl));
    setSelectedStamp(null);
    setView('edit');
  };

  // ── 複製 → DBにINSERT ─────────────────────────────
  const handleDuplicate = async (tpl) => {
    setIsSaving(true);
    const { data, error } = await supabase
      .from('report_templates')
      .insert({
        template_name: `${tpl.template_name}（コピー）`,
        cell_mapping:  normalizeTemplateMapping(tpl.cell_mapping),
        company_id:    user?.companyId ?? null,
      })
      .select()
      .single();
    setIsSaving(false);
    if (error) { alert(`複製に失敗しました。\n${error.message}`); return; }
    setTemplates(prev => [...prev, {
      id: data.id,
      template_name: data.template_name,
      cell_mapping: normalizeTemplateMapping(data.cell_mapping),
    }]);
  };

  // ── 削除 → DBからDELETE ───────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('このテンプレートを削除しますか？')) return;
    setIsSaving(true);
    const { error } = await supabase.from('report_templates').delete().eq('id', id);
    setIsSaving(false);
    if (error) { alert(`削除に失敗しました。\n${error.message}`); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  // ── 保存 → INSERT（新規） or UPDATE（既存）─────────
  const handleSave = async () => {
    if (!draft.template_name.trim()) { alert('テンプレート名を入力してください。'); return; }
    setIsSaving(true);
    const isNew = !templates.find(t => t.id === draft.id);

    if (isNew) {
      const { data, error } = await supabase
        .from('report_templates')
        .insert({
          template_name: draft.template_name,
          cell_mapping: normalizeTemplateMapping(draft.cell_mapping),
          company_id:   user?.companyId ?? null,
        })
        .select()
        .single();
      setIsSaving(false);
      if (error) { alert(`保存に失敗しました。\n${error.message}`); return; }
      setTemplates(prev => [...prev, {
        id: data.id,
        template_name: data.template_name,
        cell_mapping: normalizeTemplateMapping(data.cell_mapping),
      }]);
    } else {
      const { error } = await supabase
        .from('report_templates')
        .update({
          template_name: draft.template_name,
          cell_mapping: normalizeTemplateMapping(draft.cell_mapping),
        })
        .eq('id', draft.id);
      setIsSaving(false);
      if (error) { alert(`保存に失敗しました。\n${error.message}`); return; }
      setTemplates(prev => prev.map(t => t.id === draft.id ? {
        ...t, ...draft,
        cell_mapping: normalizeTemplateMapping(draft.cell_mapping),
      } : t));
    }
    setView('list');
  };

  // ── スタンプ配置：共通情報 ──────────────────────────
  const handleCommonCellClick = (rowNum) => {
    if (selectedStamp) {
      // 既存スタンプがいたらスワップ
      setDraft(d => {
        const newCommon = { ...d.cell_mapping.commonFields };
        const existingKey = Object.keys(newCommon)
          .find(k => k !== selectedStamp.key && newCommon[k] === rowNum);
        if (existingKey) newCommon[existingKey] = newCommon[selectedStamp.key];
        newCommon[selectedStamp.key] = rowNum;
        return { ...d, cell_mapping: { ...d.cell_mapping, commonFields: newCommon } };
      });
      setSelectedStamp(null);
    } else {
      // セルのスタンプを拾い上げる
      const key = Object.keys(draft.cell_mapping.commonFields)
        .find(k => draft.cell_mapping.commonFields[k] === rowNum);
      if (key) setSelectedStamp({ key });
    }
  };

  // ── スタンプ配置：タスクオフセット ─────────────────
  const handleOffsetCellClick = (offset) => {
    if (selectedStamp) {
      setDraft(d => {
        const newOffsets = { ...d.cell_mapping.offsets };
        const existingKey = Object.keys(newOffsets)
          .find(k => k !== selectedStamp.key && newOffsets[k] === offset);
        if (existingKey) newOffsets[existingKey] = newOffsets[selectedStamp.key];
        newOffsets[selectedStamp.key] = offset;
        return { ...d, cell_mapping: { ...d.cell_mapping, offsets: newOffsets } };
      });
      setSelectedStamp(null);
    } else {
      const key = Object.keys(draft.cell_mapping.offsets)
        .find(k => draft.cell_mapping.offsets[k] === offset);
      if (key) setSelectedStamp({ key });
    }
  };

  // ── WYSIWYGシートのセルクリック（共通 / オフセット を自動振り分け）──
  const handleSheetCellClick = (rowNum) => {
    const { commonFields, taskBlock, offsets } = draft.cell_mapping;
    const { startRow, blockSize } = taskBlock;
    const isCommonStamp = selectedStamp
      ? COMMON_FIELD_DEFS.some(f => f.key === selectedStamp.key) : false;
    const isOffsetStamp = selectedStamp
      ? OFFSET_FIELD_DEFS.some(f => f.key === selectedStamp.key) : false;

    if (!selectedStamp) {
      // フィールドを拾い上げる
      const cKey = Object.keys(commonFields).find(k => commonFields[k] === rowNum);
      if (cKey) { setSelectedStamp({ key: cKey }); return; }
      if (rowNum >= startRow && rowNum < startRow + blockSize) {
        const offset = rowNum - startRow;
        const oKey = Object.keys(offsets).find(k => offsets[k] === offset);
        if (oKey) { setSelectedStamp({ key: oKey }); return; }
      }
      return;
    }
    if (isCommonStamp) {
      handleCommonCellClick(rowNum);
    } else if (isOffsetStamp) {
      // タスクブロック1（最初のブロック）の範囲内のみ配置可
      if (rowNum >= startRow && rowNum < startRow + blockSize) {
        handleOffsetCellClick(rowNum - startRow);
      }
    }
  };

  // ── 一覧に戻る（state リセット）───────────────────
  const goBackToList = () => {
    setView('list');
    setSelectedStamp(null);
  };

  // ══════════════════════════════════════════════════
  //  WYSIWYGリアルなExcelシート
  // ══════════════════════════════════════════════════
  const renderWysiwygSheet = () => {
    if (!draft) return null;
    const { commonFields, taskBlock, offsets } = draft.cell_mapping;
    const { startRow, blockSize } = taskBlock;

    const isCommonStamp = selectedStamp
      ? COMMON_FIELD_DEFS.some(f => f.key === selectedStamp.key) : false;
    const isOffsetStamp = selectedStamp
      ? OFFSET_FIELD_DEFS.some(f => f.key === selectedStamp.key) : false;

    // 各フィールドのダミーデータ
    const DUMMY_COMMON = {
      date: '2026-04-19', department: '東館 定期清掃', submitter: '山田 太郎',
      time: '09:00〜17:00', progress: '75%', delayReason: '—',
    };
    const DUMMY_TASK = {
      header: '作業 #1 ▶ 東館 3F', target_place: 'B棟 3F トイレ',
      task_detail: '定期清掃・消毒作業', symptom: '排水詰まり確認',
      action_taken: '高圧洗浄で対応', has_problem: '問題なし',
      findings_hdr: '▌ 報告内容', findings_body: '清掃完了・問題なし確認済み',
      photos_hdr: '▌ 写真', photo_pair_0: '📷 写真①', photo_pair_1: '📷 写真②',
    };

    const maxCommonRow = Math.max(3, ...Object.values(commonFields));
    const lastTaskRow  = startRow + blockSize * 2 - 1;
    const maxRow       = Math.max(maxCommonRow, lastTaskRow) + 2;

    // 各行のデータを計算
    const rowData = Array.from({ length: maxRow }, (_, i) => {
      const rowNum = i + 1;

      // 装飾行（1〜2行目）
      if (rowNum <= 2) return { rowNum, type: 'deco', decoIdx: rowNum };

      // 共通フィールド行
      const cKey = Object.keys(commonFields).find(k => commonFields[k] === rowNum);
      if (cKey) return { rowNum, type: 'common', key: cKey };

      // タスクブロック行（ブロック0と1）
      for (let b = 0; b < 2; b++) {
        const blockStart = startRow + b * blockSize;
        if (rowNum >= blockStart && rowNum < blockStart + blockSize) {
          const offset = rowNum - blockStart;
          const oKey = Object.keys(offsets).find(k => offsets[k] === offset) ?? null;
          return { rowNum, type: 'task', blockIndex: b, key: oKey, isBlockStart: rowNum === blockStart };
        }
      }

      return { rowNum, type: 'empty' };
    });

    return (
      <div className={`ts-wysiwyg-sheet${selectedStamp ? ' ts-wysiwyg-sheet--placement' : ''}`}>
        {/* 列ヘッダー */}
        <div className="ts-ws-header">
          <div className="ts-ws-corner" />
          <div className="ts-ws-col-label">A</div>
          <div className="ts-ws-col-label ts-ws-col-label--bf">B〜F（データ）</div>
        </div>

        {/* 行本体 */}
        <div className="ts-ws-body">
          {rowData.map(({ rowNum, type, key, blockIndex, isBlockStart, decoIdx }) => {

            // ── 装飾行 ──
            if (type === 'deco') {
              return (
                <div key={rowNum} className={`ts-ws-row ts-ws-row--deco ts-ws-row--deco${decoIdx}`}>
                  <div className="ts-ws-rnum">{rowNum}</div>
                  <div className="ts-ws-merged">
                    {decoIdx === 1
                      ? '報　告　書'
                      : '作成日：2026-04-19　提出者：山田 太郎'}
                  </div>
                </div>
              );
            }

            // ── 共通フィールド行 ──
            if (type === 'common') {
              const c        = FIELD_COLORS[key];
              const label    = getFieldLabel(key);
              const dummy    = DUMMY_COMMON[key] ?? '';
              const isActive = selectedStamp?.key === key;
              const canClick = !selectedStamp || isCommonStamp;
              return (
                <div
                  key={rowNum}
                  className={`ts-ws-row ts-ws-row--common${isActive ? ' ts-ws-row--active' : ''}${canClick ? ' ts-ws-row--clickable' : ''}`}
                  style={{ backgroundColor: (c?.bg ?? '#fff') + '30' }}
                  onClick={canClick ? () => handleSheetCellClick(rowNum) : undefined}
                  title="クリックして選択 / 配置"
                >
                  <div className="ts-ws-rnum">{rowNum}</div>
                  <div className="ts-ws-cell-a">
                    <span className="ts-ws-badge"
                          style={{ background: c?.bg, color: c?.text, borderColor: c?.border }}>
                      {label}
                    </span>
                  </div>
                  <div className="ts-ws-cell-bf" style={{ color: c?.text, opacity: 0.75 }}>
                    {dummy}
                  </div>
                </div>
              );
            }

            // ── タスクブロック行 ──
            if (type === 'task') {
              const c        = key ? FIELD_COLORS[key] : null;
              const label    = key ? getFieldLabel(key) : null;
              const dummy    = key ? (DUMMY_TASK[key] ?? '') : '';
              const isActive = key && selectedStamp?.key === key;
              const isMirror = blockIndex === 1;
              const canClick = !isMirror && (!selectedStamp || isOffsetStamp);
              return (
                <div
                  key={rowNum}
                  className={`ts-ws-row ts-ws-row--task${isBlockStart ? ' ts-ws-row--block-start' : ''}${isActive ? ' ts-ws-row--active' : ''}${isMirror ? ' ts-ws-row--mirror' : ''}${canClick ? ' ts-ws-row--clickable' : ''}`}
                  style={c ? { backgroundColor: c.bg + (isMirror ? '14' : '28') } : {}}
                  onClick={canClick ? () => handleSheetCellClick(rowNum) : undefined}
                  title={canClick ? 'クリックして配置' : undefined}
                >
                  <div className="ts-ws-rnum">{rowNum}</div>
                  <div className="ts-ws-cell-a">
                    {label && (
                      <span className="ts-ws-badge"
                            style={{ background: c?.bg, color: c?.text, borderColor: c?.border,
                                     opacity: isMirror ? 0.5 : 1 }}>
                        {label}
                      </span>
                    )}
                    {!label && !isMirror && isOffsetStamp && selectedStamp && (
                      <span className="ts-ws-drop-hint">ここに配置</span>
                    )}
                  </div>
                  <div className="ts-ws-cell-bf"
                       style={{ color: c?.text ?? 'var(--text-secondary)', opacity: isMirror ? 0.35 : 0.78 }}>
                    {dummy}
                  </div>
                </div>
              );
            }

            // ── 空行（共通スタンプ選択時のみクリック可）──
            return (
              <div
                key={rowNum}
                className={`ts-ws-row ts-ws-row--empty${selectedStamp && isCommonStamp ? ' ts-ws-row--clickable' : ''}`}
                onClick={(selectedStamp && isCommonStamp) ? () => handleSheetCellClick(rowNum) : undefined}
              >
                <div className="ts-ws-rnum">{rowNum}</div>
                <div className="ts-ws-cell-a" />
                <div className="ts-ws-cell-bf" />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════
  //  右カラム：リアルタイムプレビュー（変更なし）
  // ══════════════════════════════════════════════════
  const renderMiniPreview = () => {
    if (!draft) return null;
    const { commonFields, taskBlock, offsets } = draft.cell_mapping;
    const { startRow, blockSize } = taskBlock;

    const COMMON_COLORS = {
      date:        { bg: '#dbeafe', text: '#1e40af', shortLabel: '報告日' },
      department:  { bg: '#ede9fe', text: '#5b21b6', shortLabel: '案件名' },
      submitter:   { bg: '#d1fae5', text: '#065f46', shortLabel: '氏名' },
      time:        { bg: '#fef3c7', text: '#92400e', shortLabel: '対応時間' },
      progress:    { bg: '#fee2e2', text: '#991b1b', shortLabel: '進捗' },
      delayReason: { bg: '#f1f5f9', text: '#374151', shortLabel: '遅延理由' },
    };
    const TASK_COLORS = [
      { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
      { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
    ];
    const offsetShortLabel = {
      header: 'ヘッダー', target_place: '担当場所', task_detail: '作業内容',
      symptom: '症状', action_taken: '対応内容', has_problem: '問題有無',
      findings_hdr: '報告内容H', findings_body: '報告本文',
      photos_hdr: '写真H', photo_pair_0: '写真①', photo_pair_1: '写真②',
    };

    const rowContent = {};
    Object.entries(commonFields).forEach(([key, rowNum]) => {
      if (COMMON_COLORS[key]) rowContent[rowNum] = { type: 'common', key, ...COMMON_COLORS[key] };
    });
    for (let b = 0; b < 2; b++) {
      const blockStart = startRow + b * blockSize;
      for (let r = blockStart; r < blockStart + blockSize; r++) {
        const relRow = r - blockStart;
        const matchedKey = Object.entries(offsets).find(([, v]) => v === relRow)?.[0];
        rowContent[r] = {
          type: 'task', blockIndex: b,
          label: matchedKey ? offsetShortLabel[matchedKey] : null,
          ...TASK_COLORS[b],
        };
      }
    }
    const maxRow = startRow + blockSize * 2 - 1;

    return (
      <div className="ts-preview-pane">
        <div className="ts-preview-pane-title">ライブプレビュー</div>
        <p className="ts-preview-pane-desc">配置が即座に反映されます</p>
        <div className="ts-preview-legend">
          {Object.entries(COMMON_COLORS).map(([key, c]) => (
            <span key={key} className="ts-legend-chip"
                  style={{ background: c.bg, color: c.text, borderColor: c.text + '50' }}>
              {c.shortLabel}
            </span>
          ))}
          {TASK_COLORS.map((c, i) => (
            <span key={i} className="ts-legend-chip"
                  style={{ background: c.bg, color: c.text, borderColor: c.border }}>
              作業{i + 1}
            </span>
          ))}
        </div>
        <div className="ts-mini-grid">
          <div className="ts-grid-header">
            <span className="ts-grid-rownum">#</span>
            <span className="ts-grid-col-a">A</span>
            <span className="ts-grid-col-bf">B〜F</span>
          </div>
          <div className="ts-grid-body">
            {Array.from({ length: maxRow }, (_, i) => i + 1).map(r => {
              const cell = rowContent[r];
              const isBorderRow = cell?.type === 'task' &&
                (r === startRow || r === startRow + blockSize);
              return (
                <div key={r}
                  className={`ts-grid-row${cell ? ` ts-grid-row--${cell.type}` : ''}${isBorderRow ? ' ts-grid-row--block-start' : ''}`}
                  style={cell?.bg ? { backgroundColor: cell.bg } : {}}
                >
                  <span className="ts-grid-rownum">{r}</span>
                  <span className="ts-grid-col-a">
                    {cell?.type === 'common' && (
                      <span className="ts-cell-badge"
                            style={{ background: cell.bg, color: cell.text, borderColor: cell.text + '50' }}>
                        {cell.shortLabel}
                      </span>
                    )}
                    {cell?.type === 'task' && cell.label && (
                      <span className="ts-cell-badge ts-cell-badge--task"
                            style={{ background: cell.bg, color: cell.text, borderColor: cell.border }}>
                        {cell.label}
                      </span>
                    )}
                    {cell?.type === 'task' && !cell.label && (
                      <span className="ts-cell-task-spacer">─</span>
                    )}
                  </span>
                  <span className="ts-grid-col-bf ts-grid-col-bf--data"
                        style={cell ? { opacity: 0.35, color: cell.text } : {}}>
                    {cell ? '▓▓▓' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="ts-preview-note">※ 作業3以降は同パターンで続きます</p>
      </div>
    );
  };

  // ══════════════════════════════════════════════════
  //  一覧ビュー
  // ══════════════════════════════════════════════════
  const renderList = () => (
    <div className="ts-list-view">
      <div className="ts-list-header">
        <h3 className="ts-section-title">登録済みテンプレート</h3>
        <button className="ts-btn-new" onClick={handleNew} disabled={loading || isSaving}>
          <Plus size={14} /> 新規テンプレート
        </button>
      </div>

      {loading ? (
        <p className="ts-empty ts-loading">読み込み中...</p>
      ) : templates.length === 0 ? (
        <p className="ts-empty">テンプレートがありません。「新規テンプレート」から作成してください。</p>
      ) : (
        <ul className="ts-template-list">
          {templates.map(tpl => (
            <li key={tpl.id} className="ts-template-item">
              <div className="ts-template-info">
                <span className="ts-template-name">{tpl.template_name}</span>
                <span className="ts-template-meta">
                  タスク開始行: {tpl.cell_mapping.taskBlock.startRow}行目 ／
                  ブロックサイズ: {tpl.cell_mapping.taskBlock.blockSize}行
                </span>
              </div>
              <div className="ts-template-actions">
                <button className="ts-icon-btn" title="編集" onClick={() => handleEdit(tpl)} disabled={isSaving}>
                  <Pencil size={14} />
                </button>
                <button className="ts-icon-btn" title="複製" onClick={() => handleDuplicate(tpl)} disabled={isSaving}>
                  <Copy size={14} />
                </button>
                <button className="ts-icon-btn danger" title="削除" onClick={() => handleDelete(tpl.id)} disabled={isSaving}>
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ══════════════════════════════════════════════════
  //  編集ビュー：WYSIWYG Excel シート方式
  // ══════════════════════════════════════════════════
  const renderEdit = () => {
    const { taskBlock } = draft.cell_mapping;

    return (
      <div className="ts-edit-view">
        <button className="ts-btn-back" onClick={goBackToList}>
          <ChevronLeft size={15} /> 一覧に戻る
        </button>

        <div className="ts-edit-layout">
          {/* ── 左カラム：スタンプ + WYSIWYGシート ── */}
          <div className="ts-edit-form">

            {/* テンプレート名 */}
            <div className="ts-field-group">
              <label className="ts-label">テンプレート名</label>
              <input
                type="text"
                className="ts-input"
                value={draft.template_name}
                onChange={e => setDraft(d => ({ ...d, template_name: e.target.value }))}
                placeholder="例：デフォルトフォーマット"
              />
            </div>

            {/* 操作ガイドバナー */}
            <div className={`ts-guide-banner ${selectedStamp ? 'ts-guide-banner--active' : 'ts-guide-banner--idle'}`}>
              <span className="ts-guide-icon">{selectedStamp ? '📌' : '💡'}</span>
              <span>
                {selectedStamp
                  ? <>
                      <strong style={{ marginRight: 4 }}>
                        「{getFieldLabel(selectedStamp.key)}」
                      </strong>
                      を配置したいシートのセルをクリックしてください。もう一度スタンプを押すと解除できます。
                    </>
                  : 'スタンプをクリックして選択 → シートのセルをクリックして配置（すでに配置済みのセルは入れ替え）'
                }
              </span>
            </div>

            {/* スタンプパレット（共通情報 ＋ タスク内容の2グループ） */}
            <div className="ts-stamp-palette">
              <div className="ts-stamp-group">
                <div className="ts-stamp-group-label">📋 共通情報</div>
                <div className="ts-stamp-chips">
                  {COMMON_FIELD_DEFS.map(({ key, label }) => {
                    const c = FIELD_COLORS[key];
                    return (
                      <button
                        key={key}
                        className={`ts-stamp${selectedStamp?.key === key ? ' ts-stamp--selected' : ''}`}
                        style={{ background: c?.bg, color: c?.text, borderColor: c?.border }}
                        onClick={() => setSelectedStamp(prev => prev?.key === key ? null : { key })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="ts-stamp-group">
                <div className="ts-stamp-group-label">🔧 タスク内容（タスクブロック1のみ編集可）</div>
                <div className="ts-stamp-chips">
                  {OFFSET_FIELD_DEFS.map(({ key, label }) => {
                    const c = FIELD_COLORS[key];
                    return (
                      <button
                        key={key}
                        className={`ts-stamp${selectedStamp?.key === key ? ' ts-stamp--selected' : ''}`}
                        style={{ background: c?.bg, color: c?.text, borderColor: c?.border }}
                        onClick={() => setSelectedStamp(prev => prev?.key === key ? null : { key })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* タスクブロック構造設定 */}
            <div className="ts-block-config">
              <p className="ts-block-config-title">タスクブロック構造</p>
              <div className="ts-block-config-row">
                <div className="ts-block-config-field">
                  <label className="ts-label">タスク1 開始行</label>
                  <input
                    type="number"
                    className="ts-cell-input"
                    min={1} max={200}
                    value={taskBlock.startRow}
                    onChange={e => setDraft(d => ({
                      ...d,
                      cell_mapping: {
                        ...d.cell_mapping,
                        taskBlock: { ...d.cell_mapping.taskBlock, startRow: Number(e.target.value) },
                      },
                    }))}
                  />
                </div>
                <div className="ts-block-config-field">
                  <label className="ts-label">ブロックサイズ（行数）</label>
                  <input
                    type="number"
                    className="ts-cell-input"
                    min={5} max={100}
                    value={taskBlock.blockSize}
                    onChange={e => setDraft(d => ({
                      ...d,
                      cell_mapping: {
                        ...d.cell_mapping,
                        taskBlock: { ...d.cell_mapping.taskBlock, blockSize: Number(e.target.value) },
                      },
                    }))}
                  />
                </div>
              </div>
              <div className="ts-block-preview">
                {[0, 1, 2].map(n => {
                  const start = taskBlock.startRow + n * taskBlock.blockSize;
                  const end   = start + taskBlock.blockSize - 1;
                  return (
                    <div key={n} className="ts-block-chip">
                      作業{n + 1}：{start}〜{end}行目
                    </div>
                  );
                })}
                <span className="ts-block-chip muted">…</span>
              </div>
            </div>

            {/* WYSIWYGリアルExcelシート */}
            {renderWysiwygSheet()}

            {/* 保存フッター */}
            <div className="ts-edit-footer">
              <button className="ts-btn-cancel" onClick={goBackToList} disabled={isSaving}>
                キャンセル
              </button>
              <button className="ts-btn-save" onClick={handleSave} disabled={isSaving}>
                <Save size={14} /> {isSaving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>

          {/* ── 右カラム：リアルタイムプレビュー ── */}
          {renderMiniPreview()}
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════
  //  メインレンダー
  // ══════════════════════════════════════════════════
  return (
    <div className="ts-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`ts-modal${view === 'edit' ? ' ts-modal--wide' : ''}`}>
        <div className="ts-modal-header">
          <div>
            <h2 className="ts-modal-title">Excelテンプレート設定</h2>
            {view === 'edit' && (
              <p className="ts-modal-subtitle">
                フィールドを選択してグリッドに配置することでレイアウトをカスタマイズできます
              </p>
            )}
          </div>
          <button className="ts-close-btn" onClick={onClose} title="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="ts-modal-body">
          {view === 'list' ? renderList() : renderEdit()}
        </div>
      </div>
    </div>
  );
};

export default TemplateSettings;
