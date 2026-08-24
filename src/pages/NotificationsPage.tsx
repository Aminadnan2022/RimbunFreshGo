import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '../data/notifications';
import { useLanguage } from '../context/LanguageContext';

export default function NotificationsPage() {
  const { t } = useLanguage(); const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]); const [loading, setLoading] = useState(true);
  const refresh = () => fetchNotifications(100).then(setItems).finally(() => setLoading(false));
  useEffect(() => { refresh(); }, []);
  const openItem = async (item: AppNotification) => { if (!item.read_at) await markNotificationRead(item.id); navigate(item.action_url || '/notifications'); };
  const readAll = async () => { await markAllNotificationsRead(); refresh(); };
  return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6"><div className="mb-6 flex items-center justify-between"><div><h1 className="font-display text-3xl font-bold text-forest-900">{t('notifications.title')}</h1><p className="mt-1 text-sm text-gray-500">{t('notifications.subtitle')}</p></div><button onClick={readAll} className="inline-flex items-center gap-2 rounded-xl border border-forest-200 px-3 py-2 text-sm font-semibold text-forest-700 hover:bg-forest-50"><CheckCheck size={16}/>{t('notifications.markAllRead')}</button></div>
    {loading ? <p className="text-gray-500">{t('notifications.loading')}</p> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-cream-300 py-16 text-center text-gray-500"><Bell className="mx-auto mb-3"/>{t('notifications.empty')}</div> : <div className="space-y-2">{items.map((item) => <button key={item.id} onClick={() => openItem(item)} className={`block w-full rounded-2xl border p-4 text-left ${item.read_at ? 'border-cream-200 bg-white' : 'border-forest-200 bg-forest-50'}`}><div className="flex justify-between gap-4"><strong className="text-charcoal">{item.title}</strong>{!item.read_at && <span className="h-2 w-2 shrink-0 rounded-full bg-forest-600"/>}</div><p className="mt-1 text-sm text-gray-600">{item.message}</p><p className="mt-2 text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</p></button>)}</div>}</main>;
}
