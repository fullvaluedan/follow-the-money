// One-shot: init + start embedded Postgres, create DB, keep running as child.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const dataDir = new URL('./data', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:');

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'ftm',
  password: 'ftm',
  port: 5433,
  persistent: true,
});

if (!existsSync(dataDir)) {
  await pg.initialise();
  console.error('initialized data dir');
}
await pg.start();
try {
  await pg.createDatabase('ftm');
  console.error('created database ftm');
} catch (e) {
  console.error('db ftm exists');
}
console.log('READY postgres://ftm:ftm@localhost:5433/ftm');
// keep alive
setInterval(() => {}, 1 << 30);
