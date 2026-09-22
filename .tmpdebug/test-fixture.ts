import { compileFixture } from '../src/lib/pipeline/runner';
(async () => {
  const rep = await compileFixture();
  if (!rep) { console.log('FIXTURE FAILED TO LOAD'); return; }
  console.log('fixture status:', rep.status);
  console.log('violations:', rep.violations.map(v => `${v.rule}@${v.beatIndex}:${v.severity}`).join(' '));
})();
