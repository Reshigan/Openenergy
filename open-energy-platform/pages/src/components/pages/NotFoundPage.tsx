import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4 text-center">
      <div className="rounded-2xl bg-[#eef3f8] p-8">
        <p className="text-6xl font-display font-bold text-[#1a3a5c]">404</p>
      </div>
      <div>
        <h1 className="text-xl font-display font-semibold text-[#0f1c2e]">Page not found</h1>
        <p className="mt-1 text-[13px] text-[#6b7685]">
          The page you are looking for does not exist or has been moved.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#dde4ec] bg-white px-4 py-2 text-[13px] font-medium text-[#0f1c2e] hover:bg-[#eef3f8]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Go back
        </button>
        <button
          type="button"
          onClick={() => navigate('/launch')}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#c2873a] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#a3702f]"
        >
          <Home className="h-4 w-4" aria-hidden />
          Home
        </button>
      </div>
    </div>
  );
}
