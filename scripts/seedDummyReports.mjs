/**
 * seedDummyReports.mjs
 * departments テーブルに案件名ダミーデータを投入するスクリプト
 *
 * 実行方法:
 *   node scripts/seedDummyReports.mjs
 *
 * ※ RLS が有効な場合はサービスロールキーが必要です。
 *    SUPABASE_SERVICE_ROLE_KEY 環境変数にセットして実行してください。
 *    例: SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/seedDummyReports.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ghholnfmeaeubelwiuog.supabase.co';
// サービスロールキー優先、未指定なら Anon キーでフォールバック
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoaG9sbmZtZWFldWJlbHdpdW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjA3NzAsImV4cCI6MjA5MTI5Njc3MH0.Eo7IasoRHR4NqmQYbZG49jgStjtBelee_ny3UJAfp88';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 投入する案件名（3件）───────────────────────────────────
const NEW_DEPARTMENTS = [
  { name: '新宿ビル 定期清掃案件' },
  { name: '入間パーク 空調保守・点検' },
  { name: '〇〇タワー 巡回警備業務' },
];

(async () => {
  console.log('🌱 departments シード開始\n');

  // ── 既存データを全削除 ────────────────────────────────────
  const { error: delErr } = await supabase
    .from('departments')
    .delete()
    .not('id', 'is', null); // 全行を対象

  if (delErr) {
    console.warn('⚠️  既存データ削除失敗（RLS制限の可能性あり）:', delErr.message);
    console.warn('   → SUPABASE_SERVICE_ROLE_KEY を環境変数に設定してください\n');
  } else {
    console.log('✓ 既存データを削除しました');
  }

  // ── 新しい案件名を挿入 ────────────────────────────────────
  const { data, error: insErr } = await supabase
    .from('departments')
    .insert(NEW_DEPARTMENTS)
    .select();

  if (insErr) {
    console.error('✗ 挿入失敗:', insErr.message);
    process.exit(1);
  }

  console.log('✓ 案件名を登録しました:');
  data.forEach(d => console.log(`   - [${d.id}] ${d.name}`));
  console.log('\n✅ シード完了');
})();
