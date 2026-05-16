const fs = require('fs');
const { execSync } = require('child_process');

const content = fs.readFileSync('old_data/mapped_workouts.csv', 'utf8');
const lines = content.split(/\r?\n/);

let sql = '';
for(let i=1; i < lines.length; i++) {
  if(!lines[i].trim()) continue;
  const parts = lines[i].split(',');
  const id = parts[0];
  const startTime = parts[2] || 0;
  const endTime = parts[3] || 0;
  const created = parts[9] || Date.now();
  sql += 'INSERT OR IGNORE INTO workouts (id, user_id, start_time, end_time, synced, created_at, updated_at) VALUES (\'' + id + '\', \'7a03dfd2-5600-49c1-9d64-88269fdce26c\', ' + startTime + ', ' + endTime + ', 1, ' + created + ', ' + created + ');\n';
}

fs.writeFileSync('push_workouts.sql', sql);
console.log('Run: npx wrangler d1 execute workout-tracker-db --remote --file=push_workouts.sql');
