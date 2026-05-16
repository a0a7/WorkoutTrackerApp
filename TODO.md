# Workout Tracker - Project Tasks

- [x] Create original DB migration scripts (`migrate_csv.mjs`).
- [x] Fix empty/orphan workouts missing from History logic (`src/lib/db.ts`).
- [ ] Fix `each_key_duplicate` Svelte error for History page
- [x] Push the migrated 402 `workouts` to remote D1.

- [ ] Push the 6000+ migrated `sets` up to remote D1. 
  - *Next step: Generate `push_sets.sql` using a JS file instead of a CLI command to avoid PowerShell escaping issues.*

- [ ] Implement Strava Sync (Import/Export).
here's the strava application info, make it so that every new workout is pushed to strava if the user connects their strava account. It should be smartly pushed whenever the workout is over (like an hour after the last set). The name should be Weightlifting, with this description style:
Sets: 
Hack Squat, 6x245
Hack Squat, 5x245
Leg Press, 3x8,245

 client id: 98135 client secret: e68774c5e3710da6669e94e8ab10a642399272ba refresh token: 7025877b7ffbe72833107ac0b381e5b227510909
 
 - [ ] Replace the current muscle map with the svg from https://github.com/a0a7/MuscleMapAssetPack/tree/main, which i put in Muslc

I want you to make some UI quick ui changes. Do these quite fast, without running too many unncessary checks so you don't expend all your tokens. First of all, the set adding ui should have visual padding to the left and right, BUT the bounding boxes should remain the way they are (extending all the way to the end of the page). Then, I want you to reorganize the workout page. There shouldn't be as many separate cards--right now, the basic info, muscle map, and each set has its own card. All of those things should be on one card. On mobile, the muscle map should be placed above the basic info for the workout. On desktop, the page should have a 2-collumn layout, and the muscle map should be in the right collumn, with the basic info and the sets list in the left collumn. 

Then I also want you to make some changes to the history page. the card view mode is good the way it is, but the compact one should be much more compact. Each workout should only be 2 rows of text (no cards whatsoever). The top line says the date, time, and then it should have 2 pills for the first 2 unique excercises (or however many fit) and then another pill that says ... and x more
The bottom line should say x sets · xy minutes

Make the muscle map component hoverable (or on mobile, tappable). It should show the muscle name, how well it was hit, and what excercises hit it. 

I want you to add an edit button on the workout page that is for editing the whole workout. It should be to the left of the delete workout button, and it should make every set editable and allow adding new sets.

