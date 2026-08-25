import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchNotifications, markNotificationRead, notificationAction, type AppNotification } from '../../data/notifications';
import { useLanguage } from '../../context/LanguageContext';
import PushNotificationControl from './PushNotificationControl';

export default function NotificationBell() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const refresh = () => fetchNotifications(8).then(setItems).catch(() => setItems([]));
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 60000); return () => window.clearInterval(timer); }, []);
  const unread = items.filter((item) => !item.read_at).length;
  const openItem = async (item: AppNotification) => {
    if (!item.read_at) await markNotificationRead(item.id).catch(() => undefined);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
    setOpen(false);
    navigate(notificationAction(item));
  };
  return <div className="relative">
    <button onClick={() => { setOpen((value) => !value); if (!open) refresh(); }} className="touch-target relative p-2.5 rounded-xl text-gray-500 hover:text-forest-700 hover:bg-forest-50" aria-label={t('notifications.bell')}>
      <Bell size={20} />
      {unread > 0 && <span className="absolute right-1 top-1 min-w-4 h-4 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] rounded-2xl border border-cream-200 bg-white p-2 shadow-xl z-50">
      <div className="flex items-center justify-between px-3 py-2"><strong className="text-sm text-charcoal">{t('notifications.title')}</strong><button onClick={() => { setOpen(false); navigate('/notifications'); }} className="text-xs font-semibold text-forest-700">{t('notifications.viewAll')}</button></div>
      {items.length === 0 ? <p className="px-3 py-6 text-center text-sm text-gray-500">{t('notifications.empty')}</p> : items.map((item) => <button key={item.id} onClick={() => openItem(item)} className={`block w-full rounded-xl px-3 py-3 text-left hover:bg-forest-50 ${item.read_at ? 'text-gray-500' : 'bg-cream-50 text-charcoal'}`}><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs line-clamp-2">{item.message}</p></button>)}
      <PushNotificationControl />
    </div>}
  </div>;
}
