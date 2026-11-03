// Categorical slots 1-3 of the validated reference palette (all-pairs safe for 3 series).
// Colour follows the entity: a branch keeps its colour whichever branches are shown.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"];
export const BRANCH_ORDER = ["SYG", "SNR", "PTM"];
export const branchColor = (id: string) => SERIES[BRANCH_ORDER.indexOf(id)] ?? SERIES[0];
