import { Link } from 'react-router-dom';
import { Instagram, Facebook, Youtube, Linkedin, Phone, Mail, MapPin, MessageCircle } from 'lucide-react';
import type { FooterSettings, WebsiteSettings } from '../../types';
import type { DeliveryConfig } from '../../context/DeliveryConfigContext';
import { isPageEnabled } from '../../lib/websiteVisibility';
import BrandLogo from '../branding/BrandLogo';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

function isValidUrl(url: string): boolean {
  if (!url || !url.trim()) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function whatsappHref(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : '#';
}

function TikTokIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

function ThreadsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.25 8.31c-1.08-2.72-3.38-4.31-6.52-4.31-4.3 0-7.23 2.98-7.23 7.47 0 4.72 3.05 7.53 7.44 7.53 4.31 0 6.31-2.63 6.31-4.73 0-1.68-1.08-3.02-3.06-3.02-1.63 0-2.81.96-3.11 2.44 0 0-.49 2.56 1.43 3.24-1.2.84-3.35.2-3.35-2.86 0-4.06 2.77-6.35 6.02-6.35 3.24 0 4.52 1.78 4.52 3.38 0 1.31-.98 2.36-2.31 2.36-1.2 0-1.95-.72-1.95-1.77 0-.8.54-1.43 1.31-1.52" />
    </svg>
  );
}

function XIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export default function FooterContent({
  footer,
  website,
  delivery,
  t,
}: {
  footer: FooterSettings;
  website: WebsiteSettings;
  delivery: DeliveryConfig;
  t: TFunc;
}) {
  const daysText = delivery.days.length > 1
    ? `${delivery.days.slice(0, -1).join(', ')} & ${delivery.days[delivery.days.length - 1]}`
    : delivery.days[0] ?? '';

  const description = footer.footer_description.replace(/\{\{days\}\}/g, daysText);
  const copyright = footer.copyright_text.replace(/\{\{year\}\}/g, String(new Date().getFullYear()));

  const showShop = footer.footer_show_shop && isPageEnabled(website, 'shop');
  const showFamilyCombo = footer.footer_show_family_combo && isPageEnabled(website, 'family_combo');

  const infoLinks: { to: string; label: string; show: boolean }[] = [
    { to: '/vendors', label: t('footer.ourSuppliers'), show: footer.footer_show_suppliers && isPageEnabled(website, 'suppliers') },
    { to: '/recurring', label: t('footer.recurringBasket'), show: footer.footer_show_recurring_basket && isPageEnabled(website, 'recurring_basket') },
    { to: '/how-it-works', label: t('footer.howItWorks'), show: footer.footer_show_how_it_works },
    { to: '/faq', label: t('footer.faq'), show: footer.footer_show_faq },
  ].filter((link) => link.show);

  const socials = ([
    { key: 'social_facebook', label: 'Facebook', icon: Facebook },
    { key: 'social_instagram', label: 'Instagram', icon: Instagram },
    { key: 'social_tiktok', label: 'TikTok', icon: TikTokIcon },
    { key: 'social_threads', label: 'Threads', icon: ThreadsIcon },
    { key: 'social_youtube', label: 'YouTube', icon: Youtube },
    { key: 'social_linkedin', label: 'LinkedIn', icon: Linkedin },
    { key: 'social_x', label: 'X', icon: XIcon },
  ] as { key: keyof FooterSettings; label: string; icon: React.ElementType }[])
    .filter((s) => isValidUrl(String(footer[s.key])));

  return (
    <footer className="bg-forest-950 text-white mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <BrandLogo size="w-9 h-9" iconSize={18} alt={website.site_name} />
              <span className="font-display font-bold text-white text-lg">{website.site_name}</span>
            </div>
            <p className="text-sm text-forest-300 leading-relaxed mb-5">{description}</p>
            {socials.length > 0 && (
              <div className="flex gap-3">
                {socials.map(({ key, label, icon: Icon }) => (
                  <a
                    key={key}
                    href={String(footer[key])}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-xl bg-forest-800 hover:bg-jade-600 flex items-center justify-center transition-colors"
                  >
                    <Icon size={16} />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Shop */}
          {showShop && (
            <div>
              <h3 className="font-semibold text-white mb-4">{t('footer.shop')}</h3>
              <ul className="space-y-2.5 text-sm text-forest-300">
                <li><Link to="/shop?category=chicken" className="hover:text-jade-400 transition-colors">{t('footer.chicken')}</Link></li>
                <li><Link to="/shop?category=fish" className="hover:text-jade-400 transition-colors">{t('footer.fish')}</Link></li>
                <li><Link to="/shop?category=prawns" className="hover:text-jade-400 transition-colors">{t('footer.prawns')}</Link></li>
                <li><Link to="/shop?category=squid" className="hover:text-jade-400 transition-colors">{t('footer.squid')}</Link></li>
                {showFamilyCombo && (
                  <li><Link to="/combos" className="hover:text-jade-400 transition-colors">{t('footer.familyCombo')}</Link></li>
                )}
              </ul>
            </div>
          )}

          {/* Info */}
          {infoLinks.length > 0 && (
            <div>
              <h3 className="font-semibold text-white mb-4">{t('footer.information')}</h3>
              <ul className="space-y-2.5 text-sm text-forest-300">
                {infoLinks.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="hover:text-jade-400 transition-colors">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4">{t('footer.contact')}</h3>
            <ul className="space-y-3 text-sm text-forest-300">
              {footer.contact_phone && (
                <li className="flex items-start gap-2.5">
                  <Phone size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                  <a href={`tel:${footer.contact_phone.replace(/[^\d+]/g, '')}`} className="hover:text-jade-400 transition-colors">{footer.contact_phone}</a>
                </li>
              )}
              {footer.contact_whatsapp && (
                <li className="flex items-start gap-2.5">
                  <MessageCircle size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                  <a href={whatsappHref(footer.contact_whatsapp)} target="_blank" rel="noopener noreferrer" className="hover:text-jade-400 transition-colors">{footer.contact_whatsapp}</a>
                </li>
              )}
              {footer.contact_email && (
                <li className="flex items-start gap-2.5">
                  <Mail size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                  <a href={`mailto:${footer.contact_email}`} className="hover:text-jade-400 transition-colors">{footer.contact_email}</a>
                </li>
              )}
              {footer.contact_address && (
                <li className="flex items-start gap-2.5">
                  <MapPin size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                  <span>{footer.contact_address}</span>
                </li>
              )}
              {footer.delivery_area && (
                <li className="flex items-start gap-2.5">
                  <MapPin size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                  <span>{footer.delivery_area}</span>
                </li>
              )}
            </ul>
            {delivery.days.length > 0 && delivery.time && (
              <div className="mt-5 p-3 bg-forest-900 rounded-2xl">
                <p className="text-xs font-semibold text-jade-400 mb-1">{t('footer.deliverySchedule')}</p>
                <p className="text-xs text-forest-300">{daysText}</p>
                <p className="text-xs text-forest-300">{delivery.time}</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-forest-800 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-forest-400">
          <p>{copyright}</p>
          {(footer.footer_show_privacy || footer.footer_show_terms) && (
            <div className="flex gap-4">
              {footer.footer_show_privacy && <Link to="/privacy" className="hover:text-jade-400 transition-colors">{t('footer.privacy')}</Link>}
              {footer.footer_show_terms && <a href="#" className="hover:text-jade-400 transition-colors">{t('footer.terms')}</a>}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
