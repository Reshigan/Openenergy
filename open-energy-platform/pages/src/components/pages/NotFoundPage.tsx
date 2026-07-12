import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

const TX1    = 'var(--ink, oklch(0.17 0.010 250))';
const TX3    = 'var(--ink-2, oklch(0.60 0.007 250))';
const BORDER = 'var(--border-subtle, oklch(0.87 0.006 250))';
const BG1    = 'var(--s1, oklch(0.99 0.002 80))';
const BG_DIM = 'var(--s2, oklch(0.93 0.005 250))';
const ACC    = 'var(--accent, oklch(0.46 0.16 55))';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="rounded-2xl p-8" style={{ background: BG_DIM }}>
        <p className="text-6xl font-display font-bold" style={{ color: ACC }}>404</p>
      </div>
      <div>
        <h1 className="text-xl font-display font-semibold" style={{ color: TX1 }}>Page not found</h1>
        <p className="mt-1 text-[13px]" style={{ color: TX3 }}>
          The page you are looking for does not exist or has been moved.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-[13px] font-medium"
          style={{ borderColor: BORDER, background: BG1, color: TX1 }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Go back
        </button>
        <button
          type="button"
          onClick={() => navigate('/launch')}
          className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: ACC }}
        >
          <Home className="h-4 w-4" aria-hidden />
          Home
        </button>
      </div>
    </div>
  );
}
