import BrandLogo from '../branding/BrandLogo';

export default function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center gap-5">
      <BrandLogo size="w-16 h-16" iconSize={30} rounded="rounded-2xl" />
      <div className="w-9 h-9 rounded-full border-[3px] border-forest-200 border-t-forest-600 animate-spin" />
      <p className="text-sm text-charcoal/70">Rimbun FreshGo</p>
    </div>
  );
}