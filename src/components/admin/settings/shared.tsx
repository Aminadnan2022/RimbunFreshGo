import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Save, RefreshCcw } from 'lucide-react';
import { useLanguage } from '../../../context/LanguageContext';

export function SectionCard({
  icon: Icon,
  title,
  description,
  onRefresh,
  refreshTitle,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  onRefresh?: () => void;
  refreshTitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-soft p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-forest-50 flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-forest-700" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-forest-900 text-base">{title}</h2>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 rounded-xl text-gray-400 hover:text-forest-700 hover:bg-forest-50 transition-all"
            aria-label={refreshTitle}
            title={refreshTitle}
          >
            <RefreshCcw size={16} />
          </button>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  const cls = 'w-full bg-cream-50 border border-cream-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent transition-all';
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {textarea ? (
        <textarea rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
      ) : (
        <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-forest-600' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

export function SaveBar({
  hasChanges,
  saving,
  status,
  errorMsg,
  onSave,
  onReset,
}: {
  hasChanges: boolean;
  saving: boolean;
  status: 'idle' | 'success' | 'error';
  errorMsg?: string;
  onSave: () => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-cream-100">
      <div className="flex items-center gap-2">
        {status === 'success' && (
          <span className="flex items-center gap-1.5 text-green-700 text-sm">
            <CheckCircle2 size={16} /> {t('adminSettings.messages.saved')}
          </span>
        )}
        {status === 'error' && (
          <span className="flex items-center gap-1.5 text-red-600 text-sm">
            <AlertCircle size={16} /> {errorMsg}
          </span>
        )}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReset}
          disabled={!hasChanges || saving}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('adminSettings.buttons.reset')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!hasChanges || saving}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? t('adminSettings.messages.saving') : t('adminSettings.buttons.save')}
        </button>
      </div>
    </div>
  );
}
