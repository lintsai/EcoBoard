/**
 * 測試休假成員標記功能
 * 
 * 此腳本用於測試每日總結中的休假成員識別功能
 */

import { query } from '../src/server/database/pool';

interface Member {
  id: number;
  username: string;
  display_name: string | null;
}

async function testLeaveTracking(teamId: number, summaryDate: string) {
  console.log('='.repeat(60));
  console.log(`測試日期: ${summaryDate}`);
  console.log(`團隊 ID: ${teamId}`);
  console.log('='.repeat(60));
  console.log();

  try {
    // 1. 獲取所有團隊成員
    console.log('📋 獲取所有團隊成員...');
    const allMembers = await query(
      `SELECT u.id, u.username, u.display_name
       FROM team_members tm
       INNER JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY u.display_name`,
      [teamId]
    );

    console.log(`   團隊總人數: ${allMembers.rows.length}`);
    allMembers.rows.forEach((m: Member) => {
      console.log(`   - ${m.display_name || m.username} (ID: ${m.id})`);
    });
    console.log();

    // 2. 獲取當日已打卡成員
    console.log('✅ 獲取當日已打卡成員...');
    const checkedInMembers = await query(
      `SELECT DISTINCT u.id, u.username, u.display_name, c.checkin_time
       FROM checkins c
       INNER JOIN users u ON c.user_id = u.id
       WHERE c.team_id = $1 AND c.checkin_date = $2
       ORDER BY u.display_name`,
      [teamId, summaryDate]
    );

    console.log(`   出勤人數: ${checkedInMembers.rows.length}`);
    checkedInMembers.rows.forEach((m: any) => {
      console.log(`   - ${m.display_name || m.username} (打卡時間: ${new Date(m.checkin_time).toLocaleString('zh-TW')})`);
    });
    console.log();

    // 3. 計算未打卡成員（休假）
    console.log('🏖️  計算未打卡成員（休假）...');
    const checkedInIds = new Set(checkedInMembers.rows.map((m: Member) => m.id));
    const absentMembers = allMembers.rows.filter((m: Member) => !checkedInIds.has(m.id));
    
    const totalMembers = allMembers.rows.length;
    const absentCount = absentMembers.length;
    const attendanceRate = totalMembers > 0 
      ? ((checkedInMembers.rows.length / totalMembers) * 100).toFixed(1)
      : '0.0';

    console.log(`   休假人數: ${absentCount}`);
    if (absentCount > 0) {
      absentMembers.forEach((m: Member) => {
        console.log(`   - ${m.display_name || m.username} (未打卡，標記為休假)`);
      });
    } else {
      console.log('   全員出勤 ✅');
    }
    console.log();

    // 4. 統計摘要
    console.log('📊 統計摘要');
    console.log('─'.repeat(60));
    console.log(`   團隊總人數: ${totalMembers}`);
    console.log(`   出勤人數:   ${checkedInMembers.rows.length}`);
    console.log(`   休假人數:   ${absentCount}`);
    console.log(`   出勤率:     ${attendanceRate}%`);
    console.log('─'.repeat(60));
    console.log();

    // 5. 獲取當日工作統計
    console.log('💼 當日工作統計...');
    const workStats = await query(
      `SELECT COUNT(DISTINCT c.user_id) as checkin_count,
              COUNT(DISTINCT wi.id) as total_work_items,
              COUNT(DISTINCT wu.id) as total_updates
       FROM checkins c
       LEFT JOIN work_items wi ON wi.checkin_id = c.id
       LEFT JOIN work_updates wu ON wu.work_item_id = wi.id
       WHERE c.team_id = $1 AND c.checkin_date = $2`,
      [teamId, summaryDate]
    );

    const stats = workStats.rows[0];
    console.log(`   工作項目總數: ${stats.total_work_items}`);
    console.log(`   更新記錄數:   ${stats.total_updates}`);
    console.log();

    console.log('✅ 測試完成！');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 測試失敗:', error);
    throw error;
  }
}

// 主函數
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('使用方式: ts-node scripts/test-leave-tracking.ts <teamId> [date]');
    console.log('範例: ts-node scripts/test-leave-tracking.ts 1 2025-11-13');
    console.log('      ts-node scripts/test-leave-tracking.ts 1');
    process.exit(1);
  }

  const teamId = parseInt(args[0]);
  const summaryDate = args[1] || new Date().toISOString().split('T')[0];

  await testLeaveTracking(teamId, summaryDate);
  process.exit(0);
}

main().catch((error) => {
  console.error('執行錯誤:', error);
  process.exit(1);
});
