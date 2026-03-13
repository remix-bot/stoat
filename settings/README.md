# Settings Database Migration

Previously, Remix used an awfully temporal solution to store server settings (a JSON file).
Since that is incredibly bad in a number of ways, we have migrated to a MySQL database.

If you want to migrate the old data from the JSON file, to the new database, all you have to do is
run `node ./settings/migrate.js` from the root directory. The script will automatically
transfer any server data.
