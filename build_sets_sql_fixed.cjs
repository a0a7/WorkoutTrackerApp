const fs = require('fs');
const lines = fs.readFileSync('old_data/mapped_sets.csv', 'utf8').split(/\r?\n/);
let sql = '';
const realUserId = '7a03dfd2-5600-49c1-9d64-88269fdce26c';

for (let i = 1; i < lines.length; i++) {
    if (!lines[i] || !lines[i].trim()) continue;
    
    const p = lines[i].split(',');
    
    // Safely parse out basic elements
    const id = p[0];
    const workoutId = p[3];
    const exId = p[4];
    
    let exName = p[5] || 'Unknown';
    exName = exName.replace(/'/g, "''"); // escape inner quotes for SQL
    
    let reps = parseInt(p[6], 10);
    if (isNaN(reps)) reps = 0;
    
    let rawWeight = String(p[7] || '').replace(/[\"']/g, '');
    let w = 'null';
    if (rawWeight) {
        let parsed = parseFloat(rawWeight);
        if (!isNaN(parsed)) w = parsed;
    }
    
    let sort = parseInt(p[9], 10);
    if (isNaN(sort)) sort = 0;
    
    // Fallbacks for dates in case of NaN
    let created = parseInt(p[10], 10);
    if (isNaN(created)) created = Date.now();
    
    let updated = parseInt(p[11], 10);
    if (isNaN(updated)) updated = Date.now();
    
    let deleted = parseInt(p[12], 10);
    if (isNaN(deleted)) deleted = 0;

    sql += `INSERT OR REPLACE INTO sets (id, server_id, user_id, local_workout_id, exercise_id, exercise_name, reps, weight, notes, sort_order, created_at, updated_at, deleted) VALUES ('${id}', null, '${realUserId}', '${workoutId}', '${exId}', '${exName}', ${reps}, ${w}, null, ${sort}, ${created}, ${updated}, ${deleted});\n`;
}

fs.writeFileSync('push_sets_fixed.sql', sql);
console.log('Successfully generated push_sets_fixed.sql without NaNs.');
