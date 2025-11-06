import { generateDailySummary } from '../src/server/services/ai.service';

(async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Generating daily summary for team 1, date', today);
    const result = await generateDailySummary(1, today, 1);
    console.log('Result:', result);
    process.exit(0);
  } catch (err) {
    console.error('Error running generateDailySummary:', err);
    process.exit(1);
  }
})();
