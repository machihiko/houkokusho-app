import { useState, useEffect } from 'react';
import { X, Plus, Pencil, Trash2, Save, ChevronLeft, Copy } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
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
  { key: 'header',        label: 'タスクヘッダー行' },
  { key: 'target_place',  label: '担当場所' },
  { key: 'task_detail',   label: '作業内容' },
  { key: 'symptom',       label: '症状' },
  { key: 'action_taken',  label: '対応内容' },
  { key: 'has_problem',   label: '問題 / 異常の有無' },
  { key: 'findings_hdr',  label: '報告内容ヘッダー' },
  { key: 'findings_body', label: '報告内容本文（4行マージ開始）' },
  { key: 'photos_hdr',    label: '写真ヘッダー' },
  { key: 'photo_pair_0',  label: '写真ペア①（1〜2枚目）' },
  { key: 'photo_pair_1',  label: '写真ペア②（3〜4枚目）' },
];

// ── ユーティリティ ─────────────────────────────────────
const genId   = () => `tpl_${Date.now()}`;
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

// ══════════════════════════════════════════════════════
//  TemplateSettings — モーダルコンポーネント
//  @param onClose  閉じるコールバック
// ══════════════════════════════════════════════════════
const TemplateSettings = ({ onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [view,      setView]      = useState('list'); // 'list' | 'edit'
  const [draft,     setDraft]     = useState(null);   // 編集中テンプレートのコピー
  const [loading,   setLoading]   = useState(true);   // 初回ロード中フラグ
  const [isSaving,  setIsSaving]  = useState(false);  // 保存/削除中フラグ

  // ── 初回マウント時にDBからテンプレートを取得 ──────
  useEffect(() => {
    const loadTemplates = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('report_templates')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        // DB取得失敗時はモックデータにフォールバック
        console.error('[TemplateSettings] テンプレート取得失敗:', error);
        setTemplates(MOCK_TEMPLATES);
      } else if (data.length === 0) {
        // DBが空の場合、デフォルトテンプレートをインサートして表示
        const { data: inserted, error: insertError } = await supabase
          .from('report_templates')
          .insert({
            template_name: 'デフォルトフォーマット（V5）',
            cell_mapping:  DEFAULT_CELL_MAPPING,
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
    setDraft({
      id:            genId(), // 仮ID（INSERT後にDBのUUIDで上書き）
      template_name: '',
      cell_mapping:  deepClone(DEFAULT_CELL_MAPPING),
    });
    setView('edit');
  };

  // ── 編集開始 ──────────────────────────────────────
  const handleEdit = (tpl) => {
    setDraft(deepClone(tpl));
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
    const { error } = await supabase
      .from('report_templates')
      .delete()
      .eq('id', id);
    setIsSaving(false);
    if (error) { alert(`削除に失敗しました。\n${error.message}`); return; }
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  // ── 保存 → INSERT（新規） or UPDATE（既存）─────────
  const handleSave = async () => {
    if (!draft.template_name.trim()) {
      alert('テンプレート名を入力してください。');
      return;
    }
    setIsSaving(true);
    // draftのIDがテンプレート一覧に存在しなければ新規INSERT
    const isNew = !templates.find(t => t.id === draft.id);

    if (isNew) {
      const { data, error } = await supabase
        .from('report_templates')
        .insert({
          template_name: draft.template_name,
          cell_mapping: normalizeTemplateMapping(draft.cell_mapping),
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
        ...t,
        ...draft,
        cell_mapping: normalizeTemplateMapping(draft.cell_mapping),
      } : t));
    }
    setView('list');
  };

  // ── ドラフト更新ヘルパー ───────────────────────────
  const setCommonRow = (key, val) =>
    setDraft(d => ({
      ...d,
      cell_mapping: {
        ...d.cell_mapping,
        commonFields: { ...d.cell_mapping.commonFields, [key]: Number(val) },
      },
    }));

  const setTaskBlock = (key, val) =>
    setDraft(d => ({
      ...d,
      cell_mapping: {
        ...d.cell_mapping,
        taskBlock: { ...d.cell_mapping.taskBlock, [key]: Number(val) },
      },
    }));

  const setOffset = (key, val) =>
    setDraft(d => ({
      ...d,
      cell_mapping: {
        ...d.cell_mapping,
        offsets: { ...d.cell_mapping.offsets, [key]: Number(val) },
      },
    }));

  // ══════════════════════════════════════════════════
  //  レンダー：一覧ビュー
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
  //  リアルタイムExcelプレビュー（ミニスプレッドシート）
  // ══════════════════════════════════════════════════
  const renderMiniPreview = () => {
    const { commonFields, taskBlock, offsets } = draft.cell_mapping;
    const { startRow, blockSize } = taskBlock;

    // 共通情報フィールドごとの色定義
    const COMMON_COLORS = {
      date:        { bg: '#dbeafe', text: '#1e40af', shortLabel: '報告日' },
      department:  { bg: '#ede9fe', text: '#5b21b6', shortLabel: '案件名' },
      submitter:   { bg: '#d1fae5', text: '#065f46', shortLabel: '氏名' },
      time:        { bg: '#fef3c7', text: '#92400e', shortLabel: '対応時間' },
      progress:    { bg: '#fee2e2', text: '#991b1b', shortLabel: '進捗' },
      delayReason: { bg: '#f1f5f9', text: '#374151', shortLabel: '遅延理由' },
    };

    // タスクブロックごとの色定義（最大3ブロック表示）
    const TASK_COLORS = [
      { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
      { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
    ];

    // オフセットキー → 短縮ラベルのマップ
    const offsetShortLabel = {
      header:        'ヘッダー',
      target_place:  '担当場所',
      task_detail:   '作業内容',
      symptom:       '症状',
      action_taken:  '対応内容',
      has_problem:   '問題有無',
      findings_hdr:  '報告内容H',
      findings_body: '報告本文',
      photos_hdr:    '写真H',
      photo_pair_0:  '写真①',
      photo_pair_1:  '写真②',
    };

    // 各行のコンテンツマップを構築（rowNum → セル情報）
    const rowContent = {};

    // 共通情報行を登録
    Object.entries(commonFields).forEach(([key, rowNum]) => {
      if (COMMON_COLORS[key]) {
        rowContent[rowNum] = { type: 'common', key, ...COMMON_COLORS[key] };
      }
    });

    // タスクブロック2つ分を登録
    for (let b = 0; b < 2; b++) {
      const blockStart = startRow + b * blockSize;
      for (let r = blockStart; r < blockStart + blockSize; r++) {
        const relRow = r - blockStart;
        const matchedKey = Object.entries(offsets).find(([, v]) => v === relRow)?.[0];
        rowContent[r] = {
          type:       'task',
          blockIndex: b,
          label:      matchedKey ? offsetShortLabel[matchedKey] : null,
          ...TASK_COLORS[b],
        };
      }
    }

    // 表示する最大行番号
    const maxRow = startRow + blockSize * 2 - 1;

    return (
      <div className="ts-preview-pane">
        <div className="ts-preview-pane-title">リアルタイムプレビュー</div>
        <p className="ts-preview-pane-desc">行番号の変更が即座に反映されます</p>

        {/* 凡例 */}
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

        {/* ミニグリッド */}
        <div className="ts-mini-grid">
          {/* グリッドヘッダー */}
          <div className="ts-grid-header">
            <span className="ts-grid-rownum">#</span>
            <span className="ts-grid-col-a">A</span>
            <span className="ts-grid-col-bf">B〜F</span>
          </div>

          {/* グリッド本体（行1 〜 maxRow） */}
          <div className="ts-grid-body">
            {Array.from({ length: maxRow }, (_, i) => i + 1).map(r => {
              const cell = rowContent[r];
              const rowBg = cell ? cell.bg : undefined;
              const isBorderRow = cell?.type === 'task' &&
                (r === startRow || r === startRow + blockSize);

              return (
                <div
                  key={r}
                  className={`ts-grid-row${cell ? ` ts-grid-row--${cell.type}` : ''}${isBorderRow ? ' ts-grid-row--block-start' : ''}`}
                  style={rowBg ? { backgroundColor: rowBg } : {}}
                >
                  <span className="ts-grid-rownum">{r}</span>
                  <span className="ts-grid-col-a">
                    {cell?.type === 'common' && (
                      <span
                        className="ts-cell-badge"
                        style={{ background: cell.bg, color: cell.text, borderColor: cell.text + '50' }}
                      >
                        {cell.shortLabel}
                      </span>
                    )}
                    {cell?.type === 'task' && cell.label && (
                      <span
                        className="ts-cell-badge ts-cell-badge--task"
                        style={{ background: cell.bg, color: cell.text, borderColor: cell.border }}
                      >
                        {cell.label}
                      </span>
                    )}
                    {cell?.type === 'task' && !cell.label && (
                      <span className="ts-cell-task-spacer"
                            style={{ color: cell.text + '80' }}>
                        ─
                      </span>
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
  //  レンダー：編集ビュー
  // ══════════════════════════════════════════════════
  const renderEdit = () => (
    <div className="ts-edit-view">
      {/* 戻るボタン */}
      <button className="ts-btn-back" onClick={() => setView('list')}>
        <ChevronLeft size={15} /> 一覧に戻る
      </button>

      {/* 2カラムレイアウト：左=フォーム、右=プレビュー */}
      <div className="ts-edit-layout">
        {/* ── 左カラム：編集フォーム ── */}
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

          {/* ── セクション1：共通情報の行番号 ────────── */}
          <div className="ts-section">
            <h4 className="ts-section-heading">共通情報 — 書き込み行番号</h4>
            <p className="ts-section-desc">
              各フィールドをExcelの何行目に書き込むかを指定します。<br />
              ラベル列は常に A 列、値列は B〜F 列（結合）に出力されます。
            </p>
            <table className="ts-mapping-table">
              <thead>
                <tr>
                  <th>フィールド</th>
                  <th>行番号</th>
                  <th>セル（ラベル）</th>
                </tr>
              </thead>
              <tbody>
                {COMMON_FIELD_DEFS.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="ts-field-label">{label}</td>
                    <td>
                      <input
                        type="number"
                        className="ts-cell-input"
                        min={1}
                        max={100}
                        value={draft.cell_mapping.commonFields[key] ?? ''}
                        onChange={e => setCommonRow(key, e.target.value)}
                      />
                    </td>
                    <td className="ts-preview-cell">
                      A{draft.cell_mapping.commonFields[key] ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── セクション2：タスクブロック設定 ────────── */}
          <div className="ts-section">
            <h4 className="ts-section-heading">タスクブロック設定</h4>
            <p className="ts-section-desc">
              作業タスクの書き込み開始行と、1タスクあたりの行数を指定します。<br />
              タスクn の先頭行 = 開始行 + (n − 1) × ブロックサイズ
            </p>
            <div className="ts-block-inputs">
              <div className="ts-field-group ts-inline">
                <label className="ts-label">タスク1 開始行</label>
                <input
                  type="number"
                  className="ts-cell-input"
                  min={1}
                  max={200}
                  value={draft.cell_mapping.taskBlock.startRow}
                  onChange={e => setTaskBlock('startRow', e.target.value)}
                />
              </div>
              <div className="ts-field-group ts-inline">
                <label className="ts-label">1タスクのブロックサイズ（行数）</label>
                <input
                  type="number"
                  className="ts-cell-input"
                  min={5}
                  max={100}
                  value={draft.cell_mapping.taskBlock.blockSize}
                  onChange={e => setTaskBlock('blockSize', e.target.value)}
                />
              </div>
            </div>
            {/* ブロック配置プレビュー */}
            <div className="ts-block-preview">
              {[0, 1, 2].map(n => {
                const start = draft.cell_mapping.taskBlock.startRow +
                              n * draft.cell_mapping.taskBlock.blockSize;
                const end   = start + draft.cell_mapping.taskBlock.blockSize - 1;
                return (
                  <div key={n} className="ts-block-chip">
                    作業{n + 1}：{start}〜{end}行目
                  </div>
                );
              })}
              <span className="ts-block-chip muted">…</span>
            </div>
          </div>

          {/* ── セクション3：タスク内オフセット ─────────── */}
          <div className="ts-section">
            <h4 className="ts-section-heading">タスク内フィールドオフセット</h4>
            <p className="ts-section-desc">
              各フィールドをタスク先頭行から何行目（0始まり）に書くかを指定します。<br />
              実際の行 = タスク先頭行 + オフセット
            </p>
            <table className="ts-mapping-table">
              <thead>
                <tr>
                  <th>フィールド</th>
                  <th>オフセット</th>
                  <th>タスク1での実際の行</th>
                </tr>
              </thead>
              <tbody>
                {OFFSET_FIELD_DEFS.map(({ key, label }) => {
                  const actual = draft.cell_mapping.taskBlock.startRow +
                                 (draft.cell_mapping.offsets[key] ?? 0);
                  return (
                    <tr key={key}>
                      <td className="ts-field-label">{label}</td>
                      <td>
                        <input
                          type="number"
                          className="ts-cell-input"
                          min={0}
                          max={draft.cell_mapping.taskBlock.blockSize - 1}
                          value={draft.cell_mapping.offsets[key] ?? ''}
                          onChange={e => setOffset(key, e.target.value)}
                        />
                      </td>
                      <td className="ts-preview-cell">{actual}行目</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 保存ボタン */}
          <div className="ts-edit-footer">
            <button className="ts-btn-cancel" onClick={() => setView('list')} disabled={isSaving}>
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

  // ══════════════════════════════════════════════════
  //  メインレンダー
  // ══════════════════════════════════════════════════
  return (
    <div className="ts-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`ts-modal${view === 'edit' ? ' ts-modal--wide' : ''}`}>
        {/* モーダルヘッダー */}
        <div className="ts-modal-header">
          <h2 className="ts-modal-title">Excelテンプレート設定</h2>
          <button className="ts-close-btn" onClick={onClose} title="閉じる">
            <X size={18} />
          </button>
        </div>

        {/* コンテンツ */}
        <div className="ts-modal-body">
          {view === 'list' ? renderList() : renderEdit()}
        </div>
      </div>
    </div>
  );
};

export default TemplateSettings;
