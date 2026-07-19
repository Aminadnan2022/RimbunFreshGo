import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export interface DeliveryConfig {
  days: string[];
  time: string;
  announcement: string;
  pickupLocations: string[];
}

interface DeliveryConfigContextType {
  config: DeliveryConfig;
  loading: boolean;
  updateConfig: (updates: Partial<DeliveryConfig>) => Promise<void>;
  refetch: () => Promise<void>;
}

const DEFAULT_PICKUP_LOCATIONS = [
  'Delivery to Lobby A Rimbun',
  'Delivery to Lobby B Rimbun',
  'Delivery to Security House Zamrud Blok E',
  'Delivery to Meja depan Surau Zamrud CD',
  'Delivery to Meja depan Zaeem Mart Zamrud Blok AB',
  'Delivery to Lobby A Mutiara',
  'Delivery to Lobby B Mutiara',
  'Delivery to Lobby C Mutiara',
  'Delivery to Security House Emas',
];

const DEFAULTS: DeliveryConfig = {
  days: ['Wednesday', 'Friday'],
  time: '6:30\u20138:00 PM',
  announcement: 'We deliver to your door every Wednesday & Friday, 6:30\u20138:00 PM',
  pickupLocations: DEFAULT_PICKUP_LOCATIONS,
};

const DeliveryConfigContext = createContext<DeliveryConfigContextType>({
  config: DEFAULTS,
  loading: true,
  updateConfig: async () => {},
  refetch: async () => {},
});

export function DeliveryConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DeliveryConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['delivery_days', 'delivery_time', 'announcement_message', 'pickup_locations']);

    if (!error && data) {
      const map: Record<string, unknown> = {};
      data.forEach((row) => { map[row.key] = row.value; });
      setConfig({
        days: (map.delivery_days as string[]) ?? DEFAULTS.days,
        time: (map.delivery_time as string) ?? DEFAULTS.time,
        announcement: (map.announcement_message as string) ?? DEFAULTS.announcement,
        pickupLocations: (map.pickup_locations as string[]) ?? DEFAULTS.pickupLocations,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const updateConfig = async (updates: Partial<DeliveryConfig>) => {
    const keyMap: Record<string, string> = {
      days: 'delivery_days',
      time: 'delivery_time',
      announcement: 'announcement_message',
      pickupLocations: 'pickup_locations',
    };
    for (const [field, value] of Object.entries(updates)) {
      const dbKey = keyMap[field];
      if (!dbKey) continue;
      const { error } = await supabase
        .from('site_settings')
        .upsert({ key: dbKey, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    }
    await fetchConfig();
  };

  return (
    <DeliveryConfigContext.Provider value={{ config, loading, updateConfig, refetch: fetchConfig }}>
      {children}
    </DeliveryConfigContext.Provider>
  );
}

export function useDeliveryConfig() {
  return useContext(DeliveryConfigContext);
}
