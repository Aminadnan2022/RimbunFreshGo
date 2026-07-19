import { Truck } from 'lucide-react';
import { useDeliveryConfig } from '../../context/DeliveryConfigContext';

export default function AnnouncementBar() {
  const { config, loading } = useDeliveryConfig();

  return (
    <div className="gradient-forest text-white py-2.5 px-4 text-center text-sm font-medium">
      <div className="flex items-center justify-center gap-2">
        <Truck size={15} className="opacity-90 flex-shrink-0" />
        <span>{loading ? 'Loading...' : config.announcement}</span>
      </div>
    </div>
  );
}
