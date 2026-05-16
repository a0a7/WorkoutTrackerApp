const fs = require('fs');

const content = fs.readFileSync('old_data/mapped_sets.csv', 'utf8');
const lines = content.split(/\r?\n/);

let sql = '';
for(let i=1; i < lines.length; i++) {
  if(!lines[i].trim()) continue;
  const parts = lines[i].split(',');
  const id = parts[0];
  const serverId = null;
  const userId = '7a03dfd2-5600-49c1-9d64-88269fdce26c';
  const workoutId = parts[3];
  const exId = parts[4];
  const exName = parts[5];
  const reps = parts[6] || 0;
  const weight = parts[7] || 0;
  const sort = parts[9] || 0;
  const created = parts[10] || Date.now();
  const deleted = parts[12] || 0;

  sql += 'UPDATE sets SET user_id=\'' + userId + '\' WHERE id=\'' + id + '\';\n';
}

fs.writeFileSync('push_sets.sql', sql);
console.log('Run: npx wrangler d1 execute workout-tracker-db --remote --file=push_sets.sql');
