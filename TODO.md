# TODO:
- Keep track of if work is currently being logged? When calling logActivity out of the blue, we don't want things to break! Consider the option of only letting people use logActivity. This may prevent countless logs in the calendar feed.
- New option: projectName. Log on the same calendar in multiple projects, but with a different project name.
- Add examples.
- Option to throttle logActivity per x minutes and combine changes (you can throttle in browserSync, but that wouldn't be a very elegant solution).

# IDEA:
- CSV exports.
- Offline mode (store activity and post when online).
- Automatically sync all made commits made by the current Git user as events in calendar.