# TODO:
- Store file changes in calendar events descriptions.
- Change format into (_throttle per x minutes and combine changes_):
    ```
    [incomplete]
    15:49 this.strings.activityStarted
    15:52 this.strings.changesInFiles + filenames
    15:53 this.strings.changesInFiles + filenames
    15:54 this.strings.changesInFile + filename
    ```
    ```
    09:13 this.strings.activityStarted
    09:15 this.strings.changesInFile + filename
    09:18 this.strings.changesInFiles + filenames
    09:49 this.strings.activityConcluded
    ```

# IDEA:
- CSV exports
- Offline mode (store activity and post when online).
- Automatically sync all made commits made by the current Git user as events in calendar