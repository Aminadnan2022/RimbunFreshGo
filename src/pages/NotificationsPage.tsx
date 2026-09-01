import { useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, notificationAction, type AppNotification } from '../data/notifications';
import { useLanguage } from '../context/LanguageContext';
import PushNotificationControl from '../components/notifications/PushNotificationControl';
import { useAuth } from '../context/AuthContext';

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage(); const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]); const [loading, setLoading] = useState(true);
  const refresh = () => fetchNotifications(100).then(setItems).finally(() => setLoading(false));
  useEffect(() => {
    if (!user || user.is_anonymous === true) return;
    refresh();
  }, [user]);
  const openItem = async (item: AppNotification) => { if (!item.read_at) await markNotificationRead(item.id); navigate(notificationAction(item)); };
  const readAll = async () => { await markAllNotificationsRead(); refresh(); };
  if (!authLoading && (!user || user.is_anonymous === true)) return <Navigate to="/" replace />;
  return <main className="mx-auto w-full max-w-3xl min-w-0 px-4 py-6 sm:px-6 sm:py-10"><div className="mb-6 flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h1 className="break-words font-display text-2xl font-bold text-forest-900 sm:text-3xl">{t('notifications.title')}</h1><p className="mt-1 break-words text-sm text-gray-500">{t('notifications.subtitle')}</p></div><button onClick={readAll} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-forest-200 px-3 py-2 text-sm font-semibold text-forest-700 hover:bg-forest-50"><CheckCheck className="shrink-0" size={16}/>{t('notifications.markAllRead')}</button></div>
    <div className="mb-6 min-w-0"><PushNotificationControl /></div>
    {loading ? <p className="text-gray-500">{t('notifications.loading')}</p> : items.length === 0 ? <div className="rounded-2xl border border-dashed border-cream-300 px-4 py-16 text-center text-gray-500"><Bell className="mx-auto mb-3"/>{t('notifications.empty')}</div> : <div className="min-w-0 space-y-2">{items.map((item) => <button key={item.id} onClick={() => openItem(item)} className={`block w-full min-w-0 rounded-2xl border p-4 text-left ${item.read_at ? 'border-cream-200 bg-white' : 'border-forest-200 bg-forest-50'}`}><div className="flex min-w-0 justify-between gap-4"><strong className="min-w-0 break-words text-charcoal">{item.title}</strong>{!item.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-forest-600"/>}</div><p className="mt-1 break-words text-sm leading-6 text-gray-600">{item.message}</p><p className="mt-2 break-words text-xs text-gray-400">{new Date(item.created_at).toLocaleString()}</p></button>)}</div>}</main>;
}
