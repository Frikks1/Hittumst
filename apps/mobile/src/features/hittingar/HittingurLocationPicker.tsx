import type { GeoCoordinate } from '@/types/domain';
import { LocationMapUnavailable } from './components';

export type HittingurLocationPickerProps = {
  value: GeoCoordinate | null;
  onChange: (value: GeoCoordinate) => void;
};

export default function HittingurLocationPicker(_: HittingurLocationPickerProps) {
  return <LocationMapUnavailable />;
}
