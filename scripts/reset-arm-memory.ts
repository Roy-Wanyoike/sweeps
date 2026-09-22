import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const SHOW = 'cmucz824f0juun5f820ipkt0k';

const viewers = await db.viewer.findMany({ where: { showId: SHOW } });
const gone = await db.viewerMemory.deleteMany({
  where: { viewerId: { in: viewers.map((v) => v.id) } },
});
console.log(`deleted ${gone.count} memory rows for ${viewers.length} viewers`);
await db.$disconnect();
