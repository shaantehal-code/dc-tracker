import { getDb, getAllSites } from '@/lib/db';
import Dashboard from '@/components/Dashboard';

export const dynamic = 'force-dynamic';

export default function Home() {
  const db = getDb();
  const sites = getAllSites(db);
  return <Dashboard initialSites={sites} />;
}
