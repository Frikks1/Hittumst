import { MapUnavailable } from './components';
import type { HittingurListModel } from './model';

export type HittingarMapProps = {
  items: HittingurListModel[];
  onSelect: (id: string) => void;
};

export default function HittingarMap(props: HittingarMapProps) {
  return <MapUnavailable {...props} />;
}
