function roundedAmount(value) {
  return Number(Number(value).toFixed(2));
}

export function normalizedAllInFromFuel({
  allIn,
  carrierFscTotal,
  normalizedFscTotal,
  linehaul = 0,
  borderFee = 0
}) {
  if (allIn !== null) {
    if (carrierFscTotal !== null && normalizedFscTotal !== null) {
      return roundedAmount(allIn - carrierFscTotal + normalizedFscTotal);
    }
    return allIn;
  }

  if (normalizedFscTotal === null || linehaul <= 0) return null;
  return roundedAmount(linehaul + borderFee + normalizedFscTotal);
}
