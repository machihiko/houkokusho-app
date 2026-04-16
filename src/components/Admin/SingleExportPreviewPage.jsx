import { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Camera, CheckSquare } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { generateA4Excel, buildA4DefaultFileName, getTaskField } from '../../utils/generateA4Excel';
import { supabase } from '../../utils/supabaseClient';
import {
  DEFAULT_CELL_MAPPING,
  MOCK_TEMPLATES,
  normalizeTemplateMapping,
} from '../../utils/templateMapping';
import './SingleExportPreviewPage.css';

// ── ジャンル表示名 ─────────────────────────────────────────
const GENRE_LABELS = {
  cleaning: '清掃', inspection: '点検', repair: '修理',
  patrol: '巡回', emergency: '緊急対応',
};

// ── タスクフィールド定義（設定パネルのチェックボックス対象）──
const FIELD_DEFS = [
  { key: 'target_place', label: '担当場所' },
  { key: 'task_detail',  label: '作業内容' },
  { key: 'symptom',      label: '症状'     },
  { key: 'action_taken', label: '対応内容' },
  { key: 'has_problem',  label: '問題の有無' },
  { key: 'findings',     label: '報告内容'  },
];

// ── 共通情報フィールド定義 ─────────────────────────────────
const COMMON_INFO_DEFS = [
  { key: 'date',       label: '報告日' },
  { key: 'department', label: '所属' },
  { key: 'submitter',  label: '氏名' },
  { key: 'time',       label: '対応時間' },
  { key: 'progress',   label: '全体の進捗' },
];

// ════════════════════════════════════════════════════════════
//   コンポーネント
// ════════════════════════════════════════════════════════════
const SingleExportPreviewPage = () => {
  const { user }  = useAuth();
  const { state } = useLocation();
  const navigate  = useNavigate();
  const rpt       = state?.rpt ?? null;

  const [fileName,      setFileName]      = useState(() => rpt ? buildA4DefaultFileName(rpt) : '');
  const [enabledFields, setEnabledFields] = useState({
    target_place: true,
    task_detail:  true,
    symptom:      true,
    action_taken: true,
    has_problem:  true,
    findings:     true,
  });
  const [commonFieldEnabled, setCommonFieldEnabled] = useState({
    date: true, department: true, submitter: true, time: true, progress: true,
  });
  const [enabledTaskIndices, setEnabledTaskIndices] = useState(
    () => new Set((rpt?.tasks ?? []).map((_, i) => i))
  );
  const [incPhotos, setIncPhotos] = useState(true);
  // enabledPhotoMap: { [taskIdx]: Set<photoIdx> } — デフォルトで先頭4枚を選択
  const [enabledPhotoMap, setEnabledPhotoMap] = useState(() => {
    const map = {};
    (rpt?.tasks ?? []).forEach((task, tIdx) => {
      const validPhotos = (task.photos ?? []).filter(p => p.photo_url);
      map[tIdx] = new Set(validPhotos.slice(0, 4).map((_, i) => i));
    });
    return map;
  });
  const [isExporting,        setIsExporting]        = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  // DBから取得したテンプレート一覧（取得失敗時はMOCK_TEMPLATESにフォールバック）
  const [templates,          setTemplates]          = useState(MOCK_TEMPLATES);

  // ── マウント時にSupabaseからテンプレート一覧を取得 ──
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    supabase
      .from('report_templates')
      .select('id, template_name, cell_mapping')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data?.length > 0) {
          setTemplates(data.map((tpl) => ({
            ...tpl,
            cell_mapping: normalizeTemplateMapping(tpl.cell_mapping),
          })));
          setSelectedTemplateId(prev => prev || data[0].id);
        } else {
          // フォールバック: モックデータを使用
          setTemplates(MOCK_TEMPLATES);
          setSelectedTemplateId(MOCK_TEMPLATES[0].id);
        }
      });
  }, []);

  // ── 認証ガード（フック呼び出しの後に配置）────────────────
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />;

  // ── データなし（直接URLアクセスなど）────────────────────
  if (!rpt) {
    return (
      <div className="sep-no-data">
        <p>出力対象データがありません。</p>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> 戻る
        </button>
      </div>
    );
  }

  // ── プレビュー用：タスクごとに表示データを組み立て ────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const previewTasks = useMemo(() => {
    return (rpt.tasks ?? []).map((task, tIdx) => {
      // 有効なフィールドのみ抽出（行詰めと同じ条件）
      const visibleFields = FIELD_DEFS.filter(fd => {
        if (!enabledFields[fd.key]) return false;
        if (fd.key === 'has_problem') return task.genre !== 'emergency';
        if (fd.key === 'findings')    return !!task.findings;
        return !!getTaskField(task, fd.key);
      });

      // 全有効写真 + 選択状態（incPhotos がOFFのときは空）
      const allPhotos = incPhotos
        ? (task.photos ?? []).filter(p => p.photo_url)
        : [];
      const selectedPhotoIndices = enabledPhotoMap[tIdx] ?? new Set();

      const isEnabled = enabledTaskIndices.has(tIdx);

      return { task, visibleFields, allPhotos, selectedPhotoIndices, isEnabled };
    });
  }, [rpt.tasks, enabledFields, incPhotos, enabledTaskIndices, enabledPhotoMap]);

  // 出力に何かデータがあるか（有効タスクのみカウント）
  const hasAnyOutput = previewTasks.some(t =>
    t.isEnabled && (t.visibleFields.length > 0 || t.selectedPhotoIndices.size > 0)
  );

  // ── フィールドトグル ──────────────────────────────────────
  const toggleField = (key) =>
    setEnabledFields(prev => ({ ...prev, [key]: !prev[key] }));

  // ── 共通情報トグル ────────────────────────────────────────
  const toggleCommonField = (key) =>
    setCommonFieldEnabled(prev => ({ ...prev, [key]: !prev[key] }));

  // ── タスク選択トグル ──────────────────────────────────────
  const toggleTask = (idx) => setEnabledTaskIndices(prev => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });

  // ── 写真個別トグル ────────────────────────────────────────
  const togglePhoto = (taskIdx, photoIdx) => {
    setEnabledPhotoMap(prev => {
      const taskSet = new Set(prev[taskIdx] ?? []);
      if (taskSet.has(photoIdx)) {
        taskSet.delete(photoIdx);
      } else {
        taskSet.add(photoIdx);
      }
      return { ...prev, [taskIdx]: taskSet };
    });
  };

  // ── タスクラベル生成 ──────────────────────────────────────
  const getTaskLabel = (task, idx) => {
    const gLabel  = GENRE_LABELS[task.genre] ?? task.genre ?? '不明';
    const detail  = getTaskField(task, 'task_detail') || getTaskField(task, 'target_place') || '';
    const snippet = detail.length > 10 ? detail.slice(0, 10) + '…' : detail;
    return `作業${idx + 1}（${gLabel}${snippet ? '・' + snippet : ''}）`;
  };

  // ── ダウンロード実行 ──────────────────────────────────────
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // 有効タスクのみ抽出し、各タスクの写真を選択済みのものに差し替え
      const filteredTasks = (rpt.tasks ?? [])
        .map((task, i) => {
          const validPhotos      = (task.photos ?? []).filter(p => p.photo_url);
          const selectedPhotoSet = enabledPhotoMap[i] ?? new Set();
          const filteredPhotos   = validPhotos.filter((_, pIdx) => selectedPhotoSet.has(pIdx));
          return { ...task, photos: filteredPhotos };
        })
        .filter((_, i) => enabledTaskIndices.has(i));

      // 選択中テンプレートの cell_mapping を取得
      const activeTemplate = templates.find(t => t.id === selectedTemplateId)
        ?? templates[0]
        ?? { cell_mapping: DEFAULT_CELL_MAPPING };

      await generateA4Excel(rpt, {
        fileName,
        enabledFields,
        incPhotos,
        commonFieldEnabled,
        enabledTasks:   filteredTasks,
        templateConfig: normalizeTemplateMapping(activeTemplate.cell_mapping),
      });
    } catch (e) {
      console.error('[A4 Excel] 出力失敗:', e);
      alert(`出力に失敗しました。\n${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // ── 問題の有無のテキストを返す ─────────────────────────────
  const getProblemText = (task) => {
    const isIP = ['inspection', 'patrol'].includes(task.genre);
    return task.has_problem
      ? (isIP ? '異常あり' : '問題あり')
      : (isIP ? '異常無し' : '問題無し');
  };

  // ── フィールドの表示値を返す（has_problem は特殊）──────────
  const getDisplayValue = (task, fd) => {
    if (fd.key === 'has_problem') return getProblemText(task);
    if (fd.key === 'findings')    return task.findings ?? '';
    return getTaskField(task, fd.key);
  };

  // ── JSX ──────────────────────────────────────────────────
  return (
    <div className="sep-root">

      {/* ── 上部ヘッダー ── */}
      <header className="sep-header glass-panel">
        <button className="btn btn-outline sep-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> 戻る
        </button>
        <div className="sep-header-info">
          <FileSpreadsheet size={20} />
          <div>
            <h2>個別出力（A4）設定・プレビュー</h2>
            <p>
              {rpt.date}　{rpt.department}
              {rpt.submitter ? `　${rpt.submitter}` : ''}
              　作業{rpt.tasks?.length ?? 0}件
            </p>
          </div>
        </div>
        <button
          className="btn btn-primary sep-download-btn"
          onClick={handleExport}
          disabled={isExporting || !hasAnyOutput}
        >
          <Download size={16} />
          {isExporting ? '出力中...' : 'ダウンロード実行'}
        </button>
      </header>

      {/* ── メインボディ（2ペイン）── */}
      <div className="sep-body">

        {/* ①【設定ペイン】左 */}
        <aside className="sep-sidebar glass-panel">

          {/* テンプレート選択 */}
          <div className="sep-section">
            <p className="sep-section-label">Excelフォーマット</p>
            <select
              className="sep-input"
              value={selectedTemplateId}
              onChange={e => setSelectedTemplateId(e.target.value)}
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.template_name}</option>
              ))}
            </select>
            <p className="sep-template-hint">
              セルマッピングは「Excelテンプレート設定」で変更できます
            </p>
          </div>

          {/* ファイル名 */}
          <div className="sep-section">
            <p className="sep-section-label">ファイル名</p>
            <div className="sep-filename-row">
              <input
                type="text"
                className="sep-input"
                value={fileName}
                onChange={e => setFileName(e.target.value)}
                placeholder="ファイル名を入力..."
                data-gramm="false"
                autoComplete="off"
              />
              <span className="sep-ext">.xlsx</span>
            </div>
          </div>

          {/* 共通情報 ON/OFF */}
          <div className="sep-section">
            <p className="sep-section-label">共通情報</p>
            <div className="sep-field-list">
              {COMMON_INFO_DEFS.map(fd => (
                <label key={fd.key} className="sep-field-item">
                  <input
                    type="checkbox"
                    checked={!!commonFieldEnabled[fd.key]}
                    onChange={() => toggleCommonField(fd.key)}
                  />
                  <span>{fd.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 出力項目 ON/OFF */}
          <div className="sep-section">
            <p className="sep-section-label">出力する項目</p>
            <div className="sep-field-list">
              {FIELD_DEFS.map(fd => (
                <label key={fd.key} className="sep-field-item">
                  <input
                    type="checkbox"
                    checked={!!enabledFields[fd.key]}
                    onChange={() => toggleField(fd.key)}
                  />
                  <span>{fd.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 写真設定 */}
          <div className="sep-section">
            <p className="sep-section-label">添付写真</p>
            <label className="sep-toggle-item sep-photos-toggle">
              <input
                type="checkbox"
                checked={incPhotos}
                onChange={e => setIncPhotos(e.target.checked)}
              />
              <span>写真を含める</span>
            </label>
            {incPhotos && (
              <p className="sep-photos-hint">
                右プレビューから出力する写真を選択できます
                <br />
                <small>（最大4枚までA4一枚に収まります）</small>
              </p>
            )}
          </div>

          {/* 出力する作業 */}
          <div className="sep-section sep-section-tasks">
            <p className="sep-section-label">出力する作業</p>
            <div className="sep-field-list">
              {(rpt.tasks ?? []).map((task, idx) => (
                <label key={task.id ?? idx} className="sep-field-item">
                  <input
                    type="checkbox"
                    checked={enabledTaskIndices.has(idx)}
                    onChange={() => toggleTask(idx)}
                  />
                  <span className="sep-task-label-text">{getTaskLabel(task, idx)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 出力サマリー */}
          <div className="sep-output-summary">
            <CheckSquare size={13} />
            <span>
              共通{Object.values(commonFieldEnabled).filter(Boolean).length}項目・
              作業項目{Object.values(enabledFields).filter(Boolean).length}個・
              {enabledTaskIndices.size}作業
              {incPhotos ? '・写真あり' : '・写真なし'}
            </span>
          </div>

        </aside>

        {/* ②【データプレビューペイン】右 */}
        <main className="sep-preview">
          <div className="sep-preview-topbar">
            <span className="sep-preview-label">
              データプレビュー — {previewTasks.length} タスク中 {enabledTaskIndices.size} 件出力
            </span>
            <span className="sep-preview-note">
              ※ 実際の A4 Excel レイアウトとは異なります（出力内容の確認用）
            </span>
          </div>

          <div className="sep-preview-scroll">
            {!hasAnyOutput ? (
              <div className="sep-preview-empty">
                出力する項目または作業をONにしてください
              </div>
            ) : (
              <div className="sep-task-list">
                {previewTasks.map(({ task, visibleFields, allPhotos, selectedPhotoIndices, isEnabled }, tIdx) => {
                  const gLabel  = GENRE_LABELS[task.genre] ?? task.genre;
                  const isEmpty = visibleFields.length === 0 && selectedPhotoIndices.size === 0;
                  return (
                    <div
                      key={task.id ?? tIdx}
                      className={`sep-task-card${isEmpty ? ' sep-task-empty' : ''}${!isEnabled ? ' sep-task-disabled' : ''}`}
                    >
                      {/* タスクヘッダー */}
                      <div className={`sep-task-header sep-task-header-${task.genre}`}>
                        <span className="sep-task-num">作業 {tIdx + 1}</span>
                        <span className="sep-task-genre">{gLabel}</span>
                        {!isEnabled && (
                          <span className="sep-task-skip-badge">出力スキップ</span>
                        )}
                        {isEnabled && isEmpty && (
                          <span className="sep-task-skip-badge">出力なし（全OFFまたは値なし）</span>
                        )}
                      </div>

                      {/* フィールド一覧（有効タスクのみ表示） */}
                      {isEnabled && visibleFields.length > 0 && (
                        <div className="sep-task-fields">
                          {visibleFields.map(fd => {
                            const val     = getDisplayValue(task, fd);
                            const isLong  = fd.key === 'findings';
                            const isAlert = fd.key === 'has_problem' && task.has_problem;
                            return (
                              <div key={fd.key} className="sep-field-row">
                                <span className="sep-field-label">{fd.label}</span>
                                <span className={`sep-field-value${isAlert ? ' alert' : ''}${isLong ? ' long' : ''}`}>
                                  {val}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* 写真選択グリッド（有効タスクのみ表示） */}
                      {isEnabled && allPhotos.length > 0 && (
                        <div className="sep-task-photos">
                          <p className="sep-photos-header">
                            <Camera size={12} />
                            写真を選択（{allPhotos.length}枚中 {selectedPhotoIndices.size}枚を出力）
                            {selectedPhotoIndices.size > 4 && (
                              <span className="sep-photos-warn">　※先頭4枚のみ出力</span>
                            )}
                          </p>
                          <div className="sep-photos-grid">
                            {allPhotos.map((p, pIdx) => {
                              const isSelected = selectedPhotoIndices.has(pIdx);
                              return (
                                <label
                                  key={pIdx}
                                  className={`sep-photo-thumb${isSelected ? ' selected' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    className="sep-photo-check"
                                    checked={isSelected}
                                    onChange={() => togglePhoto(tIdx, pIdx)}
                                  />
                                  <img
                                    src={p.photo_url}
                                    alt={`写真${pIdx + 1}`}
                                    loading="lazy"
                                  />
                                  <span className="sep-photo-num">{pIdx + 1}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

      </div>{/* /sep-body */}
    </div>
  );
};

export default SingleExportPreviewPage;
