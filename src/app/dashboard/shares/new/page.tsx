import { NewShareForm } from '@/components/dashboard/NewShareForm';
import { GlassPanel } from '@/components/ui/GlassPanel';

export default function NewSharePage() {
  return (
    <div className="animate-enter">
      <h1 className="font-display uppercase tracking-wide text-2xl text-np-cyan mb-6">New Share</h1>

      <GlassPanel className="p-4 sm:p-6 max-w-[640px]">
        <NewShareForm />
      </GlassPanel>
    </div>
  );
}
