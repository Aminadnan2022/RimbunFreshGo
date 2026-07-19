import { Link } from 'react-router-dom';
import { Leaf, Instagram, Facebook, Phone, Mail, MapPin } from 'lucide-react';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';

export default function Footer() {
  const { config } = useDeliveryConfig();

  const daysText = config.days.length > 1
    ? `${config.days.slice(0, -1).join(', ')} & ${config.days[config.days.length - 1]}`
    : config.days[0] ?? '';

  return (
    <footer className="bg-forest-950 text-white mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 gradient-card rounded-xl flex items-center justify-center">
                <Leaf size={18} className="text-white" />
              </div>
              <div>
                <span className="font-display font-bold text-white text-lg">Rimbun</span>
                <span className="font-display font-bold text-jade-400 text-lg"> FreshGo</span>
              </div>
            </div>
            <p className="text-sm text-forest-300 leading-relaxed mb-5">
              Freshly prepared daily proteins, delivered to your door every {daysText}. Never frozen. Always local.
            </p>
            <div className="flex gap-3">
              <a href="#" aria-label="Instagram" className="w-9 h-9 rounded-xl bg-forest-800 hover:bg-jade-600 flex items-center justify-center transition-colors">
                <Instagram size={16} />
              </a>
              <a href="#" aria-label="Facebook" className="w-9 h-9 rounded-xl bg-forest-800 hover:bg-jade-600 flex items-center justify-center transition-colors">
                <Facebook size={16} />
              </a>
            </div>
          </div>

          {/* Shop */}
          <div>
            <h3 className="font-semibold text-white mb-4">Shop</h3>
            <ul className="space-y-2.5 text-sm text-forest-300">
              {[
                { to: '/shop?category=chicken', label: 'Chicken' },
                { to: '/shop?category=fish', label: 'Fish' },
                { to: '/shop?category=prawns', label: 'Prawns' },
                { to: '/shop?category=squid', label: 'Squid' },
                { to: '/combo', label: 'Family Combo RM50' },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-jade-400 transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h3 className="font-semibold text-white mb-4">Information</h3>
            <ul className="space-y-2.5 text-sm text-forest-300">
              {[
                { to: '/vendors', label: 'Our Suppliers' },
                { to: '/recurring', label: 'Recurring Baskets' },
                { to: '/how-it-works', label: 'How It Works' },
                { to: '/faq', label: 'FAQ' },
              ].map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-jade-400 transition-colors">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4">Contact</h3>
            <ul className="space-y-3 text-sm text-forest-300">
              <li className="flex items-start gap-2.5">
                <Phone size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                <span>+60 12-345 6789</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                <span>hello@rimbunfreshgo.my</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin size={15} className="mt-0.5 flex-shrink-0 text-jade-400" />
                <span>Delivering across Klang Valley, Selangor</span>
              </li>
            </ul>
            <div className="mt-5 p-3 bg-forest-900 rounded-2xl">
              <p className="text-xs font-semibold text-jade-400 mb-1">Delivery Schedule</p>
              <p className="text-xs text-forest-300">{daysText}</p>
              <p className="text-xs text-forest-300">{config.time}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-forest-800 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-forest-400">
          <p>&copy; {new Date().getFullYear()} Rimbun FreshGo. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-jade-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-jade-400 transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
