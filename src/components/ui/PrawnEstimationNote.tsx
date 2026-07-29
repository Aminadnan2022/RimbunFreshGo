import EstimatedQuantityNote from './EstimatedQuantityNote';

interface Props {
  weightGrams: number;
}

const PRAWN_AVG_WEIGHT = 29;

export default function PrawnEstimationNote({ weightGrams }: Props) {
  return <EstimatedQuantityNote weightGrams={weightGrams} averageWeight={PRAWN_AVG_WEIGHT} unitLabel="prawns" />;
}
