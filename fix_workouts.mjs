const fs = require('fs');
const { execSync } = require('child_process');

// 1. Read mapped workouts
const content = fs.readFileSync('old_data/mapped_workouts.csv', 'utf8');
const lines = content.split('\n');

// 2. Prepare SQL statements mapping the new users
let sql = '';
for(let i=1; i < lines.length; i++) {
  if(!lines[i].trim()) continue;
  const parts = lines[i].split(',');
  const id = parts[0];
  const startTime = parts[2];
  const endTime = parts[3];
  let notes = parts[4] || null;
  const created = parts[9];
  sql += \INSERT INTO workouts (id, user_id, start_time, end_time, synced, created_at, updated_at) VALUES ('\', '7a03dfd2-5600-49c1-9d64-88269fdce26c', \, \, 1, \, \);\n\;
}

// 3. Write SQL to file
fs.writeFileSync('push_workouts.sql', sql);

console.log('Use: npx wrangler d1 execute workout-tracker-db --remote --file=push_workouts.sql');
