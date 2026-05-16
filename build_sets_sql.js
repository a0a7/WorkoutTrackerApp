const fs = require('fs');

const lines = fs.readFileSync('old_data/mapped_sets.csv', 'utf8').split(/\r?\n/);
let sql = '';
for (let i = 1; i < lines.length; i++) {
  if (!lines[i] || !lines[i].trim()) continue;
  
  const p = lines[i].split(',');
  const id = p[0];
  const workoutId = p[3];
  const exId = p[4];
  const exName = p[5].replace(/'/g, "''"); // escape inner quotes for SQL
  const reps = p[6] || 0;
  let w = String(p[7] || 'null').replace(/["']/g, '');
  if (w === '') w = 'null';
  const sort = p[9] || 0;
  const created = p[10];
  const updated = p[11];
  const deleted = p[12] || 0;

  sql += `INSERT OR IGNORE INTO sets (id, server_id, user_id, local_workout_id, exercise_id, exercise_name, reps, weight, notes, sort_order, created_at, updated_at, deleted) ` +
         `VALUES ('${id}', null, '7a03dfd2-5600-49c1-9d64-88269fdce26c', '${workoutId}', '${exId}', '${exName}', ${reps}, ${w}, null, ${sort}, ${created}, ${updated}, ${deleted});\n`;
}

fs.writeFileSync('push_sets.sql', sql);
console.log('Successfully generated push_sets.sql. Ready to run!');
