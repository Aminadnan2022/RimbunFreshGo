import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, Check, PackageCheck, ShoppingBasket, Sparkles, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import LandingInstallActions from '../pwa/LandingInstallActions';

const FreshGoHero3D = lazy(() => import('./FreshGoHero3D'));

function useDesktop3D(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(desktop.matches && !reducedMotion.matches);
    update();
    desktop.addEventListener('change', update);
    reducedMotion.addEventListener('change', update);
    return () => {
      desktop.removeEventListener('change', update);
      reducedMotion.removeEventListener('change', update);
    };
  }, []);
  return enabled;
}

function RealAppPhone({ animated = false }: { animated?: boolean }) {
  return (
    <div className={`freshgo-real-phone${animated ? ' freshgo-real-phone-animated' : ''}`} aria-hidden="true">
      <span className="freshgo-real-speaker" />
      <img src="/freshgo-shop-mobile.png" alt="" />
    </div>
  );
}

function LightweightHeroVisual() {
  return (
    <div className="freshgo-hero-visual freshgo-lightweight-visual" aria-label="FreshGo mobile shopping experience">
      <div className="freshgo-orbit freshgo-orbit-one" />
      <div className="freshgo-orbit freshgo-orbit-two" />
      <RealAppPhone animated />
      <img className="freshgo-real-product freshgo-real-fish" src="https://jypujsyiecgcjtjrqjfx.supabase.co/storage/v1/object/public/product-images/fish/siakap.webp" alt="" />
      <img className="freshgo-real-product freshgo-real-prawn" src="https://jypujsyiecgcjtjrqjfx.supabase.co/storage/v1/object/public/product-images/category-images/prawns/prawns-raw.webp" alt="" />
      <img className="freshgo-real-product freshgo-real-chicken" src="https://jypujsyiecgcjtjrqjfx.supabase.co/storage/v1/object/public/product-images/chicken/ayam-segar-2.webp" alt="" />
      <div className="freshgo-float-label freshgo-label-market">Pasar Tani</div>
      <div className="freshgo-float-label freshgo-label-fresh">100% segar</div>
    </div>
  );
}

interface GuestLandingExperienceProps {
  badge: string;
  deliverySelector?: ReactNode;
  showShop: boolean;
  showCombos: boolean;
}

export default function GuestLandingExperience({ badge, deliverySelector, showShop, showCombos }: GuestLandingExperienceProps) {
  const { t } = useLanguage();
  const desktop3D = useDesktop3D();
  const steps = [
    { icon: ShoppingBasket, title: t('homepage.story.steps.choose.title'), desc: t('homepage.story.steps.choose.desc') },
    { icon: Sparkles, title: t('homepage.story.steps.prepare.title'), desc: t('homepage.story.steps.prepare.desc') },
    { icon: PackageCheck, title: t('homepage.story.steps.pack.title'), desc: t('homepage.story.steps.pack.desc') },
    { icon: Truck, title: t('homepage.story.steps.deliver.title'), desc: t('homepage.story.steps.deliver.desc') },
  ];

  return (
    <>
      <section className="freshgo-hero relative overflow-hidden">
        <div className="freshgo-hero-glow freshgo-hero-glow-left" />
        <div className="freshgo-hero-glow freshgo-hero-glow-right" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:min-h-[720px] lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-20">
          <div className="relative z-10 max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-forest-200/70 bg-white/75 px-3 py-1.5 text-xs font-semibold text-forest-700 shadow-soft backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-jade-500 shadow-[0_0_0_5px_rgba(34,197,100,0.12)]" />
              {badge}
            </span>
            <h1 className="mt-7 font-display text-5xl font-bold leading-[0.98] tracking-[-0.035em] text-forest-950 sm:text-6xl lg:text-7xl">
              {t('homepage.landingHero.title')}
              <span className="mt-2 block text-forest-600">{t('homepage.landingHero.titleHighlight')}</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-gray-600 sm:text-xl">
              {t('homepage.landingHero.description')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {showShop && (
                <Link to="/shop" className="btn-primary inline-flex items-center gap-2 px-7 py-3.5">
                  {t('homepage.landingHero.shop')} <ArrowRight size={17} />
                </Link>
              )}
              <a href="#cara-freshgo" className="btn-secondary inline-flex items-center gap-2 bg-white/80 px-7 py-3.5 backdrop-blur">
                {t('homepage.landingHero.explore')} <ArrowDown size={17} />
              </a>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-forest-800">
              <span className="flex items-center gap-2"><Check size={16} className="text-jade-600" />{t('homepage.landingHero.proofFresh')}</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-jade-600" />{t('homepage.landingHero.proofPrepared')}</span>
              <span className="flex items-center gap-2"><Check size={16} className="text-jade-600" />{t('homepage.landingHero.proofLocal')}</span>
            </div>
            {deliverySelector}
          </div>
          {desktop3D ? (
            <Suspense fallback={<LightweightHeroVisual />}>
              <FreshGoHero3D />
            </Suspense>
          ) : <LightweightHeroVisual />}
        </div>
      </section>

      <section id="cara-freshgo" className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
            <div>
              <span className="text-sm font-bold uppercase tracking-[0.22em] text-jade-700">{t('homepage.story.eyebrow')}</span>
              <h2 className="mt-4 max-w-xl font-display text-4xl font-bold leading-tight text-forest-950 sm:text-5xl">{t('homepage.story.title')}</h2>
              <p className="mt-5 max-w-lg text-lg leading-8 text-gray-600">{t('homepage.story.description')}</p>
              {showCombos && <Link to="/combos" className="mt-7 inline-flex items-center gap-2 font-semibold text-forest-700 hover:text-forest-900">{t('homepage.story.comboCta')} <ArrowRight size={17} /></Link>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {steps.map(({ icon: Icon, title, desc }, index) => (
                <article key={title} className="group rounded-3xl border border-cream-300 bg-cream-50 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-forest-200 hover:bg-white hover:shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest-950 text-jade-300"><Icon size={23} /></span>
                    <span className="font-display text-3xl font-bold text-forest-300">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-forest-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{desc}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-cream-100 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-forest-950 px-6 py-12 sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14">
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-jade-500/20 blur-3xl" />
            <div className="relative max-w-2xl">
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-jade-300">{t('homepage.install.eyebrow')}</span>
              <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">{t('homepage.install.title')}</h2>
              <p className="mt-4 text-base leading-7 text-forest-200">{t('homepage.install.description')}</p>
            </div>
            {showShop && <LandingInstallActions />}
          </div>
        </div>
      </section>
    </>
  );
}
