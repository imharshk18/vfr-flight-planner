import type { AircraftProfile, WeightAndBalanceState } from "./aviation-types";

export type LoadingResult = {
  rampWeightLbs: number;
  takeoffWeightLbs: number;
  centerOfGravityIn: number;
  forwardLimitIn: number;
  aftLimitIn: number;
  weightLegal: boolean;
  cgLegal: boolean;
};

/**
 * Demo loading calculation using normal-category station arms. The selected
 * aircraft's actual equipment list and POH loading graph remain controlling.
 */
export function calculateLoading(
  aircraft: AircraftProfile,
  wb: WeightAndBalanceState
): LoadingResult {
  const frontArm = aircraft.frontSeatArmIn ?? 37;
  const rearArm = aircraft.rearSeatArmIn ?? 73;
  const fuelArm = aircraft.fuelArmIn ?? 48;
  const baggageArm = aircraft.baggageArmIn ?? 95;
  const emptyArm = aircraft.emptyArmIn ?? 39;
  const fuelWeight = wb.fuelGallons * 6;
  const rearWeight = wb.rearLeftWeightLbs + wb.rearRightWeightLbs;
  const rampWeightLbs =
    aircraft.emptyWeightLbs +
    wb.pilotWeightLbs +
    wb.passengerWeightLbs +
    rearWeight +
    wb.baggageLbs +
    fuelWeight;
  const moment =
    aircraft.emptyWeightLbs * emptyArm +
    (wb.pilotWeightLbs + wb.passengerWeightLbs) * frontArm +
    rearWeight * rearArm +
    fuelWeight * fuelArm +
    wb.baggageLbs * baggageArm;
  const centerOfGravityIn = moment / Math.max(1, rampWeightLbs);

  // C172S normal-category forward envelope: 35.0 in at 1,950 lb,
  // increasing linearly to 41.0 in at 2,550 lb. Other fleet profiles use
  // a conservative fixed forward limit until their POH envelope is modeled.
  const forwardLimitIn =
    aircraft.id === "c172s"
      ? rampWeightLbs <= 1950
        ? 35
        : Math.min(41, 35 + ((rampWeightLbs - 1950) / 600) * 6)
      : emptyArm - 4;
  const aftLimitIn = aircraft.aftCgLimitIn ?? emptyArm + 8;
  const maxRamp = aircraft.maxRampWeightLbs ?? aircraft.maxGrossWeightLbs;

  return {
    rampWeightLbs,
    // Allow roughly 1.3 gal / 8 lb for start, taxi, and run-up.
    takeoffWeightLbs: Math.max(0, rampWeightLbs - 8),
    centerOfGravityIn,
    forwardLimitIn,
    aftLimitIn,
    weightLegal: rampWeightLbs <= maxRamp,
    cgLegal: centerOfGravityIn >= forwardLimitIn && centerOfGravityIn <= aftLimitIn,
  };
}
